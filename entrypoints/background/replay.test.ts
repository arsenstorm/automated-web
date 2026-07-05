/**
 * Replay orchestration against the fake browser: state transitions for
 * interruption, dead tabs, skip/resume, and the step loop. Tab-targeted
 * messaging isn't implemented by fake-browser, so `sendMessage` is mocked to
 * stand in for the content-script executor. `startRun` stays untested — it
 * hinges on real tab-load timing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { sendMessage } from "@/lib/messaging";
import { getStored, setStored } from "@/lib/storage";
import type { RunState, Workflow } from "@/lib/types";
import { continueRun, pauseInterruptedRun } from "./replay";
import { setSecure } from "./vault";

vi.mock("@/lib/messaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messaging")>()),
  sendMessage: vi.fn(),
}));
const sendMessageMock = vi.mocked(sendMessage);

const CLICK = { kind: "click", selector: "#go" } as const;
const NAV = { kind: "navigate", url: "https://example.com/" } as const;
const THREE_STEPS: Workflow = {
  id: "wf-1",
  name: "Test flow",
  origin: "https://example.com",
  fingerprint: "fp",
  createdAt: 0,
  steps: [{ kind: "navigate", url: "https://example.com/" }, CLICK, CLICK],
};

const pausedRun = (tabId: number, stepIndex: number): RunState => ({
  id: "run-1",
  workflowId: "wf-1",
  tabId,
  stepIndex,
  status: "paused",
  pausedReason: "captcha",
});

const liveTabId = async (): Promise<number> => {
  const tab = await fakeBrowser.tabs.create({ url: "https://example.com/" });
  return tab.id ?? 0;
};

describe("replay orchestration", () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    sendMessageMock.mockReset();
    sendMessageMock.mockResolvedValue({ ok: true } as never);
    await setSecure("workflows", [THREE_STEPS]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pauses a running run after a service-worker restart", async () => {
    await setStored("run", {
      ...pausedRun(1, 1),
      status: "running",
      pausedReason: undefined,
    });
    await pauseInterruptedRun();
    const run = await getStored("run");
    expect(run?.status).toBe("paused");
    expect(run?.pausedReason).toContain("interrupted");
  });

  it("leaves a missing run alone on restart", async () => {
    await pauseInterruptedRun();
    expect(await getStored("run")).toBeNull();
  });

  it("re-pauses with a reason when the run's tab is gone", async () => {
    // Real Chrome rejects tabs.get for unknown ids; fake-browser resolves
    // undefined, so reproduce the rejection.
    vi.spyOn(fakeBrowser.tabs, "get").mockRejectedValueOnce(
      new Error("No tab with id")
    );
    await setStored("run", pausedRun(999_999, 1));
    await continueRun({ skip: false });
    const run = await getStored("run");
    expect(run?.status).toBe("paused");
    expect(run?.pausedReason).toBe("tab was closed");
  });

  it("clears the run when its workflow was deleted", async () => {
    await setSecure("workflows", []);
    await setStored("run", pausedRun(await liveTabId(), 1));
    await continueRun({ skip: false });
    expect(await getStored("run")).toBeNull();
  });

  it("finishes when skipping the final step", async () => {
    await setStored("run", pausedRun(await liveTabId(), 2));
    await continueRun({ skip: true });
    expect((await getStored("run"))?.status).toBe("done");
  });

  it("resumes and runs the remaining steps to done", async () => {
    await setStored("run", pausedRun(await liveTabId(), 1));
    await continueRun({ skip: false });
    const run = await getStored("run");
    expect(run?.status).toBe("done");
    expect(run?.stepIndex).toBe(3);
  });

  it("pauses again when a resumed step fails", async () => {
    sendMessageMock.mockResolvedValue({
      ok: false,
      reason: "captcha",
    } as never);
    await setStored("run", pausedRun(await liveTabId(), 1));
    await continueRun({ skip: false });
    const run = await getStored("run");
    expect(run?.status).toBe("paused");
    expect(run?.pausedReason).toBe("captcha");
  });

  it("pauses when the content script is unreachable", async () => {
    sendMessageMock.mockRejectedValue(new Error("no receiver"));
    await setStored("run", pausedRun(await liveTabId(), 1));
    await continueRun({ skip: false });
    const run = await getStored("run");
    expect(run?.status).toBe("paused");
    expect(run?.pausedReason).toContain("tab not reachable");
  });

  it("pauses on a pause step, and a plain resume advances past it", async () => {
    await setSecure("workflows", [
      {
        ...THREE_STEPS,
        steps: [NAV, CLICK, { kind: "pause" }, CLICK],
      },
    ]);
    await setStored("run", pausedRun(await liveTabId(), 1));
    await continueRun({ skip: false });
    let run = await getStored("run");
    expect(run?.status).toBe("paused");
    expect(run?.pausedReason).toContain("pause");
    await continueRun({ skip: false });
    run = await getStored("run");
    expect(run?.status).toBe("done");
  });

  it("completes a sleep step and moves on", async () => {
    await setSecure("workflows", [
      {
        ...THREE_STEPS,
        steps: [NAV, { kind: "sleep", ms: 1 }, CLICK],
      },
    ]);
    await setStored("run", pausedRun(await liveTabId(), 1));
    await continueRun({ skip: false });
    expect((await getStored("run"))?.status).toBe("done");
  });

  it("captures extract output and substitutes it into a later input", async () => {
    sendMessageMock.mockImplementation((_name, data) => {
      const step = (data as { step: { kind: string } }).step;
      return Promise.resolve(
        step.kind === "extract" ? { ok: true, output: "$5" } : { ok: true }
      ) as never;
    });
    await setSecure("workflows", [
      {
        ...THREE_STEPS,
        steps: [
          NAV,
          { id: "s2", kind: "extract", selector: ".price" },
          {
            id: "s3",
            kind: "input",
            selector: "#note",
            value: "was {{s2}}",
            sensitive: false,
          },
        ],
      },
    ]);
    await setStored("run", pausedRun(await liveTabId(), 1));
    await continueRun({ skip: false });
    const run = await getStored("run");
    expect(run?.status).toBe("done");
    expect(run?.outputs).toEqual({ s2: "$5" });
    const inputCall = sendMessageMock.mock.calls.find(
      ([, data]) =>
        (data as { step?: { kind?: string } })?.step?.kind === "input"
    );
    expect((inputCall?.[1] as { step: { value: string } }).step.value).toBe(
      "was $5"
    );
  });

  it("dispatches frameless steps explicitly to the main frame", async () => {
    const tabId = await liveTabId();
    await setStored("run", pausedRun(tabId, 1));
    await continueRun({ skip: false });
    const call = sendMessageMock.mock.calls.find(
      ([name]) => name === "executeStep"
    );
    expect(call?.[2]).toEqual({ tabId, frameId: 0 });
  });

  it("dispatches an iframe step to its matching frame", async () => {
    const frameUrl = "https://widget.example.com/form";
    // fake-browser doesn't model webNavigation; stub the frame listing.
    Object.assign(fakeBrowser, {
      webNavigation: {
        getAllFrames: vi.fn().mockResolvedValue([
          { frameId: 0, url: "https://example.com/" },
          { frameId: 5, url: `${frameUrl}?token=zzz` },
        ]),
      },
    });
    await setSecure("workflows", [
      {
        ...THREE_STEPS,
        steps: [NAV, { ...CLICK, frameUrl }],
      },
    ]);
    const tabId = await liveTabId();
    await setStored("run", pausedRun(tabId, 1));
    await continueRun({ skip: false });
    expect((await getStored("run"))?.status).toBe("done");
    const call = sendMessageMock.mock.calls.find(
      ([name]) => name === "executeStep"
    );
    expect(call?.[2]).toEqual({ tabId, frameId: 5 });
  });

  it("pauses when the step's frame is gone", async () => {
    Object.assign(fakeBrowser, {
      webNavigation: {
        getAllFrames: vi
          .fn()
          .mockResolvedValue([{ frameId: 0, url: "https://example.com/" }]),
      },
    });
    await setSecure("workflows", [
      {
        ...THREE_STEPS,
        steps: [NAV, { ...CLICK, frameUrl: "https://gone.example.com/x" }],
      },
    ]);
    await setStored("run", pausedRun(await liveTabId(), 1));
    await continueRun({ skip: false });
    const run = await getStored("run");
    expect(run?.status).toBe("paused");
    expect(run?.pausedReason).toContain("frame not found");
  });

  it("pauses with missing-output when a token has no value yet", async () => {
    await setSecure("workflows", [
      {
        ...THREE_STEPS,
        steps: [
          NAV,
          {
            id: "s2",
            kind: "input",
            selector: "#note",
            value: "{{s9}}",
            sensitive: false,
          },
        ],
      },
    ]);
    await setStored("run", pausedRun(await liveTabId(), 1));
    await continueRun({ skip: false });
    const run = await getStored("run");
    expect(run?.status).toBe("paused");
    expect(run?.pausedReason).toContain("missing-output");
  });
});
