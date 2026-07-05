/**
 * Pure replay helpers: run-state transitions and captcha detection.
 * The orchestration loop (tabs, messaging) lives in the background script.
 */

import type { RunState, StepResult } from "./types";

export function startedRun(workflowId: string, tabId: number): RunState {
  return {
    id: crypto.randomUUID(),
    status: "running",
    stepIndex: 0,
    tabId,
    workflowId,
  };
}

export function afterStep(
  run: RunState,
  result: StepResult,
  totalSteps: number
): RunState {
  if (!result.ok) {
    return {
      ...run,
      pausedReason: result.detail
        ? `${result.reason}: ${result.detail}`
        : result.reason,
      status: "paused",
    };
  }
  const stepIndex = run.stepIndex + 1;
  if (stepIndex >= totalSteps) {
    return { ...run, pausedReason: undefined, status: "done", stepIndex };
  }
  return { ...run, pausedReason: undefined, status: "running", stepIndex };
}

export function pausedRun(run: RunState, reason: string): RunState {
  return { ...run, pausedReason: reason, status: "paused" };
}

export function resumedRun(run: RunState): RunState {
  return { ...run, pausedReason: undefined, status: "running" };
}

/**
 * True when a paused run sits on a deliberate pause step rather than an
 * error. "pause" is the only paused reason with that prefix.
 */
export function isPauseBlock(run: RunState): boolean {
  return run.pausedReason?.startsWith("pause") ?? false;
}

const CAPTCHA_IFRAME = /recaptcha|hcaptcha|turnstile/i;
const CAPTCHA_CONTAINERS = ".g-recaptcha, .h-captcha, .cf-turnstile";

/** True when a visible captcha widget is present in the document. */
export function hasCaptcha(doc: Document): boolean {
  for (const iframe of doc.querySelectorAll("iframe")) {
    if (
      CAPTCHA_IFRAME.test(iframe.src) &&
      iframe.getBoundingClientRect().height > 0
    ) {
      return true;
    }
  }
  return doc.querySelector(CAPTCHA_CONTAINERS) !== null;
}
