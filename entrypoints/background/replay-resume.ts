/** Resume paths for a paused run: manual continue, user-click completion, auto-resume, self-healing. */

import { notify, notifyStuck } from "@/lib/notify";
import {
  afterStep,
  healedStepIndex,
  isUserClickBlock,
  pausedRun,
  resumedRun,
} from "@/lib/replay-state";
import { getStored, setStored } from "@/lib/storage";
import { advanceTourAfterReplay } from "@/lib/tour";
import type { StepAction } from "@/lib/types";
import { flushTabBuffers } from "./recording";
import { runLoop } from "./replay";
import { disarmUserClickRun } from "./replay-steps";
import { runTabs } from "./replay-tabs";
import { getSecure } from "./vault";

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
