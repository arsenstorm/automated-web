import { Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { sendMessage, type VaultStatus } from "@/lib/messaging";
import { getStored, setStored } from "@/lib/storage";
import type { RecordingState, RunState, Workflow } from "@/lib/types";
import { EmptyState } from "./empty-state";
import { LockScreen } from "./lock-screen";
import { usePageCrossfade } from "./motion";
import { Onboarding } from "./onboarding";
import { RecordButton } from "./record-button";
import { RecordingCard } from "./recording-card";
import { SettingsView } from "./settings";
import { ErrorNotice, Expand, Footer, IconButton, ViewTitle } from "./ui";
import { WorkflowList } from "./workflow-list";

const RUN_POLL_MS = 1000;

function App() {
  const [view, setView] = useState<"main" | "settings">("main");
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
    sendMessage("vaultStatus").then(setVaultStatus);
    getStored("onboarded").then(setOnboarded);
    sendMessage("listWorkflows").then(setWorkflows);
    sendMessage("getRunState").then(setRun);
    sendMessage("getRecording").then(setRecording);
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

  const record = async () => {
    setRecordError(null);
    const started = await sendMessage("startRecording");
    if (!started) {
      setRecordError("Open the page you want to record first.");
    }
    refresh();
  };

  const stopRecord = async () => {
    // A stop with nothing recorded quietly discards, same as cancel.
    const workflow = await sendMessage("stopRecording");
    if (workflow) {
      setNamingId(workflow.id);
    }
    refresh();
  };

  const startRecord = () => {
    record().catch(() => null);
  };
  const stopAndSave = () => {
    stopRecord().catch(() => null);
  };
  const cancelRecord = () => {
    sendMessage("cancelRecording").then(refresh);
  };

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
          <IconButton label="Settings" onClick={() => setView("settings")}>
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
            {recording && (
              <RecordingCard
                onCancel={cancelRecord}
                onStop={stopAndSave}
                recording={recording}
              />
            )}
          </Expand>
          <ErrorNotice className="-mt-3! mb-2" message={recordError} />
          <WorkflowList
            namingId={namingId}
            onChanged={refresh}
            run={run}
            workflows={workflows}
          />
        </div>
      )}
    </main>
  );

  let page = mainView;
  let pageKey = view as string;
  if (vaultStatus === "locked") {
    page = <LockScreen onUnlocked={refresh} />;
    pageKey = "locked";
  } else if (!onboarded) {
    page = (
      <Onboarding
        onDone={() => {
          setView("main");
          setStored("onboarded", true).then(refresh);
        }}
      />
    );
    pageKey = "onboarding";
  } else if (view === "settings") {
    page = (
      <SettingsView
        onBack={() => setView("main")}
        onChanged={refresh}
        status={vaultStatus}
      />
    );
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
