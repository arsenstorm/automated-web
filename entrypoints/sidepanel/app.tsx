import { Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { IconButton } from "@/components/buttons";
import { ErrorNotice } from "@/components/error-notice";
import { Footer } from "@/components/footer";
import { Expand } from "@/components/transitions";
import { ViewTitle } from "@/components/view-title";
import { fireAndForget, sendMessage, type VaultStatus } from "@/lib/messaging";
import { getStored, setStored } from "@/lib/storage";
import type { RecordingState, RunState, Workflow } from "@/lib/types";
import { EmptyState } from "./empty-state";
import { LockScreen } from "./lock-screen";
import { usePageCrossfade } from "./motion";
import { Onboarding } from "./onboarding";
import { RecordButton } from "./record-button";
import { RecordingCard } from "./recording-card";
import { SettingsView } from "./settings";
import { TimelineView } from "./timeline";
import { WorkflowList } from "./workflow-list";

const RUN_POLL_MS = 1000;

function App() {
  const [view, setView] = useState<"main" | "settings" | { edit: string }>(
    "main"
  );
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [run, setRun] = useState<RunState | null>(null);
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  /** Freshly saved recording — its row opens with a name prompt. */
  const [namingId, setNamingId] = useState<string | null>(null);
  const pageFade = usePageCrossfade();

  const refresh = useCallback(() => {
    fireAndForget(sendMessage("vaultStatus").then(setVaultStatus));
    fireAndForget(getStored("onboarded").then(setOnboarded));
    fireAndForget(sendMessage("listWorkflows").then(setWorkflows));
    fireAndForget(sendMessage("getRunState").then(setRun));
    fireAndForget(sendMessage("getRecording").then(setRecording));
  }, []);

  useEffect(() => {
    refresh();
    // Runs persist state after every step; the storage event delivers each
    // step change instantly. The interval is a fallback safety net.
    const timer = setInterval(refresh, RUN_POLL_MS);
    const onStorageChanged = () => refresh();
    browser.storage.onChanged.addListener(onStorageChanged);
    return () => {
      clearInterval(timer);
      browser.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [refresh]);

  // Rows read namingId only at mount, so clear it once the fresh row exists —
  // otherwise a remount (e.g. a settings round-trip) reopens the rename form.
  useEffect(() => {
    if (namingId && workflows.some((workflow) => workflow.id === namingId)) {
      setNamingId(null);
    }
  }, [namingId, workflows]);

  const record = useCallback(async () => {
    setRecordError(null);
    const started = await sendMessage("startRecording");
    if (!started) {
      setRecordError("Open the page you want to record first.");
    }
    refresh();
  }, [refresh]);

  const stopRecord = useCallback(async () => {
    // A stop with nothing recorded quietly discards, same as cancel.
    const workflow = await sendMessage("stopRecording");
    if (workflow) {
      setNamingId(workflow.id);
    }
    refresh();
  }, [refresh]);

  const startRecord = useCallback(() => {
    record().catch(() => null);
  }, [record]);
  const stopAndSave = useCallback(() => {
    stopRecord().catch(() => null);
  }, [stopRecord]);
  const cancelRecord = useCallback(() => {
    fireAndForget(sendMessage("cancelRecording"), refresh);
  }, [refresh]);

  const openSettings = useCallback(() => setView("settings"), []);
  const showMain = useCallback(() => setView("main"), []);
  const editWorkflow = useCallback((id: string) => setView({ edit: id }), []);
  const finishOnboarding = useCallback(() => {
    setView("main");
    fireAndForget(setStored("onboarded", true), refresh);
  }, [refresh]);

  if (vaultStatus === null || onboarded === null) {
    return null;
  }

  const mainView = (
    <main className="flex flex-1 flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <ViewTitle className="font-semibold text-sm">Workflows</ViewTitle>
        <div className="flex gap-1">
          {workflows.length > 0 && (
            <RecordButton
              onStart={startRecord}
              onStop={stopAndSave}
              recording={recording !== null}
            />
          )}
          <IconButton label="Settings" onClick={openSettings}>
            <Settings aria-hidden="true" className="size-4 shrink-0" />
          </IconButton>
        </div>
      </header>
      {workflows.length === 0 ? (
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div {...pageFade} key={recording ? "recording" : "empty"}>
            {recording ? (
              <RecordingCard
                onCancel={cancelRecord}
                onStop={stopAndSave}
                recording={recording}
              />
            ) : (
              <EmptyState error={recordError} onRecord={startRecord} />
            )}
          </motion.div>
        </AnimatePresence>
      ) : (
        // No gap here — a gap would linger while the card's height animates
        // to zero, then snap away when it unmounts.
        <div className="flex flex-col">
          <Expand show={recording !== null}>
            {recording ? (
              <RecordingCard
                onCancel={cancelRecord}
                onStop={stopAndSave}
                recording={recording}
              />
            ) : null}
          </Expand>
          <ErrorNotice className="-mt-3! mb-2" message={recordError} />
          <WorkflowList
            namingId={namingId}
            onChanged={refresh}
            onEdit={editWorkflow}
            run={run}
            workflows={workflows}
          />
        </div>
      )}
    </main>
  );

  let page = mainView;
  let pageKey = typeof view === "string" ? view : "timeline";
  if (vaultStatus === "locked") {
    page = <LockScreen onUnlocked={refresh} />;
    pageKey = "locked";
  } else if (!onboarded) {
    page = <Onboarding onDone={finishOnboarding} />;
    pageKey = "onboarding";
  } else if (view === "settings") {
    page = (
      <SettingsView
        onBack={showMain}
        onChanged={refresh}
        status={vaultStatus}
      />
    );
  } else if (typeof view === "object") {
    const editing = workflows.find((workflow) => workflow.id === view.edit);
    if (editing) {
      page = (
        <TimelineView
          onBack={showMain}
          onChanged={refresh}
          workflow={editing}
        />
      );
    } else {
      // Deleted (or not yet loaded) — fall back to the list.
      pageKey = "main";
    }
  }

  return (
    // The footer lives outside the crossfade so it never blurs or moves.
    <div className="isolate flex min-h-dvh min-w-64 flex-col p-4 antialiased">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          {...pageFade}
          className="flex flex-1 flex-col"
          key={pageKey}
        >
          {page}
        </motion.div>
      </AnimatePresence>
      <Footer />
    </div>
  );
}

export default App;
