/** Manual workflow recording: mark a start point, cut events into a workflow. */

import { sendMessage } from "@/lib/messaging";
import { fingerprintSession, toWorkflowSteps } from "@/lib/miner";
import { getStored, setStored } from "@/lib/storage";
import { advanceTourAfterRecord } from "@/lib/tour";
import type { Workflow } from "@/lib/types";
import { buildWorkflow } from "@/lib/workflow";
import { getSecure, setSecure } from "./vault";

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

export const stopRecording = async (): Promise<Workflow | null> => {
  const recording = await getStored("recording");
  if (!recording) {
    return null;
  }
  await setStored("recording", null);
  await flushTabBuffers(recording.tabId);
  const events = (await getSecure("events")).filter(
    (event) =>
      event.tabId === recording.tabId && event.ts >= recording.startedAt
  );
  const steps = toWorkflowSteps(events.map((event) => event.action));
  if (!steps.some((step) => step.kind !== "navigate")) {
    return null;
  }
  const workflows = await getSecure("workflows");
  const workflow = buildWorkflow({
    actions: events.map((event) => event.action),
    // Suppresses future toasts if the miner spots the same flow.
    fingerprint: fingerprintSession(events),
    startUrl: recording.startUrl,
  });
  workflows.push(workflow);
  await setSecure("workflows", workflows);
  await advanceTourAfterRecord(workflow);
  return workflow;
};
