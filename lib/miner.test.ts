/** Pins the mining pipeline: sessionizing events, fingerprinting sessions, and folding sessions into patterns. */

import { describe, expect, it } from "vitest";
import { fingerprintSession, mine, SESSION_GAP_MS, sessionize } from "./miner";
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

  it("stamps tab ordinals on a multi-tab session's steps", () => {
    const events: RecordedEvent[] = [
      {
        action: { kind: "navigate", url: `${ORIGIN}/list` },
        origin: ORIGIN,
        tabId: 1,
        ts: 0,
      },
      {
        action: { kind: "click", selector: "#open-item" },
        origin: ORIGIN,
        tabId: 1,
        ts: 1000,
      },
      {
        action: { kind: "navigate", url: `${ORIGIN}/item` },
        origin: ORIGIN,
        tabId: 2,
        ts: 2000,
      },
      {
        action: { kind: "click", selector: "#copy" },
        origin: ORIGIN,
        tabId: 2,
        ts: 3000,
      },
    ];
    const [pattern] = Object.values(mine([events], {}));
    expect(pattern?.steps.map((step) => step.tab ?? 0)).toEqual([0, 0, 1, 1]);
  });

  it("inserts an entry navigate for a tab that starts mid-flow", () => {
    const events: RecordedEvent[] = [
      {
        action: { kind: "navigate", url: `${ORIGIN}/list` },
        origin: ORIGIN,
        tabId: 1,
        ts: 0,
      },
      {
        action: { kind: "click", selector: "#open-item" },
        origin: ORIGIN,
        tabId: 1,
        ts: 1000,
      },
      {
        action: { kind: "click", selector: "#pre-existing" },
        origin: ORIGIN,
        tabId: 2,
        ts: 2000,
      },
    ];
    const [pattern] = Object.values(mine([events], {}));
    expect(pattern?.steps[2]).toMatchObject({
      kind: "navigate",
      tab: 1,
      url: ORIGIN,
    });
    expect(pattern?.steps[3]).toMatchObject({ kind: "click", tab: 1 });
  });

  it("drops a non-interactive tab's stray navigate from mined steps", () => {
    // Sorted: sequencesOf cuts the submit prefix in array order, and the
    // stray navigate must land inside it.
    const events: RecordedEvent[] = [
      ...loginSession(0).map((event) => ({ ...event, tabId: 1 })),
      {
        action: { kind: "navigate", url: `${ORIGIN}/background-load` },
        origin: ORIGIN,
        tabId: 2,
        ts: 500,
      } as RecordedEvent,
    ].sort((a, b) => a.ts - b.ts);
    const [pattern] = Object.values(mine([events], {}));
    expect(
      pattern?.steps.some(
        (step) => step.kind === "navigate" && step.url.includes("background")
      )
    ).toBe(false);
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
