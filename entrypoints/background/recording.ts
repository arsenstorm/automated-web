/** Manual workflow recording: mark a start point, cut events into a workflow. */

import { sendMessage } from "@/lib/messaging";
import { fingerprintSession, toWorkflowSteps } from "@/lib/miner";
import { assignTabOrdinals } from "@/lib/recorded-events";
import { getStored, setStored } from "@/lib/storage";
import { advanceTourAfterRecord } from "@/lib/tour";
import type {
  RecordedEvent,
  RecordingState,
  StepAction,
  Workflow,
} from "@/lib/types";
import { buildWorkflow } from "@/lib/workflow";
import { getSecure, setSecure } from "./vault";

/** Serialized recording updates: rapid tab events must not lose writes. */
let pendingTabNote: Promise<unknown> = Promise.resolve();
const noteTabEvent = (
  update: (recording: RecordingState) => Partial<RecordingState>
): void => {
  pendingTabNote = pendingTabNote
    .catch(() => undefined)
    .then(async () => {
      const recording = await getStored("recording");
      if (recording) {
        await setStored("recording", { ...recording, ...update(recording) });
      }
    });
};

/**
 * Note tabs opened (with an opener) or closed while a recording is active:
 * spawned tabs are kept in the workflow even without interaction, and a
 * close becomes a close-tab step if its tab is kept. Registered at SW
 * startup; no-ops when nothing is recording.
 */
export const watchRecordingTabs = () => {
  browser.tabs.onCreated.addListener(
    (tab: { id?: number; openerTabId?: number }) => {
      if (tab.id !== undefined && tab.openerTabId !== undefined) {
        const spawn = { openerTabId: tab.openerTabId, tabId: tab.id };
        noteTabEvent((recording) => ({
          spawns: [...(recording.spawns ?? []), spawn],
        }));
      }
    }
  );
  browser.tabs.onRemoved.addListener((tabId: number) => {
    const close = { tabId, ts: Date.now() };
    noteTabEvent((recording) => ({
      closes: [...(recording.closes ?? []), close],
    }));
  });
};

export const startRecording = async (): Promise<boolean> => {
  const [tab] = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tab?.id === undefined || !tab.url?.startsWith("http")) {
    return false;
  }
  await setStored("recording", {
    startedAt: Date.now(),
    startUrl: tab.url,
    tabId: tab.id,
  });
  return true;
};

/**
 * Pull whatever the tab still has buffered into stored events. Per frame: a
 * tab-wide broadcast resolves on the first frame's response, which wouldn't
 * guarantee iframe buffers landed.
 */
export const flushTabBuffers = async (tabId: number): Promise<void> => {
  // Promise.resolve wrapper: fake-browser's getAllFrames throws synchronously.
  const frames = (await Promise.resolve()
    .then(() => browser.webNavigation.getAllFrames({ tabId }))
    .catch(() => null)) ?? [{ frameId: 0 }];
  await Promise.all(
    frames.map((frame) =>
      sendMessage("flushNow", undefined, {
        frameId: frame.frameId,
        tabId,
      }).catch(() => null)
    )
  );
};

/** Flush every http tab: which tabs the recording touched isn't known until buffers land. */
export const flushAllTabBuffers = async (): Promise<void> => {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.flatMap((tab) =>
      tab.id !== undefined && tab.url?.startsWith("http")
        ? [flushTabBuffers(tab.id)]
        : []
    )
  );
};

/**
 * A pre-existing tab the user switched to mid-recording has no load event, so
 * its first action isn't a navigate and replay couldn't materialize the tab.
 * Insert one, preferring the tab's live URL over the first event's origin.
 */
const ensureTabEntryNavigates = async (
  actions: StepAction[],
  tabIds: number[],
  events: RecordedEvent[]
): Promise<StepAction[]> => {
  const result = [...actions];
  for (let ordinal = 1; ordinal < tabIds.length; ordinal += 1) {
    const firstIndex = result.findIndex(
      (action) => (action.tab ?? 0) === ordinal
    );
    if (firstIndex < 0 || result[firstIndex]?.kind === "navigate") {
      continue;
    }
    const tabId = tabIds[ordinal];
    // biome-ignore lint/performance/noAwaitInLoops: one lookup per extra tab, ordinals stay in order.
    const liveUrl = await browser.tabs
      .get(tabId ?? -1)
      .then((tab) => tab.url)
      .catch(() => undefined);
    const url = liveUrl?.startsWith("http")
      ? liveUrl
      : events.find((event) => event.tabId === tabId)?.origin;
    if (url) {
      result.splice(firstIndex, 0, { kind: "navigate", tab: ordinal, url });
    }
  }
  return result;
};

export const stopRecording = async (): Promise<Workflow | null> => {
  // Let any in-flight spawn/close note land before the state is read.
  await pendingTabNote.catch(() => undefined);
  const recording = await getStored("recording");
  if (!recording) {
    return null;
  }
  await setStored("recording", null);
  await flushAllTabBuffers();
  const events = (await getSecure("events")).filter(
    (event) => event.ts >= recording.startedAt
  );
  const spawns = recording.spawns ?? [];
  // Two passes: closes only become steps for tabs the workflow keeps, and
  // which tabs those are isn't known until ordinals are assigned once.
  // Synthesized here rather than recorded as events so the miner's shared
  // stream never sees close-tab actions.
  const { tabIds: keptTabIds } = assignTabOrdinals(
    events,
    recording.tabId,
    spawns
  );
  const closeEvents: RecordedEvent[] = (recording.closes ?? [])
    .filter((close) => keptTabIds.includes(close.tabId))
    .map((close) => ({
      action: { kind: "close-tab" },
      origin: "",
      tabId: close.tabId,
      ts: close.ts,
    }));
  const { actions, tabIds } = assignTabOrdinals(
    [...events, ...closeEvents],
    recording.tabId,
    spawns
  );
  const withEntries = await ensureTabEntryNavigates(actions, tabIds, events);
  const steps = toWorkflowSteps(withEntries);
  if (!steps.some((step) => step.kind !== "navigate")) {
    return null;
  }
  const keptEvents = events.filter(
    (event) => event.tabId !== undefined && tabIds.includes(event.tabId)
  );
  const workflows = await getSecure("workflows");
  const workflow = buildWorkflow({
    actions: withEntries,
    // Suppresses future toasts if the miner spots the same flow.
    fingerprint: fingerprintSession(keptEvents),
    startUrl: recording.startUrl,
  });
  workflows.push(workflow);
  await setSecure("workflows", workflows);
  await advanceTourAfterRecord(workflow);
  return workflow;
};
