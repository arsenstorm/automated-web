/**
 * `{{sN}}` output tokens in step fields. Substitution happens in the
 * background run loop only — content scripts never see tokens or outputs.
 */

import type { StepAction } from "./types";

const TOKEN = /\{\{\s*(s\d+)\s*\}\}/g;

/** Step ids referenced by tokens in `text`. */
export function tokenRefs(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((match) => match[1] ?? "");
}

const substitute = (
  text: string,
  outputs: Record<string, string>
): { text: string; missing: string[] } => {
  const missing = tokenRefs(text).filter((id) => outputs[id] === undefined);
  return {
    missing,
    text: text.replace(TOKEN, (token, id: string) => outputs[id] ?? token),
  };
};

/**
 * Resolve output tokens in the step's template-capable fields (input.value
 * and navigate.url). Other kinds pass through untouched.
 */
export function resolveStep(
  step: StepAction,
  outputs: Record<string, string>
): { step: StepAction } | { missing: string[] } {
  if (step.kind === "input") {
    const { text, missing } = substitute(step.value, outputs);
    return missing.length > 0
      ? { missing }
      : { step: { ...step, value: text } };
  }
  if (step.kind === "navigate") {
    const { text, missing } = substitute(step.url, outputs);
    return missing.length > 0 ? { missing } : { step: { ...step, url: text } };
  }
  return { step };
}
