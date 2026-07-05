/** Passive event recorder: captures clicks, inputs, submits into a buffer. */

import { sendMessage } from "@/lib/messaging";
import { describeElement } from "@/lib/selector";
import type { RecordedEvent, StepAction } from "@/lib/types";
import { isInToast } from "./toast";

const ACTIONABLE = 'button, a, [role="button"], input[type="submit"], label';
const SENSITIVE_AUTOCOMPLETE = /password|cc-/;

const buffer: RecordedEvent[] = [];
let suppressUntil = 0;
// Off by default: secret values are redacted at capture unless the user
// opts in via settings (synced by index.ts).
let recordSecrets = false;

export const setRecordSecrets = (enabled: boolean) => {
  recordSecrets = enabled;
};

/** Pause recording briefly, e.g. around replayed steps. */
export const suppressRecording = (ms: number) => {
  suppressUntil = Date.now() + ms;
};

const recordingSuppressed = () => Date.now() < suppressUntil;

export const record = (action: StepAction) => {
  buffer.push({ ts: Date.now(), origin: location.origin, action });
};

/** Record a navigation, deduping when pageshow + popstate fire together. */
export const recordNavigate = () => {
  const last = buffer.at(-1)?.action;
  if (last?.kind === "navigate" && last.url === location.href) {
    return;
  }
  record({ kind: "navigate", url: location.href });
};

export const flush = (): Promise<void> => {
  if (buffer.length === 0) {
    return Promise.resolve();
  }
  return sendMessage("recordEvents", buffer.splice(0)).catch(() => {
    // Extension context gone (reload); nothing to do.
  });
};

export const onClick = (event: MouseEvent) => {
  const target = event.target;
  if (
    recordingSuppressed() ||
    !(target instanceof Element) ||
    isInToast(target)
  ) {
    return;
  }
  const actionable = target.closest(ACTIONABLE);
  if (!actionable) {
    return;
  }
  const { selector, text } = describeElement(actionable);
  record({ kind: "click", selector, text });
};

const isSensitive = (el: HTMLInputElement): boolean =>
  el.type === "password" ||
  SENSITIVE_AUTOCOMPLETE.test(el.getAttribute("autocomplete") ?? "");

export const onChange = (event: Event) => {
  const el = event.target;
  const isTextual =
    (el instanceof HTMLInputElement &&
      el.type !== "checkbox" &&
      el.type !== "radio") ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement;
  if (recordingSuppressed() || !isTextual) {
    return;
  }
  const sensitive = el instanceof HTMLInputElement && isSensitive(el);
  const { selector } = describeElement(el);
  // Re-edits of the same field within the buffer replace the earlier event.
  const existing = buffer.findIndex(
    (e) => e.action.kind === "input" && e.action.selector === selector
  );
  if (existing >= 0) {
    buffer.splice(existing, 1);
  }
  // Unless opted in, secret values never leave the page: the step is kept
  // as a placeholder (replay pauses on it) but the value is dropped here.
  record({
    kind: "input",
    selector,
    value: sensitive && !recordSecrets ? "" : el.value,
    sensitive,
  });
};

export const onSubmit = (event: Event) => {
  if (recordingSuppressed() || !(event.target instanceof Element)) {
    return;
  }
  record({ kind: "submit", selector: describeElement(event.target).selector });
};
