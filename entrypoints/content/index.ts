import { onMessage } from "@/lib/messaging";
import { executeStep } from "./executor";
import {
  flush,
  flushNow,
  onChange,
  onClick,
  onSubmit,
  record,
} from "./recorder";
import { showToast } from "./toast";

const FLUSH_INTERVAL_MS = 5000;

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    record({ kind: "navigate", url: location.href });

    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    setInterval(flush, FLUSH_INTERVAL_MS);
    // Best-effort on unload even if a vault write is still in flight.
    window.addEventListener("pagehide", () => flush({ force: true }));

    onMessage("ping", () => {
      // Presence check used by the replayer after navigations.
    });
    onMessage("suggestWorkflow", ({ data }) => {
      showToast(data.fingerprint, data.stepCount);
    });
    onMessage("executeStep", ({ data }) => executeStep(data.step, data.value));
    onMessage("flushNow", () => flushNow());
  },
});
