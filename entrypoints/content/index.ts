import { onMessage } from "@/lib/messaging";
import { executeStep } from "./executor";
import {
  flush,
  onChange,
  onClick,
  onSubmit,
  record,
  recordNavigate,
} from "./recorder";
import { showToast } from "./toast";

const FLUSH_INTERVAL_MS = 5000;

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    record({ kind: "navigate", url: location.href });
    // Back/forward can restore from bfcache or move SPA history without
    // re-running main(); record those navigations too.
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        recordNavigate();
      }
    });
    window.addEventListener("popstate", recordNavigate);

    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    setInterval(flush, FLUSH_INTERVAL_MS);
    window.addEventListener("pagehide", () => flush());

    onMessage("ping", () => {
      // Presence check used by the replayer after navigations.
    });
    onMessage("suggestWorkflow", ({ data }) => {
      showToast(data.fingerprint, data.stepCount);
    });
    onMessage("executeStep", ({ data }) => executeStep(data.step));
    onMessage("flushNow", () => flush());
  },
});
