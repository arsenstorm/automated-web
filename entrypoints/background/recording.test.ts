/**
 * stopRecording tab handling: spawned tabs are kept without interaction,
 * user closes become close-tab steps, unrelated tabs stay out.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { setStored } from "@/lib/storage";
import type { RecordedEvent } from "@/lib/types";
import { stopRecording } from "./recording";
import { setSecure } from "./vault";

const ORIGIN = "https://example.com";
const RECORDING_TAB = 10;
const SPAWNED_TAB = 20;
const UNRELATED_TAB = 30;

const EVENTS: RecordedEvent[] = [
  {
    action: { kind: "navigate", url: `${ORIGIN}/start` },
    origin: ORIGIN,
    tabId: RECORDING_TAB,
    ts: 0,
  },
  {
    action: { kind: "click", selector: "#open-doc", text: "Open doc" },
    origin: ORIGIN,
    tabId: RECORDING_TAB,
    ts: 1000,
  },
  {
    action: { kind: "navigate", url: "https://unrelated.example/feed" },
    origin: "https://unrelated.example",
    tabId: UNRELATED_TAB,
    ts: 1500,
  },
  {
    action: { kind: "navigate", url: `${ORIGIN}/doc` },
    origin: ORIGIN,
    tabId: SPAWNED_TAB,
    ts: 2000,
  },
];

describe("stopRecording with spawned and closed tabs", () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await setSecure("events", EVENTS);
    await setStored("recording", {
      closes: [
        { tabId: UNRELATED_TAB, ts: 1600 },
        { tabId: SPAWNED_TAB, ts: 3000 },
      ],
      spawns: [{ openerTabId: RECORDING_TAB, tabId: SPAWNED_TAB }],
      startedAt: 0,
      startUrl: `${ORIGIN}/start`,
      tabId: RECORDING_TAB,
    });
  });

  it("keeps the read-only spawned tab and records its close as a step", async () => {
    const workflow = await stopRecording();
    expect(workflow?.steps.map((step) => step.kind)).toEqual([
      "navigate",
      "click",
      "navigate",
      "close-tab",
    ]);
    expect(workflow?.steps[2]).toMatchObject({ tab: 1, url: `${ORIGIN}/doc` });
    expect(workflow?.steps[3]).toMatchObject({ kind: "close-tab", tab: 1 });
  });

  it("keeps the unrelated tab and its close out of the workflow", async () => {
    const workflow = await stopRecording();
    expect(
      workflow?.steps.some(
        (step) => step.kind === "navigate" && step.url.includes("unrelated")
      )
    ).toBe(false);
    // Ordinals only cover the recording tab and the spawned tab.
    expect(workflow?.steps.every((step) => (step.tab ?? 0) <= 1)).toBe(true);
  });
});
