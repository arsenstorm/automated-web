/**
 * Replay resume paths against the fake browser: auto-resume, user-click
 * completion, and self-healing skipped/re-run steps. Tab-targeted messaging
 * isn't implemented by fake-browser, so `sendMessage` is mocked to stand in
 * for the content-script executor.
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
import {
  CLICK,
  liveTabId,
  NAV,
  pausedRun,
  THREE_STEPS,
} from "./replay-fixtures";
import {
  completeUserClick,
  continueRun,
  maybeAutoResume,
} from "./replay-resume";
import { setSecure } from "./vault";

vi.mock("@/lib/messaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messaging")>()),
  sendMessage: vi.fn(),
}));
const sendMessageMock = vi.mocked(sendMessage);

describe("replay resume paths", () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    sendMessageMock.mockReset();
    sendMessageMock.mockResolvedValue({ ok: true } as never);
    await setSecure("workflows", [THREE_STEPS]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  describe("completeUserClick", () => {
    const USER_CLICK = { id: "s2", kind: "user-click" } as const;
    const CLICK_FLOW: Workflow = {
      ...THREE_STEPS,
      steps: [NAV, USER_CLICK, CLICK],
    };
    const userClickRun = (tabId: number): RunState => ({
      id: "run-1",
      pausedReason: "user-click: click it",
      status: "paused",
      stepIndex: 1,
      tabId,
      tabs: { 0: tabId },
      workflowId: "wf-1",
    });

    beforeEach(() => {
      // Disarm broadcasts through webNavigation; fake-browser lacks it.
      Object.assign(fakeBrowser, {
        webNavigation: {
          getAllFrames: vi.fn().mockResolvedValue([{ frameId: 0 }]),
        },
      });
    });

    it("stores the click output and advances past the step", async () => {
      await setSecure("workflows", [CLICK_FLOW]);
      const tabId = await liveTabId();
      await setStored("run", userClickRun(tabId));
      await completeUserClick("picked", tabId);
      const run = await getStored("run");
      expect(run?.outputs?.s2).toBe("picked");
      expect(run?.stepIndex).toBeGreaterThan(1);
    });

    it("ignores a click from a tab other than the step's", async () => {
      await setSecure("workflows", [CLICK_FLOW]);
      const tabId = await liveTabId();
      await setStored("run", userClickRun(tabId));
      await completeUserClick("picked", 999_999);
      const run = await getStored("run");
      expect(run?.status).toBe("paused");
      expect(run?.stepIndex).toBe(1);
      expect(run?.outputs).toBeUndefined();
    });
  });

  describe("self-heal on resume", () => {
    // Two identical clicks the user performed by hand while paused.
    const HEAL_FLOW: Workflow = { ...THREE_STEPS, steps: [NAV, CLICK, CLICK] };
    const clickEvent = (tabId: number): RecordedEvent => ({
      action: CLICK,
      origin: "https://example.com",
      tabId,
      ts: 200,
    });

    it("fast-forwards past steps the user already did (heal: true)", async () => {
      await setSecure("workflows", [HEAL_FLOW]);
      const tabId = await liveTabId();
      await setStored("run", {
        ...pausedRun(tabId, 1),
        pausedAt: 100,
      });
      await setSecure("events", [clickEvent(tabId), clickEvent(tabId)]);
      await continueRun({ heal: true, skip: false });
      const run = await getStored("run");
      expect(run?.status).toBe("done");
      // Both steps were healed away — neither dispatched to the content script.
      expect(
        sendMessageMock.mock.calls.filter(([name]) => name === "executeStep")
      ).toHaveLength(0);
    });

    it("re-runs the steps itself when heal is off", async () => {
      await setSecure("workflows", [HEAL_FLOW]);
      const tabId = await liveTabId();
      await setStored("run", {
        ...pausedRun(tabId, 1),
        pausedAt: 100,
      });
      await setSecure("events", [clickEvent(tabId), clickEvent(tabId)]);
      await continueRun({ heal: false, skip: false });
      const run = await getStored("run");
      expect(run?.status).toBe("done");
      expect(
        sendMessageMock.mock.calls.filter(([name]) => name === "executeStep")
      ).toHaveLength(2);
    });
  });

  describe("multi-tab self-heal", () => {
    const CLICK_TAB1 = { ...CLICK, tab: 1 } as const;
    const MULTI_FLOW: Workflow = {
      ...THREE_STEPS,
      steps: [NAV, CLICK_TAB1],
    };
    const clickEvent = (tabId: number): RecordedEvent => ({
      action: CLICK,
      origin: "https://example.com",
      tabId,
      ts: 200,
    });
    const multiRun = (tabA: number, tabB: number): RunState => ({
      id: "run-1",
      pausedAt: 100,
      pausedReason: "captcha",
      status: "paused",
      stepIndex: 1,
      tabId: tabA,
      tabs: { 0: tabA, 1: tabB },
      workflowId: "wf-1",
    });

    it("heals a tab:1 step from an event on that tab", async () => {
      await setSecure("workflows", [MULTI_FLOW]);
      const tabA = await liveTabId();
      const tabB = await liveTabId();
      await setStored("run", multiRun(tabA, tabB));
      await setSecure("events", [clickEvent(tabB)]);
      await continueRun({ heal: true, skip: false });
      const run = await getStored("run");
      expect(run?.status).toBe("done");
      expect(
        sendMessageMock.mock.calls.filter(([name]) => name === "executeStep")
      ).toHaveLength(0);
    });

    it("does not heal a tab:1 step from an event on tab 0", async () => {
      await setSecure("workflows", [MULTI_FLOW]);
      const tabA = await liveTabId();
      const tabB = await liveTabId();
      await setStored("run", multiRun(tabA, tabB));
      await setSecure("events", [clickEvent(tabA)]);
      await continueRun({ heal: true, skip: false });
      // No heal match, so the step runs for real in tab B.
      expect(
        sendMessageMock.mock.calls.filter(([name]) => name === "executeStep")
      ).toHaveLength(1);
    });
  });
});
