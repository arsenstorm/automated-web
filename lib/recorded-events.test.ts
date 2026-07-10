/** Pins sender stamping (stampEvents) and tab-ordinal assignment (assignTabOrdinals). */

import { describe, expect, it } from "vitest";
import { assignTabOrdinals, stampEvents } from "./recorded-events";
import type { RecordedEvent } from "./types";

const ORIGIN = "https://example.com";

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

describe("assignTabOrdinals", () => {
  const RECORDING_TAB = 1;

  it("assigns ordinal 0 to the recording tab with no tab field stamped", () => {
    const events: RecordedEvent[] = [
      {
        action: { kind: "navigate", url: `${ORIGIN}/a` },
        origin: ORIGIN,
        tabId: RECORDING_TAB,
        ts: 0,
      },
      {
        action: { kind: "click", selector: "#go" },
        origin: ORIGIN,
        tabId: RECORDING_TAB,
        ts: 1000,
      },
    ];
    const { actions, tabIds } = assignTabOrdinals(events, RECORDING_TAB);
    expect(tabIds).toEqual([RECORDING_TAB]);
    expect(actions.every((action) => action.tab === undefined)).toBe(true);
  });

  it("stamps a second tab's actions with tab: 1 in ts order", () => {
    const events: RecordedEvent[] = [
      {
        action: { kind: "navigate", url: `${ORIGIN}/a` },
        origin: ORIGIN,
        tabId: RECORDING_TAB,
        ts: 0,
      },
      {
        action: { kind: "navigate", url: `${ORIGIN}/b` },
        origin: ORIGIN,
        tabId: 2,
        ts: 500,
      },
      {
        action: { kind: "click", selector: "#other-tab" },
        origin: ORIGIN,
        tabId: 2,
        ts: 1000,
      },
      {
        action: { kind: "click", selector: "#go" },
        origin: ORIGIN,
        tabId: RECORDING_TAB,
        ts: 1500,
      },
    ];
    const { actions, tabIds } = assignTabOrdinals(events, RECORDING_TAB);
    expect(tabIds).toEqual([RECORDING_TAB, 2]);
    const otherTabActions = actions.filter(
      (action) => "selector" in action && action.selector === "#other-tab"
    );
    expect(otherTabActions[0]?.tab).toBe(1);
  });

  it("keeps a navigate-only tab spawned from a kept tab", () => {
    const events: RecordedEvent[] = [
      {
        action: { kind: "click", selector: "#open-doc" },
        origin: ORIGIN,
        tabId: RECORDING_TAB,
        ts: 0,
      },
      {
        action: { kind: "navigate", url: `${ORIGIN}/doc` },
        origin: ORIGIN,
        tabId: 2,
        ts: 500,
      },
    ];
    const { actions, tabIds } = assignTabOrdinals(events, RECORDING_TAB, [
      { openerTabId: RECORDING_TAB, tabId: 2 },
    ]);
    expect(tabIds).toEqual([RECORDING_TAB, 2]);
    expect(actions[1]).toMatchObject({ kind: "navigate", tab: 1 });
  });

  it("keeps a chain of spawned tabs regardless of spawn-edge order", () => {
    const events: RecordedEvent[] = [
      {
        action: { kind: "navigate", url: `${ORIGIN}/b` },
        origin: ORIGIN,
        tabId: 2,
        ts: 0,
      },
      {
        action: { kind: "navigate", url: `${ORIGIN}/c` },
        origin: ORIGIN,
        tabId: 3,
        ts: 500,
      },
    ];
    // Edge order reversed on purpose: the fixpoint must still close the chain.
    const { tabIds } = assignTabOrdinals(events, RECORDING_TAB, [
      { openerTabId: 2, tabId: 3 },
      { openerTabId: RECORDING_TAB, tabId: 2 },
    ]);
    expect(tabIds).toEqual([RECORDING_TAB, 2, 3]);
  });

  it("drops a navigate-only tab spawned from an unrelated tab", () => {
    const events: RecordedEvent[] = [
      {
        action: { kind: "navigate", url: `${ORIGIN}/b` },
        origin: ORIGIN,
        tabId: 2,
        ts: 0,
      },
    ];
    const { tabIds } = assignTabOrdinals(events, RECORDING_TAB, [
      { openerTabId: 99, tabId: 2 },
    ]);
    expect(tabIds).toEqual([RECORDING_TAB]);
  });

  it("drops a tab that only ever navigated", () => {
    const events: RecordedEvent[] = [
      {
        action: { kind: "navigate", url: `${ORIGIN}/a` },
        origin: ORIGIN,
        tabId: RECORDING_TAB,
        ts: 0,
      },
      {
        action: { kind: "navigate", url: `${ORIGIN}/b` },
        origin: ORIGIN,
        tabId: 2,
        ts: 500,
      },
    ];
    const { actions, tabIds } = assignTabOrdinals(events, RECORDING_TAB);
    expect(tabIds).toEqual([RECORDING_TAB]);
    expect(actions).toHaveLength(1);
  });

  it("drops events with an undefined tabId", () => {
    const events: RecordedEvent[] = [
      {
        action: { kind: "navigate", url: `${ORIGIN}/a` },
        origin: ORIGIN,
        tabId: RECORDING_TAB,
        ts: 0,
      },
      { action: { kind: "click", selector: "#go" }, origin: ORIGIN, ts: 1000 },
    ];
    const { actions } = assignTabOrdinals(events, RECORDING_TAB);
    expect(actions).toHaveLength(1);
  });
});
