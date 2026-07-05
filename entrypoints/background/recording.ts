/** Manual workflow recording: mark a start point, cut events into a workflow. */

import { sendMessage } from "@/lib/messaging";
import { fingerprintSession, toWorkflowSteps } from "@/lib/miner";
import { getStored, setStored } from "@/lib/storage";
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

export const stopRecording = async (): Promise<Workflow | null> => {
  const recording = await getStored("recording");
  if (!recording) {
    return null;
  }
  await setStored("recording", null);
  // Pull whatever the tab still has buffered before cutting the workflow.
  // Per frame: a tab-wide broadcast resolves on the first frame's response,
  // which wouldn't guarantee iframe buffers landed.
  const frames = (await browser.webNavigation
    .getAllFrames({ tabId: recording.tabId })
    .catch(() => null)) ?? [{ frameId: 0 }];
  await Promise.all(
    frames.map((frame) =>
      sendMessage("flushNow", undefined, {
        tabId: recording.tabId,
        frameId: frame.frameId,
      }).catch(() => null)
    )
  );
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
    startUrl: recording.startUrl,
    // Suppresses future toasts if the miner spots the same flow.
    fingerprint: fingerprintSession(events),
  });
  workflows.push(workflow);
  await setSecure("workflows", workflows);
  return workflow;
};
