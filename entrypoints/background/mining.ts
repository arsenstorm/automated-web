/** Alarm-driven pattern mining and suggestion lifecycle. */

import { sendMessage } from "@/lib/messaging";
import {
  mine,
  pendingSuggestions,
  sessionize,
  toWorkflowSteps,
} from "@/lib/miner";
import { suggestName } from "@/lib/naming";
import { getStored, setStored } from "@/lib/storage";
import type { Workflow } from "@/lib/types";
import { vaultLocked } from "./vault";

const suggestToActiveTab = async (
  origin: string,
  fingerprint: string,
  stepCount: number
) => {
  const [tab] = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!(tab?.id !== undefined && tab.url?.startsWith(origin))) {
    return false;
  }
  return await sendMessage(
    "suggestWorkflow",
    { fingerprint, stepCount },
    tab.id
  )
    .then(() => true)
    .catch(() => false);
};

export const runMiner = async () => {
  if (await vaultLocked()) {
    return;
  }
  const [events, patterns, suppressed, workflows, settings] = await Promise.all(
    [
      getStored("events"),
      getStored("patterns"),
      getStored("suppressed"),
      getStored("workflows"),
      getStored("settings"),
    ]
  );
  const { closed, open } = sessionize(events, Date.now());
  let next = patterns;
  if (closed.length > 0) {
    next = mine(closed, patterns);
    await Promise.all([setStored("patterns", next), setStored("events", open)]);
  }
  // Pending suggestions retry every tick until the user is on that origin.
  const due = pendingSuggestions({
    patterns: next,
    suppressed,
    workflows,
    minRepeats: settings.minRepeats,
    now: Date.now(),
  });
  for (const pattern of due) {
    const shown = await suggestToActiveTab(
      pattern.origin,
      pattern.fingerprint,
      pattern.steps.length
    );
    if (shown) {
      next[pattern.fingerprint] = {
        ...pattern,
        lastSuggestedAt: Date.now(),
      };
      await setStored("patterns", next);
    }
  }
};

export const saveSuggestion = async (fingerprint: string) => {
  const patterns = await getStored("patterns");
  const pattern = patterns[fingerprint];
  if (!pattern) {
    return;
  }
  const workflows = await getStored("workflows");
  const host = new URL(pattern.origin).host;
  const steps = toWorkflowSteps(pattern.steps);
  const workflow: Workflow = {
    id: crypto.randomUUID(),
    origin: pattern.origin,
    name: suggestName(pattern.steps, host),
    createdAt: Date.now(),
    fingerprint,
    steps:
      steps[0]?.kind === "navigate"
        ? steps
        : [{ kind: "navigate", url: pattern.origin }, ...steps],
  };
  workflows.push(workflow);
  delete patterns[fingerprint];
  const suppressed = await getStored("suppressed");
  suppressed.push(fingerprint);
  await Promise.all([
    setStored("workflows", workflows),
    setStored("patterns", patterns),
    setStored("suppressed", suppressed),
  ]);
};

export const dismissSuggestion = async (
  fingerprint: string,
  never: boolean
) => {
  const [patterns, suppressed] = await Promise.all([
    getStored("patterns"),
    getStored("suppressed"),
  ]);
  const origin = patterns[fingerprint]?.origin;
  suppressed.push(never && origin ? `never:${origin}` : fingerprint);
  delete patterns[fingerprint];
  await Promise.all([
    setStored("patterns", patterns),
    setStored("suppressed", suppressed),
  ]);
};
