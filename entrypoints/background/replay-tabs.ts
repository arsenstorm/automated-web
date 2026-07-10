/** Tab readiness, spawned-tab adoption, and per-step tab resolution for replay. */

import { sendMessage } from "@/lib/messaging";
import { pickTabForUrl } from "@/lib/replay-state";
import type { RunState, StepAction, StepResult } from "@/lib/types";

const TAB_LOAD_TIMEOUT_MS = 30_000;
const PING_RETRY_MS = 200;
const PING_RETRIES = 25;

export const waitForTabComplete = (tabId: number): Promise<boolean> =>
  new Promise((resolve) => {
    const done = (loaded: boolean) => {
      browser.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve(loaded);
    };
    const listener = (
      updatedTabId: number,
      info: { status?: string }
    ): void => {
      if (updatedTabId === tabId && info.status === "complete") {
        done(true);
      }
    };
    const timer = setTimeout(() => done(false), TAB_LOAD_TIMEOUT_MS);
    browser.tabs.onUpdated.addListener(listener);
    browser.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === "complete") {
          done(true);
        }
      })
      .catch(() => done(false));
  });

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const pingContent = async (tabId: number): Promise<boolean> => {
  for (let attempt = 0; attempt < PING_RETRIES; attempt += 1) {
    try {
      // The content script runs in every frame; pin the main frame so the
      // promise doesn't resolve off whichever frame answers first.
      // biome-ignore lint/performance/noAwaitInLoops: retry/backoff loop — each attempt must finish before the next.
      await sendMessage("ping", undefined, { frameId: 0, tabId });
      return true;
    } catch {
      await sleep(PING_RETRY_MS);
    }
  }
  return false;
};

/** Ordinal → live tabId map; older runs predate `tabs`, fall back to the start tab. */
export const runTabs = (run: RunState): Record<number, number> =>
  run.tabs ?? { 0: run.tabId };

const SPAWN_WAIT_MS = 2000;
const RECENT_SPAWN_TTL_MS = 15_000;

/** Most recent tab created with an opener; consumed when replay adopts it. */
let recentSpawn: { openerTabId: number; tabId: number; ts: number } | null =
  null;

/** Track click-spawned tabs (openerTabId set) so replay can adopt them. */
export const watchSpawnedTabs = () => {
  browser.tabs.onCreated.addListener(
    (tab: { id?: number; openerTabId?: number }) => {
      if (tab.id !== undefined && tab.openerTabId !== undefined) {
        recentSpawn = {
          openerTabId: tab.openerTabId,
          tabId: tab.id,
          ts: Date.now(),
        };
      }
    }
  );
};

/** Consume the recent spawn when it came from one of the run's own tabs. */
const takeSpawnedTab = (ownedTabIds: number[]): number | null => {
  const spawn = recentSpawn;
  if (
    !spawn ||
    Date.now() - spawn.ts > RECENT_SPAWN_TTL_MS ||
    !ownedTabIds.includes(spawn.openerTabId) ||
    ownedTabIds.includes(spawn.tabId)
  ) {
    return null;
  }
  recentSpawn = null;
  return spawn.tabId;
};

/** Wait briefly for a click-spawned tab: onCreated with an owned opener. */
const waitForSpawn = (ownedTabIds: number[]): Promise<number | null> =>
  new Promise((resolve) => {
    const done = (tabId: number | null) => {
      browser.tabs.onCreated.removeListener(listener);
      clearTimeout(timer);
      resolve(tabId);
    };
    const listener = (tab: { id?: number; openerTabId?: number }): void => {
      if (
        tab.id !== undefined &&
        tab.openerTabId !== undefined &&
        ownedTabIds.includes(tab.openerTabId)
      ) {
        done(tab.id);
      }
    };
    const timer = setTimeout(() => done(null), SPAWN_WAIT_MS);
    browser.tabs.onCreated.addListener(listener);
  });

/**
 * Find or create the tab for a new-tab navigate. Priority: the tab the
 * previous step just spawned (usually created before this runs — hence the
 * recorded recentSpawn), an existing tab on the same URL/origin, a brief
 * wait for a late spawner, then a fresh tab.
 */
// ponytail: an adopted spawn is trusted as already-navigating — forcing the
// recorded URL would clobber volatile params (e.g. a fresh draft id); if the
// spawn lands elsewhere the next DOM step times out and the run pauses.
const materializeTab = async (
  url: string,
  ownedTabIds: number[],
  previousStep: StepAction | undefined
): Promise<{ tabId: number; alreadyNavigating: boolean } | null> => {
  const maySpawn =
    previousStep?.kind === "click" ||
    previousStep?.kind === "submit" ||
    previousStep?.kind === "user-click";
  /** The id back when its tab is still alive, else null. */
  const adoptable = (tabId: number | null): Promise<number | null> =>
    tabId === null
      ? Promise.resolve(null)
      : browser.tabs
          .get(tabId)
          .then(() => tabId)
          .catch(() => null);
  if (maySpawn) {
    const spawned = await adoptable(takeSpawnedTab(ownedTabIds));
    if (spawned !== null) {
      return { alreadyNavigating: true, tabId: spawned };
    }
  }
  const match = pickTabForUrl(await browser.tabs.query({}), url, ownedTabIds);
  if (match) {
    return { alreadyNavigating: match.exact, tabId: match.id };
  }
  if (maySpawn) {
    const late = await adoptable(await waitForSpawn(ownedTabIds));
    if (late !== null) {
      return { alreadyNavigating: true, tabId: late };
    }
  }
  const created = await browser.tabs.create({ url });
  return created.id === undefined
    ? null
    : { alreadyNavigating: true, tabId: created.id };
};

/**
 * Resolve (materializing if needed) the live tab for a step, and focus it on
 * a tab switch so the user can watch and the page isn't background-throttled.
 */
export const tabForStep = async (
  run: RunState,
  step: StepAction,
  previousStep: StepAction | undefined
): Promise<
  | { run: RunState; tabId: number; alreadyNavigating: boolean }
  | { result: StepResult }
> => {
  const ordinal = step.tab ?? 0;
  const tabs = runTabs(run);
  let tabId: number | undefined = tabs[ordinal];
  let alreadyNavigating = false;
  if (tabId !== undefined) {
    const alive = await browser.tabs
      .get(tabId)
      .then(() => true)
      .catch(() => false);
    if (!alive) {
      tabId = undefined;
    }
  }
  if (tabId === undefined) {
    if (step.kind !== "navigate") {
      return {
        result: { detail: "tab was closed", ok: false, reason: "timeout" },
      };
    }
    const found = await materializeTab(
      step.url,
      Object.values(tabs),
      previousStep
    );
    if (!found) {
      return {
        result: { detail: "could not open tab", ok: false, reason: "timeout" },
      };
    }
    ({ tabId, alreadyNavigating } = found);
  }
  if (previousStep && (previousStep.tab ?? 0) !== ordinal) {
    await browser.tabs.update(tabId, { active: true }).catch(() => null);
  }
  return {
    alreadyNavigating,
    run: { ...run, tabs: { ...tabs, [ordinal]: tabId } },
    tabId,
  };
};
