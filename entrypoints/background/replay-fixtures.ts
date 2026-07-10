/** Shared fixtures for the replay test suites. */

import { fakeBrowser } from "wxt/testing";
import type { RunState, Workflow } from "@/lib/types";

export const CLICK = { kind: "click", selector: "#go" } as const;
export const NAV = { kind: "navigate", url: "https://example.com/" } as const;
export const THREE_STEPS: Workflow = {
  createdAt: 0,
  fingerprint: "fp",
  id: "wf-1",
  name: "Test flow",
  origin: "https://example.com",
  steps: [{ kind: "navigate", url: "https://example.com/" }, CLICK, CLICK],
};

export const pausedRun = (tabId: number, stepIndex: number): RunState => ({
  id: "run-1",
  pausedReason: "captcha",
  status: "paused",
  stepIndex,
  tabId,
  workflowId: "wf-1",
});

export const liveTabId = async (): Promise<number> => {
  const tab = await fakeBrowser.tabs.create({ url: "https://example.com/" });
  return tab.id ?? 0;
};
