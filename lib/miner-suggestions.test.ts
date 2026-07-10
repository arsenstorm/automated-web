/** Pins workflow-step cleanup (toWorkflowSteps) and suggestion gating (pendingSuggestions). */

import { describe, expect, it } from "vitest";
import {
  fingerprintSession,
  pendingSuggestions,
  SUGGEST_COOLDOWN_MS,
  toWorkflowSteps,
} from "./miner";
import type { CandidatePattern, RecordedEvent, StepAction } from "./types";

const ORIGIN = "https://example.com";

const loginSession = (
  startTs: number,
  { password = "ref-a", origin = ORIGIN } = {}
): RecordedEvent[] => {
  const actions: StepAction[] = [
    { kind: "navigate", url: `${origin}/login?next=/home` },
    {
      kind: "input",
      selector: 'input[name="user"]',
      sensitive: false,
      value: "ref-u",
    },
    {
      kind: "input",
      selector: 'input[name="pass"]',
      sensitive: true,
      value: password,
    },
    { kind: "submit", selector: "#login-form" },
  ];
  return actions.map((action, i) => ({
    action,
    origin,
    ts: startTs + i * 1000,
  }));
};

const patternFor = (
  session: RecordedEvent[],
  overrides: Partial<CandidatePattern> = {}
): CandidatePattern => ({
  count: 3,
  fingerprint: fingerprintSession(session),
  lastSeen: session.at(-1)?.ts ?? 0,
  origin: ORIGIN,
  steps: session.map((event) => event.action),
  ...overrides,
});

describe("toWorkflowSteps", () => {
  it("drops a click directly followed by a submit (double-submit guard)", () => {
    const steps: StepAction[] = [
      { kind: "navigate", url: `${ORIGIN}/login` },
      {
        kind: "input",
        selector: 'input[name="user"]',
        sensitive: false,
        value: "r",
      },
      { kind: "click", selector: "#login-button", text: "Login" },
      { kind: "submit", selector: "#login-form" },
    ];
    expect(toWorkflowSteps(steps).map((step) => step.kind)).toEqual([
      "navigate",
      "input",
      "submit",
    ]);
  });

  it("keeps clicks not followed by a submit", () => {
    const steps: StepAction[] = [
      { kind: "click", selector: "#menu" },
      { kind: "click", selector: "#item" },
    ];
    expect(toWorkflowSteps(steps)).toEqual(steps);
  });

  it("does not dedupe a click and submit on different tabs", () => {
    const steps: StepAction[] = [
      { kind: "click", selector: "#login-button", tab: 0 },
      { kind: "submit", selector: "#login-form", tab: 1 },
    ];
    expect(toWorkflowSteps(steps)).toEqual(steps);
  });

  it("still dedupes a click and submit on the same explicit tab", () => {
    const steps: StepAction[] = [
      { kind: "click", selector: "#login-button", tab: 1 },
      { kind: "submit", selector: "#login-form", tab: 1 },
    ];
    expect(toWorkflowSteps(steps).map((step) => step.kind)).toEqual(["submit"]);
  });
});

describe("pendingSuggestions", () => {
  const base = {
    minRepeats: 3,
    now: 1_000_000,
    suppressed: [],
    workflows: [],
  };
  const session = loginSession(0);

  it("suggests once the repeat threshold is met", () => {
    const below = patternFor(session, { count: 2 });
    const at = patternFor(session, { count: 3 });
    expect(
      pendingSuggestions({ ...base, patterns: { [below.fingerprint]: below } })
        .length
    ).toBe(0);
    expect(
      pendingSuggestions({ ...base, patterns: { [at.fingerprint]: at } }).length
    ).toBe(1);
  });

  it("stays pending across runs but respects the cooldown", () => {
    const pattern = patternFor(session);
    const patterns = { [pattern.fingerprint]: pattern };
    expect(pendingSuggestions({ ...base, patterns }).length).toBe(1);
    // Still pending on a later run (user wasn't on the origin earlier).
    expect(pendingSuggestions({ ...base, patterns }).length).toBe(1);

    const shown = {
      [pattern.fingerprint]: { ...pattern, lastSuggestedAt: base.now },
    };
    expect(pendingSuggestions({ ...base, patterns: shown }).length).toBe(0);
    expect(
      pendingSuggestions({
        ...base,
        now: base.now + SUGGEST_COOLDOWN_MS + 1,
        patterns: shown,
      }).length
    ).toBe(1);
  });

  it("skips suppressed fingerprints and never-listed origins", () => {
    const pattern = patternFor(session);
    const patterns = { [pattern.fingerprint]: pattern };
    expect(
      pendingSuggestions({
        ...base,
        patterns,
        suppressed: [pattern.fingerprint],
      }).length
    ).toBe(0);
    expect(
      pendingSuggestions({
        ...base,
        patterns,
        suppressed: [`never:${ORIGIN}`],
      }).length
    ).toBe(0);
  });

  it("skips patterns already saved as workflows", () => {
    const pattern = patternFor(session);
    expect(
      pendingSuggestions({
        ...base,
        patterns: { [pattern.fingerprint]: pattern },
        workflows: [
          {
            createdAt: 0,
            fingerprint: pattern.fingerprint,
            id: "w1",
            name: "Login",
            origin: ORIGIN,
            steps: [],
          },
        ],
      }).length
    ).toBe(0);
  });
});
