/**
 * Replay tab handling against the fake browser: cross-tab navigate
 * materialization (spawn adoption, URL reuse, fresh-tab fallback) and
 * close-tab steps. Tab-targeted messaging isn't implemented by fake-browser,
 * so `sendMessage` is mocked to stand in for the content-script executor.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { sendMessage } from "@/lib/messaging";
import { getStored, setStored } from "@/lib/storage";
import type { RunState, Workflow } from "@/lib/types";
import {
  CLICK,
  liveTabId,
  NAV,
  pausedRun,
  THREE_STEPS,
} from "./replay-fixtures";
import { continueRun } from "./replay-resume";
import { watchSpawnedTabs } from "./replay-tabs";
import { setSecure } from "./vault";

vi.mock("@/lib/messaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messaging")>()),
  sendMessage: vi.fn(),
}));
const sendMessageMock = vi.mocked(sendMessage);

describe("replay tab handling", () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    sendMessageMock.mockReset();
    sendMessageMock.mockResolvedValue({ ok: true } as never);
    await setSecure("workflows", [THREE_STEPS]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
