/** Replay orchestration: drives a workflow step by step in its tab. */

import { sendMessage } from "@/lib/messaging";
import { notify, notifyStuck } from "@/lib/notify";
import {
  afterStep,
  healedStepIndex,
  pausedRun,
  resumedRun,
  samePathname,
  sameUrl,
  startedRun,
} from "@/lib/replay-state";
import { getStored, setStored } from "@/lib/storage";
import { resolveStep } from "@/lib/templates";
import { advanceTourAfterReplay } from "@/lib/tour";
import type { RunState, StepResult, Workflow } from "@/lib/types";
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

const navigateStep = async (
  tabId: number,
  url: string
): Promise<StepResult> => {
  await browser.tabs.update(tabId, { url });
  const loaded = await waitForTabComplete(tabId);
  if (!(loaded && (await pingContent(tabId)))) {
    return { detail: "page did not load", ok: false, reason: "timeout" };
  }
  return { ok: true };
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

const executeOneStep = async (
  run: RunState,
  workflow: Workflow
): Promise<StepResult | "vault-locked"> => {
  const rawStep = workflow.steps[run.stepIndex];
  if (!rawStep) {
    return { ok: true };
  }
  const resolved = resolveStep(rawStep, run.outputs ?? {});
  if ("missing" in resolved) {
    return {
      detail: `no output for ${resolved.missing.map((id) => `{{${id}}}`).join(", ")}`,
      ok: false,
      reason: "missing-output",
    };
  }
  const { step } = resolved;
  if (step.kind === "sleep") {
    await keepAliveSleep(step.ms);
    return { ok: true };
  }
  if (step.kind === "pause") {
    return {
      detail: "waiting for you — resume to continue",
      ok: false,
      reason: "pause",
    };
  }
  if (step.kind === "navigate") {
    return await navigateStep(run.tabId, step.url);
  }
  // Values are inline in the step, but honour a mid-run lock: locked means
  // dormant, so don't keep typing secrets into pages.
  if (step.kind === "input" && (await vaultLocked())) {
    return "vault-locked";
  }
  const frameId = await frameForStep(run.tabId, step.frameUrl);
  if (frameId === null) {
    return {
      detail: `frame not found: ${step.frameUrl}`,
      ok: false,
      reason: "timeout",
    };
  }
  return await sendMessage(
    "executeStep",
    { step },
    { frameId, tabId: run.tabId }
  ).catch(
    (): StepResult => ({
      detail: "tab not reachable",
      ok: false,
      reason: "timeout",
    })
  );
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
    const result = await executeOneStep(run, workflow);
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
    await notifyStuck(run.pausedReason ?? "unknown");
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
  let run = startedRun(workflowId, tab.id);
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
export const continueRun = async ({ skip }: { skip: boolean }) => {
  const run = await getStored("run");
  if (run?.status !== "paused") {
    return;
  }
  const tabAlive = await browser.tabs
    .get(run.tabId)
    .then(() => true)
    .catch(() => false);
  if (!tabAlive) {
    await setStored("run", pausedRun(run, "tab was closed"));
    return;
  }
  const workflows = await getSecure("workflows");
  const workflow = workflows.find((w) => w.id === run.workflowId);
  if (!workflow) {
    await setStored("run", null);
    return;
  }

  const advance =
    skip ||
    workflow.steps[run.stepIndex]?.kind === "pause" ||
    (run.pausedReason?.startsWith("secret") ?? false);
  let next = advance
    ? afterStep(resumedRun(run), { ok: true }, workflow.steps.length)
    : resumedRun(run);
  // Self-healing: skip steps the user already performed by hand while paused
  // (e.g. entered the password and hit submit instead of resuming).
  const { pausedAt } = run;
  if (next.status === "running" && pausedAt !== undefined) {
    await flushTabBuffers(run.tabId);
    const userActions = (await getSecure("events"))
      .filter((event) => event.tabId === run.tabId && event.ts >= pausedAt)
      .map((event) => event.action);
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
  if (run?.status !== "paused" || run.tabId !== tabId) {
    return;
  }
  const { pausedAt } = run;
  const reason = run.pausedReason ?? "";
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
  const userActions = (await getSecure("events"))
    .filter((event) => event.tabId === tabId && event.ts >= pausedAt)
    .map((event) => event.action);
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
