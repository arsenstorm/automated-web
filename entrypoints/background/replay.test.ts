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
import {
  completeUserClick,
  continueRun,
  maybeAutoResume,
  pauseInterruptedRun,
  watchSpawnedTabs,
} from "./replay";
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

  describe("cross-tab navigate: tab materialization", () => {
    const NAV_TAB1 = {
      kind: "navigate",
      tab: 1,
      url: "https://two.example.com/",
    } as const;
    const CLICK_TAB1 = { ...CLICK, tab: 1 } as const;
    const SPAWN_FLOW: Workflow = {
      ...THREE_STEPS,
      steps: [NAV, CLICK, NAV_TAB1, CLICK_TAB1],
    };
    const spawnRun = (tabA: number): RunState => ({
      ...pausedRun(tabA, 2),
      tabs: { 0: tabA },
    });

    beforeEach(async () => {
      // fakeBrowser.reset() dropped the startup listener; re-register, then
      // overwrite module-state recentSpawn left over from an earlier test
      // with a spawn no run ever owns.
      watchSpawnedTabs();
      await fakeBrowser.tabs.onCreated.trigger({
        id: -2,
        openerTabId: -1,
      } as never);
      // Fake tabs carry no status; report "complete" so waitForTabComplete
      // resolves instead of riding out its 30s timeout.
      const realGet = fakeBrowser.tabs.get.bind(fakeBrowser.tabs);
      vi.spyOn(fakeBrowser.tabs, "get").mockImplementation(async (id) => ({
        ...(await realGet(id)),
        status: "complete",
      }));
      await setSecure("workflows", [SPAWN_FLOW]);
    });

    it("adopts the tab the previous click spawned", async () => {
      const tabA = await liveTabId();
      // A real fake tab on an unrelated origin, so only spawn-adoption (not
      // URL matching) can pick it.
      const spawned = await fakeBrowser.tabs.create({
        url: "https://three.example.com/draft/123",
      });
      await fakeBrowser.tabs.onCreated.trigger({
        ...spawned,
        openerTabId: tabA,
      });
      const before = (await fakeBrowser.tabs.query({})).length;
      await setStored("run", spawnRun(tabA));
      await continueRun({ skip: false });
      const run = await getStored("run");
      expect(run?.status).toBe("done");
      expect(run?.tabs?.[1]).toBe(spawned.id);
      expect((await fakeBrowser.tabs.query({})).length).toBe(before);
    });

    it("adopts a tab spawned during the late-spawn window", async () => {
      const tabA = await liveTabId();
      const spawned = await fakeBrowser.tabs.create({
        url: "https://three.example.com/x",
      });
      const before = (await fakeBrowser.tabs.query({})).length;
      await setStored("run", spawnRun(tabA));
      // No spawn recorded up front; it lands mid-wait instead.
      setTimeout(() => {
        fakeBrowser.tabs.onCreated
          .trigger({ ...spawned, openerTabId: tabA })
          .catch(() => null);
      }, 100);
      const started = Date.now();
      await continueRun({ skip: false });
      // Well under SPAWN_WAIT_MS: the listener resolved early, not the timer.
      expect(Date.now() - started).toBeLessThan(1500);
      const run = await getStored("run");
      expect(run?.status).toBe("done");
      expect(run?.tabs?.[1]).toBe(spawned.id);
      expect((await fakeBrowser.tabs.query({})).length).toBe(before);
    });

    it("reuses an existing tab on the target URL when nothing spawned", async () => {
      const tabA = await liveTabId();
      const existing = await fakeBrowser.tabs.create({
        url: "https://two.example.com/",
      });
      const before = (await fakeBrowser.tabs.query({})).length;
      await setStored("run", spawnRun(tabA));
      await continueRun({ skip: false });
      const run = await getStored("run");
      expect(run?.status).toBe("done");
      expect(run?.tabs?.[1]).toBe(existing.id);
      expect((await fakeBrowser.tabs.query({})).length).toBe(before);
    });

    it("creates a fresh tab when nothing spawned and nothing matches", async () => {
      const tabA = await liveTabId();
      const before = (await fakeBrowser.tabs.query({})).length;
      await setStored("run", spawnRun(tabA));
      // Rides out the SPAWN_WAIT_MS late-spawn window before creating.
      await continueRun({ skip: false });
      const run = await getStored("run");
      expect(run?.status).toBe("done");
      const after = await fakeBrowser.tabs.query({});
      expect(after).toHaveLength(before + 1);
      expect(run?.tabs?.[1]).toBe(after.at(-1)?.id);
    });
  });

  describe("close-tab steps", () => {
    const closeTabFlow = (steps: Workflow["steps"]): Workflow => ({
      ...THREE_STEPS,
      steps,
    });

    it("closes the step's tab and finishes the run", async () => {
      const tabA = await liveTabId();
      const tabB = await liveTabId();
      await setSecure("workflows", [
        closeTabFlow([NAV, { kind: "close-tab", tab: 1 }, CLICK]),
      ]);
      await setStored("run", {
        ...pausedRun(tabA, 1),
        tabs: { 0: tabA, 1: tabB },
      });
      await continueRun({ skip: false });
      const run = await getStored("run");
      expect(run?.status).toBe("done");
      const openIds = (await fakeBrowser.tabs.query({})).map((tab) => tab.id);
      expect(openIds).not.toContain(tabB);
      expect(openIds).toContain(tabA);
    });

    it("resumes past a close-tab step whose tab rejects like real Chrome", async () => {
      const tabA = await liveTabId();
      await setSecure("workflows", [
        closeTabFlow([NAV, { kind: "close-tab", tab: 1 }, CLICK]),
      ]);
      await setStored("run", {
        ...pausedRun(tabA, 1),
        tabs: { 0: tabA, 1: 999_999 },
      });
      // Real Chrome rejects tabs.get for closed ids; fake-browser resolves.
      vi.spyOn(fakeBrowser.tabs, "get").mockRejectedValueOnce(
        new Error("No tab with id")
      );
      await continueRun({ skip: false });
      expect((await getStored("run"))?.status).toBe("done");
    });

    it("succeeds when the tab is already gone", async () => {
      const tabA = await liveTabId();
      await setSecure("workflows", [
        closeTabFlow([NAV, { kind: "close-tab", tab: 1 }, CLICK]),
      ]);
      await setStored("run", {
        ...pausedRun(tabA, 1),
        tabs: { 0: tabA, 1: 999_999 },
      });
      await continueRun({ skip: false });
      expect((await getStored("run"))?.status).toBe("done");
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
