import { onMessage } from "@/lib/messaging";
import { getStored } from "@/lib/storage";
import { executeStep } from "./executor";
import {
  flush,
  onChange,
  onClick,
  onSubmit,
  record,
  recordNavigate,
  setRecordSecrets,
} from "./recorder";
import { showToast } from "./toast";

const FLUSH_INTERVAL_MS = 5000;

export default defineContentScript({
  matches: ["<all_urls>"],
  // Record and replay inside iframes too.
  allFrames: true,
  matchAboutBlank: true,
  main() {
    const isTop = window.self === window.top;
    const syncRecordSecrets = () => {
      getStored("settings")
        .then((settings) => setRecordSecrets(Boolean(settings.recordSecrets)))
        .catch(() => null);
    };
    syncRecordSecrets();
    browser.storage.onChanged.addListener((changes) => {
      if (changes.settings) {
        syncRecordSecrets();
      }
    });

    // Only the top frame narrates navigation — subframe navigate events
    // would split miner sessions on iframe origins.
    if (isTop) {
      record({ kind: "navigate", url: location.href });
      // Back/forward can restore from bfcache or move SPA history without
      // re-running main(); record those navigations too.
      window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
          recordNavigate();
        }
      });
      window.addEventListener("popstate", recordNavigate);
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    setInterval(flush, FLUSH_INTERVAL_MS);
    window.addEventListener("pagehide", () => flush());

    onMessage("ping", () => {
      // Presence check used by the replayer after navigations.
    });
    if (isTop) {
      // The miner broadcasts to the tab; only the top frame shows the toast.
      onMessage("suggestWorkflow", ({ data }) => {
        showToast(data.fingerprint, data.stepCount);
      });
    }
    onMessage("executeStep", ({ data }) => executeStep(data.step));
    onMessage("flushNow", () => flush());
  },
});
