/** Replay orchestration: starts a run and drives it step by step. */

import { notify, notifyStuck } from "@/lib/notify";
import {
  afterStep,
  isUserClickBlock,
  pausedRun,
  sameUrl,
  startedRun,
} from "@/lib/replay-state";
import { getStored, setStored } from "@/lib/storage";
import { advanceTourAfterReplay } from "@/lib/tour";
import type { RunState } from "@/lib/types";
import { executeOneStep } from "./replay-steps";
import { pingContent, waitForTabComplete } from "./replay-tabs";
import { getSecure, vaultLocked } from "./vault";

export const runLoop = async () => {
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
