/** Assembling a saved workflow from recorded actions, and step editing. */

import { toWorkflowSteps } from "./miner";
import { suggestName } from "./naming";
import { tokenRefs } from "./templates";
import type { StepAction, Workflow } from "./types";

/**
 * Build a workflow from raw recorded actions: filters the redundant
 * click-before-submit, names it, and guarantees it starts with a navigate to
 * `startUrl` so replay always has a page to open.
 */
export function buildWorkflow(options: {
  /** Unfiltered actions — naming looks at the full stream. */
  actions: StepAction[];
  /** Full URL (or origin) the flow starts on. */
  startUrl: string;
  fingerprint: string;
}): Workflow {
  const { actions, startUrl, fingerprint } = options;
  const steps = toWorkflowSteps(actions);
  return {
    createdAt: Date.now(),
    fingerprint,
    id: crypto.randomUUID(),
    name: suggestName(actions, new URL(startUrl).host),
    origin: new URL(startUrl).origin,
    steps:
      steps[0]?.kind === "navigate" && (steps[0].tab ?? 0) === 0
        ? steps
        : [{ kind: "navigate", url: startUrl }, ...steps],
  };
}

export const MAX_SLEEP_MS = 300_000;

const ID_SUFFIX = /^s(\d+)$/;

/** Next unused "sN" step id. */
export function nextStepId(steps: StepAction[]): string {
  const max = Math.max(
    0,
    ...steps.map((step) => Number(ID_SUFFIX.exec(step.id ?? "")?.[1] ?? 0))
  );
  return `s${max + 1}`;
}

/** Backfill missing step ids without touching existing ones. */
export function ensureStepIds(steps: StepAction[]): StepAction[] {
  const filled = [...steps];
  for (const [index, step] of filled.entries()) {
    if (!step.id) {
      filled[index] = { ...step, id: nextStepId(filled) };
    }
  }
  return filled;
}

const parseableUrl = (url: string): boolean => URL.canParse(url);

const stepError = (
  step: StepAction,
  index: number,
  knownIds: Set<string>
): string | null => {
  if (index === 0 && step.kind !== "navigate") {
    return "the first step must open a page";
  }
  // startRun drives step 0 in the start tab unconditionally.
  if (index === 0 && (step.tab ?? 0) !== 0) {
    return "the first step must open the start tab";
  }
  if (
    step.kind !== "user-click" &&
    "selector" in step &&
    !step.selector.trim()
  ) {
    return `step ${index + 1} needs a selector`;
  }
  if (step.kind === "sleep") {
    const valid =
      Number.isInteger(step.ms) && step.ms >= 0 && step.ms <= MAX_SLEEP_MS;
    return valid ? null : `step ${index + 1}: wait must be 0–5 minutes`;
  }
  let templated: string | null = null;
  if (step.kind === "navigate") {
    templated = step.url;
  } else if (step.kind === "input") {
    templated = step.value;
  }
  if (templated === null) {
    return null;
  }
  for (const ref of tokenRefs(templated)) {
    if (!knownIds.has(ref)) {
      return `step ${index + 1}: {{${ref}}} must come from an earlier step`;
    }
  }
  const urlOk =
    step.kind !== "navigate" ||
    parseableUrl(templated) ||
    (index > 0 && tokenRefs(templated).length > 0);
  return urlOk ? null : `step ${index + 1} needs a full URL`;
};

/** Validate an edited step list; returns the first error, or null when ok. */
export function validateSteps(steps: StepAction[]): string | null {
  if (steps.length === 0) {
    return "a workflow needs at least one step";
  }
  const ids = steps.map((step) => step.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    return "every step needs a unique id";
  }
  const knownIds = new Set<string>();
  const seenTabs = new Set<number>([0]);
  for (const [index, step] of steps.entries()) {
    const tab = step.tab ?? 0;
    if (!seenTabs.has(tab)) {
      if (step.kind !== "navigate") {
        return `step ${index + 1}: a new tab must start by opening a page`;
      }
      seenTabs.add(tab);
    }
    const error = stepError(step, index, knownIds);
    if (error) {
      return error;
    }
    if (step.id) {
      knownIds.add(step.id);
    }
  }
  return null;
}
