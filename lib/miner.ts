/**
 * Local pattern mining: split the recorded event stream into per-origin
 * sessions, fingerprint each session's action shape (values excluded), and
 * suggest a workflow once the same shape has repeated enough times.
 * Pure — no browser APIs.
 */

import { assignTabOrdinals } from "./recorded-events";
import type {
  CandidatePattern,
  RecordedEvent,
  StepAction,
  Workflow,
} from "./types";

/** Gap that ends a session; a session is "closed" once this old. */
export const SESSION_GAP_MS = 60_000;
/** Don't re-show a toast for the same pattern more often than this. */
export const SUGGEST_COOLDOWN_MS = 5 * 60_000;
const MIN_SESSION_STEPS = 3;
const HASH_SEED = 5381;
const HASH_FACTOR = 33;
const HASH_MODULUS = 2 ** 32;

const pathnameOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

const navPathname = (action: StepAction): string | null =>
  action.kind === "navigate" ? pathnameOf(action.url) : null;

/**
 * Split events into per-origin sessions. A session ends on an origin change,
 * a >60s idle gap, or a navigation back to the pathname the session started
 * on (the user restarting the same flow back-to-back).
 */
export function sessionize(
  events: RecordedEvent[],
  now: number
): { closed: RecordedEvent[][]; open: RecordedEvent[] } {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const sessions: RecordedEvent[][] = [];
  let current: RecordedEvent[] = [];
  let startPath: string | null = null;
  for (const event of sorted) {
    const last = current.at(-1);
    const path = navPathname(event.action);
    const restartsFlow = path !== null && path === startPath;
    const splits =
      last &&
      (event.origin !== last.origin ||
        event.ts - last.ts > SESSION_GAP_MS ||
        restartsFlow);
    if (splits) {
      sessions.push(current);
      current = [];
    }
    if (current.length === 0) {
      startPath = path;
    }
    current.push(event);
  }
  if (current.length > 0) {
    sessions.push(current);
  }
  const lastSession = sessions.at(-1);
  const lastIsOpen =
    lastSession && now - (lastSession.at(-1)?.ts ?? 0) <= SESSION_GAP_MS;
  return {
    closed: lastIsOpen ? sessions.slice(0, -1) : sessions,
    open: lastIsOpen ? lastSession : [],
  };
}

const actionShape = (action: StepAction): string => {
  if (action.kind === "navigate") {
    return `navigate:${pathnameOf(action.url)}`;
  }
  // Editor-only kinds (sleep/pause) never appear in recorded streams.
  // frameUrl stays out on purpose: widget iframe URLs carry volatile query
  // strings that would keep repeated sessions from ever matching.
  return "selector" in action
    ? `${action.kind}:${action.selector}`
    : action.kind;
};

const djb2 = (input: string): string => {
  let hash = HASH_SEED;
  for (const char of input) {
    hash = (hash * HASH_FACTOR + char.charCodeAt(0)) % HASH_MODULUS;
  }
  return hash.toString(16);
};

/** Same actions with different input values → same fingerprint. */
export function fingerprintSession(session: RecordedEvent[]): string {
  const origin = session[0]?.origin ?? "";
  const shape = session.map((event) => actionShape(event.action)).join("|");
  return djb2(`${origin}|${shape}`);
}

/**
 * The mined units of a session: the prefix ending at each submit step (a
 * submit is the natural end of a workflow, so trailing noise like a logout
 * click never enters the fingerprint). Sessions without a submit count as
 * one whole sequence.
 */
const sequencesOf = (session: RecordedEvent[]): RecordedEvent[][] => {
  const sequences: RecordedEvent[][] = [];
  for (const [index, event] of session.entries()) {
    if (event.action.kind === "submit") {
      sequences.push(session.slice(0, index + 1));
    }
  }
  return sequences.length > 0 ? sequences : [session];
};

