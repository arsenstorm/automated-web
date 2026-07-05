import { describe, expect, it } from "vitest";
import {
  fingerprintSession,
  mine,
  pendingSuggestions,
  SESSION_GAP_MS,
  SUGGEST_COOLDOWN_MS,
  sessionize,
  stampEvents,
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

describe("stampEvents", () => {
  const FRAME_URL = "https://widget.example.com/form?token=abc";
  const batch = (): RecordedEvent[] => [
    {
      action: { kind: "navigate", url: FRAME_URL },
      origin: "https://widget.example.com",
      ts: 0,
    },
    {
      action: { kind: "click", selector: "#go" },
      origin: "https://widget.example.com",
      ts: 1000,
    },
  ];

  it("stamps top-frame batches with the tabId only", () => {
    const stamped = stampEvents(batch(), { frameId: 0, tabId: 7 });
    expect(stamped).toHaveLength(2);
    expect(stamped[0]?.tabId).toBe(7);
    expect(stamped[0]?.origin).toBe("https://widget.example.com");
    expect(stamped[1]?.action).not.toHaveProperty("frameUrl");
  });

  it("marks subframe actions with the frame URL and the tab's origin", () => {
    const stamped = stampEvents(batch(), {
      frameId: 42,
      frameUrl: FRAME_URL,
      tabId: 7,
      tabUrl: `${ORIGIN}/checkout`,
    });
    // The subframe's navigate event is dropped: only the top frame narrates.
    expect(stamped.map((event) => event.action.kind)).toEqual(["click"]);
    expect(stamped[0].tabId).toBe(7);
    expect(stamped[0].origin).toBe(ORIGIN);
    expect(stamped[0].action.frameUrl).toBe(FRAME_URL);
  });
});

describe("sessionize", () => {
  it("splits on time gaps and origin changes, keeps the open tail", () => {
    const events = [
      ...loginSession(0),
      ...loginSession(SESSION_GAP_MS * 2, { origin: "https://other.com" }),
      ...loginSession(SESSION_GAP_MS * 4),
    ];
    const now = SESSION_GAP_MS * 4 + 10_000;
    const { closed, open } = sessionize(events, now);
    expect(closed.length).toBe(2);
    expect(open.length).toBe(4);
  });

  it("closes everything when the tail is stale", () => {
    const { closed, open } = sessionize(loginSession(0), SESSION_GAP_MS * 10);
    expect(closed.length).toBe(1);
    expect(open.length).toBe(0);
  });

  it("splits back-to-back repeats when the flow restarts", () => {
    // Three quick logins with no idle gap: navigating back to /login
    // (the session's start pathname) begins a new session.
    const events = [
      ...loginSession(0),
      ...loginSession(10_000),
      ...loginSession(20_000),
    ];
    const { closed, open } = sessionize(events, SESSION_GAP_MS * 10);
    expect(closed.length).toBe(3);
    expect(open.length).toBe(0);
    expect(new Set(closed.map(fingerprintSession)).size).toBe(1);
  });
});

describe("fingerprintSession", () => {
  it("ignores input values and URL query strings", () => {
    const a = loginSession(0, { password: "ref-a" });
    const b = loginSession(99_999, { password: "ref-b" });
    expect(fingerprintSession(a)).toBe(fingerprintSession(b));
  });

  it("differs across origins", () => {
    const a = loginSession(0);
    const b = loginSession(0, { origin: "https://other.com" });
    expect(fingerprintSession(a)).not.toBe(fingerprintSession(b));
  });
});

describe("mine", () => {
  it("counts repeats and keeps the freshest steps", () => {
    const patterns = mine(
      [
        loginSession(0, { password: "ref-old" }),
        loginSession(100_000, { password: "ref-new" }),
      ],
      {}
    );
    const [pattern] = Object.values(patterns);
    expect(pattern?.count).toBe(2);
    const inputStep = pattern?.steps.find(
      (step) => step.kind === "input" && step.sensitive
    );
    expect(inputStep?.kind === "input" && inputStep.value).toBe("ref-new");
  });

  it("preserves the suggestion cooldown across mining runs", () => {
    const first = mine([loginSession(0)], {});
    const fp = Object.keys(first)[0] ?? "";
    const withCooldown = {
      [fp]: { ...(first[fp] as CandidatePattern), lastSuggestedAt: 123 },
    };
    const second = mine([loginSession(100_000)], withCooldown);
    expect(second[fp]?.lastSuggestedAt).toBe(123);
    expect(second[fp]?.count).toBe(2);
  });

  it("ignores sessions with fewer than 3 steps", () => {
    const patterns = mine([loginSession(0).slice(0, 2)], {});
    expect(Object.keys(patterns).length).toBe(0);
  });

  it("mines the submit prefix, so trailing noise doesn't split counts", () => {
    // Two sessions ending with a logout click, one without: all three must
    // fold into the same pattern.
    const logoutTail = (ts: number): RecordedEvent[] => [
      {
        action: { kind: "navigate", url: `${ORIGIN}/secure` },
        origin: ORIGIN,
        ts,
      },
      {
        action: { kind: "click", selector: "#logout", text: "Logout" },
        origin: ORIGIN,
        ts: ts + 1000,
      },
    ];
    const patterns = mine(
      [
        [...loginSession(0), ...logoutTail(4000)],
        [...loginSession(100_000), ...logoutTail(104_000)],
        loginSession(200_000),
      ],
      {}
    );
    const counts = Object.values(patterns).map((pattern) => pattern.count);
    expect(Math.max(...counts)).toBe(3);
  });
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
