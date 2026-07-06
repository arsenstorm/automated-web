import { fireAndForget, onMessage } from "@/lib/messaging";
import { stampEvents } from "@/lib/miner";
import { getStored, setStored } from "@/lib/storage";
import { EVENT_BUFFER_CAP } from "@/lib/types";
import { validateSteps } from "@/lib/workflow";
import { dismissSuggestion, runMiner, saveSuggestion } from "./mining";
import { startRecording, stopRecording } from "./recording";
import { continueRun, pauseInterruptedRun, startRun } from "./replay";
import {
  getSecure,
  lockVault,
  resetVault,
  setSecure,
  setVaultPassword,
  unlockVault,
  vaultLocked,
  vaultStatus,
} from "./vault";

const MINE_ALARM = "mine";
const MINE_PERIOD_MINUTES = 1;

export default defineBackground(() => {
  // Open the side panel when the toolbar icon is clicked (Chromium only).
  browser.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

  // Chrome only injects manifest content scripts into pages loaded after the
  // extension is installed; without this, tabs already open at install time
  // silently record nothing until reloaded.
  browser.runtime.onInstalled.addListener(async () => {
    const tabs = await browser.tabs.query({
      url: ["http://*/*", "https://*/*"],
    });
    await Promise.all(
      tabs.map((tab) =>
        tab.id === undefined
          ? null
          : browser.scripting
              .executeScript({
                files: ["/content-scripts/content.js"],
                target: { allFrames: true, tabId: tab.id },
              })
              .catch(() => null)
      )
    );
  });

  browser.alarms.create(MINE_ALARM, { periodInMinutes: MINE_PERIOD_MINUTES });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === MINE_ALARM) {
      fireAndForget(runMiner());
    }
  });

  fireAndForget(pauseInterruptedRun());

  onMessage("ping", () => {
    // Liveness check.
  });
  onMessage("recordEvents", async ({ data, sender }) => {
    if (await vaultLocked()) {
      return;
    }
    const events = await getSecure("events");
    events.push(
      ...stampEvents(data, {
        frameId: sender.frameId,
        frameUrl: sender.url,
        tabId: sender.tab?.id,
        tabUrl: sender.tab?.url,
      })
    );
    await setSecure("events", events.slice(-EVENT_BUFFER_CAP));
  });
  onMessage("startRecording", () => startRecording());
  onMessage("stopRecording", () => stopRecording());
  onMessage("cancelRecording", () => setStored("recording", null));
  onMessage("getRecording", () => getStored("recording"));
  onMessage("saveSuggestion", ({ data }) => saveSuggestion(data.fingerprint));
  onMessage("dismissSuggestion", ({ data }) =>
    dismissSuggestion(data.fingerprint, data.never)
  );
  onMessage("listWorkflows", () => getSecure("workflows"));
  onMessage("deleteWorkflow", async ({ data }) => {
    const workflows = await getSecure("workflows");
    await setSecure(
      "workflows",
      workflows.filter((workflow) => workflow.id !== data)
    );
    const run = await getStored("run");
    if (run?.workflowId === data) {
      await setStored("run", null);
    }
  });
  onMessage("updateWorkflowSteps", async ({ data }) => {
    const run = await getStored("run");
    if (run?.workflowId === data.id && run.status !== "done") {
      throw new Error("Stop the active run before editing");
    }
    const error = validateSteps(data.steps);
    if (error) {
      throw new Error(error);
    }
    const workflows = await getSecure("workflows");
    await setSecure(
      "workflows",
      workflows.map((workflow) =>
        workflow.id === data.id ? { ...workflow, steps: data.steps } : workflow
      )
    );
  });
  onMessage("renameWorkflow", async ({ data }) => {
    const workflows = await getSecure("workflows");
    await setSecure(
      "workflows",
      workflows.map((workflow) =>
        workflow.id === data.id ? { ...workflow, name: data.name } : workflow
      )
    );
  });
  onMessage("startRun", ({ data }) => {
    fireAndForget(startRun(data));
  });
  onMessage("skipStep", () => {
    fireAndForget(continueRun({ skip: true }));
  });
  onMessage("resumeRun", () => {
    fireAndForget(continueRun({ skip: false }));
  });
  onMessage("cancelRun", () => setStored("run", null));
  onMessage("getRunState", () => getStored("run"));
  onMessage("vaultStatus", () => vaultStatus());
  onMessage("unlockVault", ({ data }) => unlockVault(data));
  onMessage("lockVault", () => lockVault());
  onMessage("resetVault", () => resetVault());
  onMessage("setVaultPassword", ({ data }) => setVaultPassword(data));
});
