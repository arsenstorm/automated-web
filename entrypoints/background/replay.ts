/** Replay orchestration: drives a workflow step by step in its tab. */

import { sendMessage } from "@/lib/messaging";
import { notify, notifyStuck } from "@/lib/notify";
import {
  afterStep,
  healedStepIndex,
  isUserClickBlock,
  pausedRun,
  pickTabForUrl,
  resumedRun,
  samePathname,
  sameUrl,
  startedRun,
} from "@/lib/replay-state";
import { getStored, setStored } from "@/lib/storage";
import { resolveStep } from "@/lib/templates";
import { advanceTourAfterReplay } from "@/lib/tour";
import type { RunState, StepAction, StepResult, Workflow } from "@/lib/types";
import { MAX_SLEEP_MS } from "@/lib/workflow";
import { flushTabBuffers } from "./recording";
import { getSecure, vaultLocked } from "./vault";

const TAB_LOAD_TIMEOUT_MS = 30_000;
const PING_RETRY_MS = 200;
const PING_RETRIES = 25;

const waitForTabComplete = (tabId: number): Promise<boolean> =>
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pingContent = async (tabId: number): Promise<boolean> => {
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
const runTabs = (run: RunState): Record<number, number> =>
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
const tabForStep = async (
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

const navigateStep = async (
  tabId: number,
  url: string,
  alreadyNavigating = false
): Promise<StepResult> => {
  if (!alreadyNavigating) {
    await browser.tabs.update(tabId, { url });
  }
  const loaded = await waitForTabComplete(tabId);
  if (!(loaded && (await pingContent(tabId)))) {
    return { detail: "page did not load", ok: false, reason: "timeout" };
  }
  return { ok: true };
};

/** Send `send(frameId)` to every frame of a tab (falls back to the main frame). */
const broadcastToFrames = async (
  tabId: number,
  send: (frameId: number) => Promise<unknown>
): Promise<void> => {
  const frames = (await browser.webNavigation
    .getAllFrames({ tabId })
    .catch(() => null)) ?? [{ frameId: 0 }];
  await Promise.all(
    frames.map((frame) => send(frame.frameId).catch(() => null))
  );
};

/** Arm every frame of a tab for one-shot user-click capture. */
const armUserClickFrames = (
  tabId: number,
  label: string | undefined,
  workflowName: string
): Promise<void> =>
  broadcastToFrames(tabId, (frameId) =>
    sendMessage("armUserClick", { label, workflowName }, { frameId, tabId })
  );

/** Best-effort disarm across every tab the run owns (frames + banner). */
export const disarmUserClickRun = async (run: RunState): Promise<void> => {
  await Promise.all(
    Object.values(runTabs(run)).map((tabId) =>
      broadcastToFrames(tabId, (frameId) =>
        sendMessage("disarmUserClick", undefined, { frameId, tabId })
      )
    )
  );
};

/** Sleep in chunks, touching storage each chunk to reset the MV3 idle timer. */
// ponytail: chunked keepalive, capped at 5 min; browser.alarms if longer
// sleeps become real.
const KEEPALIVE_CHUNK_MS = 20_000;
const keepAliveSleep = async (ms: number) => {
  let remaining = Math.min(Math.max(ms, 0), MAX_SLEEP_MS);
  while (remaining > 0) {
    const chunk = Math.min(remaining, KEEPALIVE_CHUNK_MS);
    // biome-ignore lint/performance/noAwaitInLoops: chunked sleep — waits are sequential by design.
    await sleep(chunk);
    remaining -= chunk;
    await browser.storage.local.get("run");
  }
};

/** The live frameId for a step, or null when its frame is gone. */
const frameForStep = async (
  tabId: number,
  frameUrl: string | undefined
): Promise<number | null> => {
  if (!frameUrl) {
    // Main frame — explicit, so the per-frame listeners never race.
    return 0;
  }
  const frames =
    (await browser.webNavigation.getAllFrames({ tabId }).catch(() => null)) ??
    [];
  const match =
    frames.find((frame) => sameUrl(frame.url, frameUrl)) ??
    // ponytail: widget iframes churn query strings; origin+pathname
    // fallback, first match wins ties.
    frames.find((frame) => samePathname(frame.url, frameUrl));
  return match?.frameId ?? null;
};

/** Recorded events since `since`, mapped to {action, tab ordinal} for healing. */
const userActionsSince = async (
  tabs: Record<number, number>,
  since: number
): Promise<{ action: StepAction; tab: number }[]> => {
  const ordinalByTabId = new Map(
    Object.entries(tabs).map(([ordinal, id]) => [id, Number(ordinal)])
  );
  return (await getSecure("events")).flatMap((event) => {
    const ordinal =
      event.tabId === undefined ? undefined : ordinalByTabId.get(event.tabId);
    return ordinal !== undefined && event.ts >= since
      ? [{ action: event.action, tab: ordinal }]
      : [];
  });
};

const executeOneStep = async (
  run: RunState,
  workflow: Workflow
): Promise<{ result: StepResult | "vault-locked"; run: RunState }> => {
  const rawStep = workflow.steps[run.stepIndex];
  if (!rawStep) {
    return { result: { ok: true }, run };
  }
  const resolved = resolveStep(rawStep, run.outputs ?? {});
  if ("missing" in resolved) {
    return {
      result: {
        detail: `no output for ${resolved.missing.map((id) => `{{${id}}}`).join(", ")}`,
        ok: false,
        reason: "missing-output",
      },
      run,
    };
  }
  const { step } = resolved;
  if (step.kind === "sleep") {
    await keepAliveSleep(step.ms);
    return { result: { ok: true }, run };
  }
  if (step.kind === "pause") {
    return {
      result: {
        detail: "waiting for you — resume to continue",
        ok: false,
        reason: "pause",
      },
      run,
    };
  }
  if (step.kind === "close-tab") {
    const target = runTabs(run)[step.tab ?? 0];
    if (target !== undefined) {
      // Already-closed (or never-opened) tab: the step's outcome is true.
      await browser.tabs.remove(target).catch(() => null);
    }
    return { result: { ok: true }, run };
  }
  const previousStep = workflow.steps[run.stepIndex - 1];
  const resolvedTab = await tabForStep(run, step, previousStep);
  if ("result" in resolvedTab) {
    return { result: resolvedTab.result, run };
  }
  const { run: nextRun, tabId, alreadyNavigating } = resolvedTab;
  if (step.kind === "navigate") {
    return {
      result: await navigateStep(tabId, step.url, alreadyNavigating),
      run: nextRun,
    };
  }
  if (step.kind === "user-click") {
    await armUserClickFrames(tabId, step.label, workflow.name);
    return {
      result: {
        detail: step.label ?? "click the element on the page to continue",
        ok: false,
        reason: "user-click",
      },
      run: nextRun,
    };
  }
  // Values are inline in the step, but honour a mid-run lock: locked means
  // dormant, so don't keep typing secrets into pages.
  if (step.kind === "input" && (await vaultLocked())) {
    return { result: "vault-locked", run: nextRun };
  }
  const frameId = await frameForStep(tabId, step.frameUrl);
  if (frameId === null) {
    return {
      result: {
        detail: `frame not found: ${step.frameUrl}`,
        ok: false,
        reason: "timeout",
      },
      run: nextRun,
    };
  }
  return {
    result: await sendMessage(
      "executeStep",
      { step },
      { frameId, tabId }
    ).catch(
      (): StepResult => ({
        detail: "tab not reachable",
        ok: false,
        reason: "timeout",
      })
    ),
    run: nextRun,
  };
};

const runLoop = async () => {
  let run = await getStored("run");
  if (run?.status !== "running") {
    return;
  }
  const workflows = await getSecure("workflows");
  const workflow = workflows.find((w) => w.id === run?.workflowId);
  if (!workflow) {
    await setStored("run", null);
    return;
  }
  while (run.status === "running") {
    // biome-ignore lint/performance/noAwaitInLoops: workflow steps must replay strictly in order.
    const { result, run: next } = await executeOneStep(run, workflow);
    run = next;
    const stepId: string | undefined = workflow.steps[run.stepIndex]?.id;
    if (
      stepId &&
      result !== "vault-locked" &&
      result.ok &&
      result.output !== undefined
    ) {
      run = { ...run, outputs: { ...run.outputs, [stepId]: result.output } };
    }
    run =
      result === "vault-locked"
        ? pausedRun(run, "vault locked — unlock it in the side panel")
        : afterStep(run, result, workflow.steps.length);
    await setStored("run", run);
  }
  if (run.status === "paused") {
    if (isUserClickBlock(run)) {
      await notify("Waiting for your click", workflow.name);
    } else {
      await notifyStuck(run.pausedReason ?? "unknown");
    }
  }
  if (run.status === "done") {
    await notify("Workflow finished", workflow.name);
    await advanceTourAfterReplay(workflow.id);
  }
};

export const startRun = async (workflowId: string) => {
  if (await vaultLocked()) {
    return;
  }
  const workflows = await getSecure("workflows");
  const workflow = workflows.find((w) => w.id === workflowId);
  const first = workflow?.steps[0];
  if (!(workflow && first) || first.kind !== "navigate") {
    return;
  }
  // Reuse the active tab when it already sits on the workflow's start URL.
  const [activeTab] = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const tab =
    activeTab?.id === undefined || !sameUrl(activeTab.url, first.url)
      ? await browser.tabs.create({ url: first.url })
      : activeTab;
  if (tab.id === undefined) {
    return;
  }
  let run: RunState = {
    ...startedRun(workflowId, tab.id),
    tabs: { 0: tab.id },
  };
  // Persist before the (slow) page load so the side panel shows the run.
  await setStored("run", run);
  // The tab was created on step 0's URL; wait for it, then skip that step.
  const loaded = await waitForTabComplete(tab.id);
  run =
    loaded && (await pingContent(tab.id))
      ? afterStep(run, { ok: true }, workflow.steps.length)
      : pausedRun(run, "page did not load");
  await setStored("run", run);
  await runLoop();
};

/** Continue a paused run, optionally skipping the step it is stuck on. */
export const continueRun = async ({
  skip,
  heal = true,
}: {
  skip: boolean;
  heal?: boolean;
}) => {
  const run = await getStored("run");
  if (run?.status !== "paused") {
    return;
  }
  // Clear any stale armed frames/banner whether we advance or re-run.
  if (isUserClickBlock(run)) {
    await disarmUserClickRun(run);
  }
  const workflows = await getSecure("workflows");
  const workflow = workflows.find((w) => w.id === run.workflowId);
  if (!workflow) {
    await setStored("run", null);
    return;
  }
  const step = workflow.steps[run.stepIndex];
  const stepTabId = runTabs(run)[step?.tab ?? 0];
  const tabAlive =
    stepTabId !== undefined &&
    (await browser.tabs
      .get(stepTabId)
      .then(() => true)
      .catch(() => false));
  // navigate can re-materialize its tab; close-tab succeeds on a dead one.
  if (!tabAlive && step?.kind !== "navigate" && step?.kind !== "close-tab") {
    await setStored("run", pausedRun(run, "tab was closed"));
    return;
  }

  const advance =
    skip ||
    step?.kind === "pause" ||
    (run.pausedReason?.startsWith("secret") ?? false);
  let next = advance
    ? afterStep(resumedRun(run), { ok: true }, workflow.steps.length)
    : resumedRun(run);
  // Self-healing: skip steps the user already performed by hand while paused
  // (e.g. entered the password and hit submit instead of resuming).
  const { pausedAt } = run;
  if (heal && next.status === "running" && pausedAt !== undefined) {
    const tabs = runTabs(run);
    await Promise.all(
      Object.values(tabs).map((tabId) => flushTabBuffers(tabId))
    );
    const userActions = await userActionsSince(tabs, pausedAt);
    const stepIndex = healedStepIndex(
      next.stepIndex,
      workflow.steps,
      userActions
    );
    next =
      stepIndex >= workflow.steps.length
        ? { ...next, status: "done", stepIndex }
        : { ...next, stepIndex };
  }
  await setStored("run", next);
  if (next.status === "done") {
    await notify("Workflow finished", workflow.name);
    await advanceTourAfterReplay(workflow.id);
    return;
  }
  await runLoop();
};

/** An armed user-click landed in the page: store its output, continue the run. */
export const completeUserClick = async (
  output: string,
  senderTabId: number | undefined
): Promise<void> => {
  const run = await getStored("run");
  if (
    run?.status !== "paused" ||
    !isUserClickBlock(run) ||
    senderTabId === undefined
  ) {
    return;
  }
  const workflows = await getSecure("workflows");
  const workflow = workflows.find((w) => w.id === run.workflowId);
  const step = workflow?.steps[run.stepIndex];
  if (step?.kind !== "user-click") {
    return;
  }
  // Trust boundary: only a click from the step's own tab may complete it.
  if (runTabs(run)[step.tab ?? 0] !== senderTabId) {
    return;
  }
  if (step.id) {
    await setStored("run", {
      ...run,
      outputs: { ...run.outputs, [step.id]: output },
    });
  }
  await continueRun({ heal: false, skip: true });
};

/**
 * Auto-resume (opt-in via settings): called when the paused run's tab flushes
 * recorded events. Resumes once the user has moved PAST the blocking step —
 * for a password pause that means typed AND submitted; resuming on the input
 * alone would submit a form the user may still be filling.
 */
export const maybeAutoResume = async (tabId: number | undefined) => {
  const { autoResume } = await getStored("settings");
  if (!autoResume || tabId === undefined) {
    return;
  }
  const run = await getStored("run");
  if (
    run?.status !== "paused" ||
    tabId === undefined ||
    !Object.values(runTabs(run)).includes(tabId)
  ) {
    return;
  }
  const { pausedAt } = run;
  const reason = run.pausedReason ?? "";
  // user-click has its own completion path; healing can't synthesize its
  // output, so it must not auto-resume through here.
  const waitingOnUser =
    reason.startsWith("pause") || reason.startsWith("secret");
  if (pausedAt === undefined || !waitingOnUser) {
    return;
  }
  const workflows = await getSecure("workflows");
  const workflow = workflows.find((w) => w.id === run.workflowId);
  if (!workflow) {
    return;
  }
  const userActions = await userActionsSince(runTabs(run), pausedAt);
  // continueRun's advance already skips the blocking step; require evidence
  // the user completed at least the step after it.
  const base = run.stepIndex + 1;
  if (healedStepIndex(base, workflow.steps, userActions) > base) {
    await continueRun({ skip: false });
  }
};

/** SW restarted mid-run: pause rather than risk double-executing a step. */
// ponytail: pause-on-restart, not auto-resume.
export const pauseInterruptedRun = async () => {
  const run = await getStored("run");
  if (run?.status === "running") {
    await setStored("run", pausedRun(run, "interrupted — resume to continue"));
    await notifyStuck("run interrupted — resume from the side panel");
  }
};
