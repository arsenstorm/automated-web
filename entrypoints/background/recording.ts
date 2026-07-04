/** Manual workflow recording: mark a start point, cut events into a workflow. */

import { sendMessage } from "@/lib/messaging";
import { fingerprintSession, toWorkflowSteps } from "@/lib/miner";
import { suggestName } from "@/lib/naming";
import { getStored, setStored } from "@/lib/storage";
import type { Workflow } from "@/lib/types";

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
  await sendMessage("flushNow", undefined, recording.tabId).catch(() => null);
  const events = (await getStored("events")).filter(
    (event) =>
      event.tabId === recording.tabId && event.ts >= recording.startedAt
  );
  const steps = toWorkflowSteps(events.map((event) => event.action));
  if (!steps.some((step) => step.kind !== "navigate")) {
    return null;
  }
  const workflows = await getStored("workflows");
  const workflow: Workflow = {
    id: crypto.randomUUID(),
    origin: new URL(recording.startUrl).origin,
    name: suggestName(
      events.map((event) => event.action),
      new URL(recording.startUrl).host
    ),
    createdAt: Date.now(),
    // Suppresses future toasts if the miner spots the same flow.
    fingerprint: fingerprintSession(events),
    steps:
      steps[0]?.kind === "navigate"
        ? steps
        : [{ kind: "navigate", url: recording.startUrl }, ...steps],
  };
  workflows.push(workflow);
  await setStored("workflows", workflows);
  return workflow;
};
