/** Executes one workflow step: frame targeting, navigation, and dispatch to the content script. */

import { sendMessage } from "@/lib/messaging";
import { samePathname, sameUrl } from "@/lib/replay-state";
import { resolveStep } from "@/lib/templates";
import type { RunState, StepResult, Workflow } from "@/lib/types";
import { MAX_SLEEP_MS } from "@/lib/workflow";
import {
  pingContent,
  runTabs,
  sleep,
  tabForStep,
  waitForTabComplete,
} from "./replay-tabs";
import { vaultLocked } from "./vault";

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

export const executeOneStep = async (
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
