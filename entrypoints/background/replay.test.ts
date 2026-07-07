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
import {
  DEFAULT_SETTINGS,
  type RecordedEvent,
  type RunState,
  type Workflow,
} from "@/lib/types";
import { continueRun, maybeAutoResume, pauseInterruptedRun } from "./replay";
import { setSecure } from "./vault";

vi.mock("@/lib/messaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messaging")>()),
  sendMessage: vi.fn(),
}));
const sendMessageMock = vi.mocked(sendMessage);

const CLICK = { kind: "click", selector: "#go" } as const;
const NAV = { kind: "navigate", url: "https://example.com/" } as const;
const THREE_STEPS: Workflow = {
  createdAt: 0,
  fingerprint: "fp",
  id: "wf-1",
  name: "Test flow",
  origin: "https://example.com",
  steps: [{ kind: "navigate", url: "https://example.com/" }, CLICK, CLICK],
};

const pausedRun = (tabId: number, stepIndex: number): RunState => ({
  id: "run-1",
  pausedReason: "captcha",
  status: "paused",
  stepIndex,
  tabId,
  workflowId: "wf-1",
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
      pausedReason: undefined,
      status: "running",
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
      const { step } = data as { step: { kind: string } };
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
            sensitive: false,
            value: "was {{s2}}",
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
        (data as { step?: { kind?: string } }).step?.kind === "input"
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
    expect(call?.[2]).toEqual({ frameId: 0, tabId });
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
    expect(call?.[2]).toEqual({ frameId: 5, tabId });
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

  describe("maybeAutoResume", () => {
    const PASSWORD = {
      kind: "input",
      selector: "#pw",
      sensitive: true,
      value: "",
    } as const;
    const SUBMIT = { kind: "submit", selector: "form" } as const;
    const LOGIN_FLOW: Workflow = {
      ...THREE_STEPS,
      steps: [NAV, PASSWORD, SUBMIT, CLICK],
    };
    const userEvent = (
      action: RecordedEvent["action"],
      tabId: number
    ): RecordedEvent => ({
      action,
      origin: "https://example.com",
      tabId,
      ts: 200,
    });
    const secretPause = (tabId: number): RunState => ({
      ...pausedRun(tabId, 1),
      pausedAt: 100,
      pausedReason: "secret: no stored value",
    });

    it("resumes once the user typed the password and submitted", async () => {
      await setSecure("workflows", [LOGIN_FLOW]);
      await setStored("settings", { ...DEFAULT_SETTINGS, autoResume: true });
      const tabId = await liveTabId();
      await setStored("run", secretPause(tabId));
      await setSecure("events", [
        userEvent(PASSWORD, tabId),
        userEvent(SUBMIT, tabId),
      ]);
      await maybeAutoResume(tabId);
      const run = await getStored("run");
      expect(run?.status).toBe("done");
    });

    it("stays paused on the password input alone (no submit yet)", async () => {
      await setSecure("workflows", [LOGIN_FLOW]);
      await setStored("settings", { ...DEFAULT_SETTINGS, autoResume: true });
      const tabId = await liveTabId();
      await setStored("run", secretPause(tabId));
      await setSecure("events", [userEvent(PASSWORD, tabId)]);
      await maybeAutoResume(tabId);
      expect((await getStored("run"))?.status).toBe("paused");
    });

    it("does nothing when the setting is off", async () => {
      await setSecure("workflows", [LOGIN_FLOW]);
      const tabId = await liveTabId();
      await setStored("run", secretPause(tabId));
      await setSecure("events", [
        userEvent(PASSWORD, tabId),
        userEvent(SUBMIT, tabId),
      ]);
      await maybeAutoResume(tabId);
      expect((await getStored("run"))?.status).toBe("paused");
    });
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
            sensitive: false,
            value: "{{s9}}",
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
