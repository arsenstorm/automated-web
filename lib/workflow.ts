/** Assembling a saved workflow from recorded actions. */

import { toWorkflowSteps } from "./miner";
import { suggestName } from "./naming";
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
    id: crypto.randomUUID(),
    origin: new URL(startUrl).origin,
    name: suggestName(actions, new URL(startUrl).host),
    createdAt: Date.now(),
    fingerprint,
    steps:
      steps[0]?.kind === "navigate"
        ? steps
        : [{ kind: "navigate", url: startUrl }, ...steps],
  };
}