/**
 * Insert a navigate for any extra tab whose first action isn't one (a
 * pre-existing tab the user switched into mid-session), so replay can
 * materialize the tab. Origin fallback only — the pure miner has no live
 * tabs to ask; the manual-recording path (ensureTabEntryNavigates) prefers
 * the tab's live URL.
 */
const withEntryNavigates = (
  actions: StepAction[],
  tabIds: number[],
  events: RecordedEvent[]
): StepAction[] => {
  const result = [...actions];
  for (let ordinal = 1; ordinal < tabIds.length; ordinal += 1) {
    const firstIndex = result.findIndex(
      (action) => (action.tab ?? 0) === ordinal
    );
    if (firstIndex < 0 || result[firstIndex]?.kind === "navigate") {
      continue;
    }
    const url = events.find((event) => event.tabId === tabIds[ordinal])?.origin;
    if (url) {
      result.splice(firstIndex, 0, { kind: "navigate", tab: ordinal, url });
    }
  }
  return result;
};

/**
 * A mined sequence's workflow steps: tab-ordinal-stamped so multi-tab
 * sessions replay in their own tabs (ordinal 0 is the session's first tab),
 * with stray navigates from non-interactive tabs dropped. Falls back to raw
 * actions for legacy events without tab ids.
 */
const minedSteps = (sequence: RecordedEvent[]): StepAction[] => {
  const firstTab = sequence[0]?.tabId;
  if (firstTab === undefined) {
    return sequence.map((event) => event.action);
  }
  const { actions, tabIds } = assignTabOrdinals(sequence, firstTab);
  return withEntryNavigates(actions, tabIds, sequence);
};

/**
 * Fold closed sessions into the pattern table. ponytail: exact fingerprint
 * match; add fuzzy (LCS) matching only if real sites reorder steps enough
 * to matter.
 */
export function mine(
  closedSessions: RecordedEvent[][],
  patterns: Record<string, CandidatePattern>
): Record<string, CandidatePattern> {
  const next = { ...patterns };
  for (const sequence of closedSessions.flatMap(sequencesOf)) {
    if (sequence.length < MIN_SESSION_STEPS) {
      continue;
    }
    const fingerprint = fingerprintSession(sequence);
    const previous = next[fingerprint];
    next[fingerprint] = {
      count: (previous?.count ?? 0) + 1,
      fingerprint,
      lastSeen: sequence.at(-1)?.ts ?? 0,
      lastSuggestedAt: previous?.lastSuggestedAt,
      origin: sequence[0]?.origin ?? "",
      // Freshest steps win so replay uses the newest input values.
      steps: minedSteps(sequence),
    };
  }
  return next;
}

/**
 * Recording captures both the click on a submit button and the form's submit
 * event; replaying both would submit twice. Drop a click directly followed
 * by a submit when building workflow steps.
 */
export function toWorkflowSteps(steps: StepAction[]): StepAction[] {
  return steps.filter((step, index) => {
    const next = steps[index + 1];
    return !(
      step.kind === "click" &&
      next?.kind === "submit" &&
      (step.tab ?? 0) === (next.tab ?? 0)
    );
  });
}

/**
 * Patterns worth toasting right now. Stays pending across mining runs until
 * the user saves or dismisses it — retried (with a cooldown) whenever the
 * user is back on the pattern's origin.
 */
export function pendingSuggestions(options: {
  patterns: Record<string, CandidatePattern>;
  suppressed: string[];
  workflows: Workflow[];
  minRepeats: number;
  now: number;
}): CandidatePattern[] {
  const { patterns, suppressed, workflows, minRepeats, now } = options;
  const blocked = new Set(suppressed);
  const known = new Set(workflows.map((workflow) => workflow.fingerprint));
  return Object.values(patterns).filter(
    (pattern) =>
      pattern.count >= minRepeats &&
      !blocked.has(pattern.fingerprint) &&
      !blocked.has(`never:${pattern.origin}`) &&
      !known.has(pattern.fingerprint) &&
      (pattern.lastSuggestedAt === undefined ||
        now - pattern.lastSuggestedAt > SUGGEST_COOLDOWN_MS)
  );
}
