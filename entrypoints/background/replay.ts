/** Replay orchestration: drives a workflow step by step in its tab. */

import { sendMessage } from "@/lib/messaging";
import { notify, notifyStuck } from "@/lib/notify";
import { afterStep, pausedRun, resumedRun, startedRun } from "@/lib/replay";
import { getStored, setStored } from "@/lib/storage";
import type { RunState, StepResult, Workflow } from "@/lib/types";
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
  for (let attempt = 0; attempt < PING_RETRIES; attempt++) {
    try {
      await sendMessage("ping", undefined, tabId);
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
    return { ok: false, reason: "timeout", detail: "page did not load" };
  }
  return { ok: true };
};

const executeOneStep = async (
  run: RunState,
  workflow: Workflow
): Promise<StepResult | "vault-locked"> => {
  const step = workflow.steps[run.stepIndex];
  if (!step) {
    return { ok: true };
  }
  if (step.kind === "navigate") {
    return await navigateStep(run.tabId, step.url);
  }
  // Values are inline in the step, but honour a mid-run lock: locked means
  // dormant, so don't keep typing secrets into pages.
  if (step.kind === "input" && (await vaultLocked())) {
    return "vault-locked";
  }
  return await sendMessage("executeStep", { step }, run.tabId).catch(
    (): StepResult => ({
      ok: false,
      reason: "timeout",
      detail: "tab not reachable",
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
    const result = await executeOneStep(run, workflow);
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
  }
};

const TRAILING_SLASH = /\/$/;

// ponytail: hash- and trailing-slash-insensitive exact match; add query
// normalization if reuse misses.
const sameUrl = (a: string | undefined, b: string): boolean => {
  try {
    if (a === undefined) {
      return false;
    }
    const urlA = new URL(a);
    const urlB = new URL(b);
    urlA.hash = "";
    urlB.hash = "";
    urlA.pathname = urlA.pathname.replace(TRAILING_SLASH, "");
    urlB.pathname = urlB.pathname.replace(TRAILING_SLASH, "");
    return urlA.href === urlB.href;
  } catch {
    return false;
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
  const next = skip
    ? afterStep(resumedRun(run), { ok: true }, workflow.steps.length)
    : resumedRun(run);
  await setStored("run", next);
  if (next.status === "done") {
    await notify("Workflow finished", workflow.name);
    return;
  }
  await runLoop();
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
