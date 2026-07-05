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
});
