/**
 * Pure replay helpers: run-state transitions and captcha detection.
 * The orchestration loop (tabs, messaging) lives in the background script.
 */

import type { RunState, StepAction, StepResult } from "./types";

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
      pausedAt: Date.now(),
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
  return {
    ...run,
    pausedAt: Date.now(),
    pausedReason: reason,
    status: "paused",
  };
}

export function resumedRun(run: RunState): RunState {
  return {
    ...run,
    pausedAt: undefined,
    pausedReason: undefined,
    status: "running",
  };
}

const TRAILING_SLASH = /\/$/;

// ponytail: hash- and trailing-slash-insensitive exact match; add query
// normalization if reuse misses.
export const sameUrl = (a: string | undefined, b: string): boolean => {
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

export const samePathname = (a: string | undefined, b: string): boolean => {
  try {
    if (a === undefined) {
      return false;
    }
    const urlA = new URL(a);
    const urlB = new URL(b);
    return (
      urlA.origin === urlB.origin &&
      urlA.pathname.replace(TRAILING_SLASH, "") ===
        urlB.pathname.replace(TRAILING_SLASH, "")
    );
  } catch {
    return false;
  }
};

/** Did this recorded user action perform the given workflow step? */
const matchesStep = (step: StepAction, action: StepAction): boolean => {
  if (step.kind === "navigate" && action.kind === "navigate") {
    // Post-submit redirects churn query strings; origin+pathname is enough.
    return samePathname(action.url, step.url);
  }
  if (
    (step.kind === "click" && action.kind === "click") ||
    (step.kind === "input" && action.kind === "input") ||
    (step.kind === "submit" && action.kind === "submit")
  ) {
    // Selector only: sensitive input values are redacted at capture, and the
    // user's value is allowed to differ from the recorded one anyway.
    return step.selector === action.selector;
  }
  return false;
};

/**
 * Self-healing on resume: fast-forward past workflow steps the user already
 * performed by hand while the run was paused (e.g. typed the password and hit
 * submit instead of pressing play). Greedy in-order match of upcoming steps
 * against the user's recorded actions; stops at the first step with no
 * matching action or that a user can't perform (sleep/pause/extract).
 */
export function healedStepIndex(
  startIndex: number,
  steps: StepAction[],
  actions: StepAction[]
): number {
  let stepIndex = startIndex;
  let cursor = 0;
  while (stepIndex < steps.length) {
    const step = steps[stepIndex];
    if (
      !step ||
      step.kind === "sleep" ||
      step.kind === "pause" ||
      step.kind === "extract"
    ) {
      break;
    }
    const found = actions.findIndex(
      (action, i) => i >= cursor && matchesStep(step, action)
    );
    if (found < 0) {
      break;
    }
    cursor = found + 1;
    stepIndex += 1;
  }
  return stepIndex;
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
