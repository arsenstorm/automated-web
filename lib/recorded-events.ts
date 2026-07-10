/** Shapes raw recorded events: sender stamping and tab-ordinal assignment. Pure — no browser APIs. */

import type { RecordedEvent, StepAction } from "./types";

/**
 * Stamp a flushed event batch with its sender's identity — the trust
 * boundary: every value here derives from the browser's MessageSender, which
 * pages cannot forge. Subframe batches additionally get the frame's URL on
 * each action (replay needs it to find the frame again), the tab's origin
 * instead of the iframe's (so sessions group under the page the user sees),
 * and their navigate events dropped (only the top frame narrates navigation).
 */
export function stampEvents(
  events: RecordedEvent[],
  sender: {
    tabId?: number;
    frameId?: number;
    frameUrl?: string;
    tabUrl?: string;
  }
): RecordedEvent[] {
  const { tabId, frameId, frameUrl, tabUrl } = sender;
  if (!(frameId && frameUrl)) {
    return events.map((event) => ({ ...event, tabId }));
  }
  const tabOrigin =
    tabUrl && URL.canParse(tabUrl) ? new URL(tabUrl).origin : undefined;
  return events
    .filter((event) => event.action.kind !== "navigate")
    .map((event) => ({
      ...event,
      action: { ...event.action, frameUrl },
      origin: tabOrigin ?? event.origin,
      tabId,
    }));
}

/**
 * Cut a recording's event stream into tab-stamped workflow actions. Keeps
 * only "interaction tabs" — tabs with at least one non-navigate event, plus
 * the recording tab, plus tabs spawned from a kept tab (a link opened in a
 * new tab is a step even if the user never interacts there) — so unrelated
 * background tabs that merely loaded a page never leak into the workflow.
 * Ordinal 0 is the recording tab; other tabs are numbered in
 * first-event order.
 */
export function assignTabOrdinals(
  events: RecordedEvent[],
  recordingTabId: number,
  spawns: { openerTabId: number; tabId: number }[] = []
): { actions: StepAction[]; tabIds: number[] } {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const interactive = new Set([recordingTabId]);
  for (const event of sorted) {
    if (event.tabId !== undefined && event.action.kind !== "navigate") {
      interactive.add(event.tabId);
    }
  }
  // Fixpoint so a chain of opened tabs (A opens B opens C) is kept whole.
  let grew = true;
  while (grew) {
    grew = false;
    for (const spawn of spawns) {
      if (interactive.has(spawn.openerTabId) && !interactive.has(spawn.tabId)) {
        interactive.add(spawn.tabId);
        grew = true;
      }
    }
  }
  const kept = sorted.filter(
    (event) => event.tabId !== undefined && interactive.has(event.tabId)
  );
  const tabIds = [recordingTabId];
  for (const event of kept) {
    if (event.tabId !== undefined && !tabIds.includes(event.tabId)) {
      tabIds.push(event.tabId);
    }
  }
  const actions = kept.map((event) => {
    const ordinal = tabIds.indexOf(event.tabId ?? recordingTabId);
    return ordinal === 0 ? event.action : { ...event.action, tab: ordinal };
  });
  return { actions, tabIds };
}
