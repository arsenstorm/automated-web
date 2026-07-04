/** Heuristic workflow naming from recorded actions. Pure — no browser APIs. */

import type { StepAction } from "./types";

const SEARCH_FIELD = /search|\bq\b/i;
const MAX_NAME_TEXT = 30;

export const hostOfUrl = (url: string): string | undefined => {
  try {
    return new URL(url).host;
  } catch {
    return;
  }
};

const HREF_SELECTOR = /^a\[href="([^"]+)"\]/;

/**
 * Host the flow ended on. Walking backward: a page load ends the flow where
 * it happened; a link click may have opened another site in a new tab whose
 * events the recording never sees — its href is the landing host.
 */
const landingHost = (actions: StepAction[]): string | undefined => {
  for (const action of [...actions].reverse()) {
    if (action.kind === "navigate") {
      return hostOfUrl(action.url);
    }
    if (action.kind === "click") {
      const href = HREF_SELECTOR.exec(action.selector)?.[1];
      const clickHost = href ? hostOfUrl(href) : undefined;
      if (clickHost) {
        return clickHost;
      }
    }
  }
  return;
};

/**
 * Heuristic workflow name from the raw recorded actions (pre-dedup, so
 * submit-button click text is still present).
 */
export function suggestName(actions: StepAction[], host: string): string {
  if (actions.some((action) => action.kind === "input" && action.sensitive)) {
    return `Log in to ${host}`;
  }
  if (
    actions.some(
      (action) => action.kind === "input" && SEARCH_FIELD.test(action.selector)
    )
  ) {
    return `Search on ${host}`;
  }
  // A flow that lands on another site is a journey; click texts along the
  // way are link labels ("on GitHub") and read badly as action names.
  const landedHost = landingHost(actions);
  if (landedHost && landedHost !== host) {
    return `${host} → ${landedHost}`;
  }
  const lastClickText = actions
    .filter(
      (action): action is Extract<StepAction, { kind: "click" }> =>
        action.kind === "click"
    )
    .reverse()
    .find((action) => action.text && action.text.length <= MAX_NAME_TEXT)?.text;
  if (lastClickText) {
    return `${lastClickText} on ${host}`;
  }
  if (actions.some((action) => action.kind === "input")) {
    return `Fill a form on ${host}`;
  }
  return `Workflow on ${host}`;
}
