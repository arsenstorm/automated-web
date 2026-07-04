import { onMessage } from "@/lib/messaging";
import { getStored, setStored } from "@/lib/storage";
import { EVENT_BUFFER_CAP } from "@/lib/types";
import { dismissSuggestion, runMiner, saveSuggestion } from "./mining";
import { startRecording, stopRecording } from "./recording";
import { continueRun, pauseInterruptedRun, startRun } from "./replay";
import {
  lockVault,
  resetVault,
  setVaultPassword,
  storeValue,
  unlockVault,
  vaultLocked,
  vaultStatus,
} from "./vault";

const MINE_ALARM = "mine";
const MINE_PERIOD_MINUTES = 1;

const catching = (promise: Promise<unknown>) => {
  promise.catch((error) => console.error(error));
};

export default defineBackground(() => {
  // Open the side panel when the toolbar icon is clicked (Chromium only).
  browser.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

  browser.alarms.create(MINE_ALARM, { periodInMinutes: MINE_PERIOD_MINUTES });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === MINE_ALARM) {
      catching(runMiner());
    }
  });

  catching(pauseInterruptedRun());

  onMessage("ping", () => {
    // Liveness check.
  });
  onMessage("recordEvents", async ({ data, sender }) => {
    if (await vaultLocked()) {
      return;
    }
    const events = await getStored("events");
    const tabId = sender.tab?.id;
    events.push(...data.map((event) => ({ ...event, tabId })));
    await setStored("events", events.slice(-EVENT_BUFFER_CAP));
  });
  onMessage("startRecording", () => startRecording());
  onMessage("stopRecording", () => stopRecording());
  onMessage("cancelRecording", () => setStored("recording", null));
  onMessage("getRecording", () => getStored("recording"));
  onMessage("storeValue", ({ data }) => storeValue(data.value));
  onMessage("saveSuggestion", ({ data }) => saveSuggestion(data.fingerprint));
  onMessage("dismissSuggestion", ({ data }) =>
    dismissSuggestion(data.fingerprint, data.never)
  );
  onMessage("listWorkflows", () => getStored("workflows"));
  onMessage("deleteWorkflow", async ({ data }) => {
    const workflows = await getStored("workflows");
    await setStored(
      "workflows",
      workflows.filter((workflow) => workflow.id !== data)
    );
    const run = await getStored("run");
    if (run?.workflowId === data) {
      await setStored("run", null);
    }
  });
  onMessage("renameWorkflow", async ({ data }) => {
    const workflows = await getStored("workflows");
    await setStored(
      "workflows",
      workflows.map((workflow) =>
        workflow.id === data.id ? { ...workflow, name: data.name } : workflow
      )
    );
  });
  onMessage("startRun", ({ data }) => {
    catching(startRun(data));
  });
  onMessage("skipStep", () => {
    catching(continueRun({ skip: true }));
  });
  onMessage("resumeRun", () => {
    catching(continueRun({ skip: false }));
  });
  onMessage("cancelRun", () => setStored("run", null));
  onMessage("getRunState", () => getStored("run"));
  onMessage("vaultStatus", () => vaultStatus());
  onMessage("unlockVault", ({ data }) => unlockVault(data));
  onMessage("lockVault", () => lockVault());
  onMessage("resetVault", () => resetVault());
  onMessage("setVaultPassword", ({ data }) => setVaultPassword(data));
});
