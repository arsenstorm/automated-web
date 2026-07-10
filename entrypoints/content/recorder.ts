/** Passive event recorder: captures clicks, inputs, submits into a buffer. */

import { sendMessage } from "@/lib/messaging";
import { describeElement } from "@/lib/selector";
import type { RecordedEvent, StepAction } from "@/lib/types";
import { isInToast } from "./toast";
import { isInTour } from "./tour";

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

/**
 * The real event target: `event.target` is retargeted to the shadow host for
 * events from inside shadow roots; composedPath()[0] is the inner element.
 * Both fall back gracefully for synthetic events without composedPath.
 */
export const eventTarget = (event: Event): EventTarget | null => {
  const first = event.composedPath?.()[0];
  return first instanceof Element ? first : event.target;
};

export const record = (action: StepAction) => {
  buffer.push({ action, origin: location.origin, ts: Date.now() });
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
  const target = eventTarget(event);
  if (
    recordingSuppressed() ||
    !(target instanceof Element) ||
    isInToast(target) ||
    isInTour(target)
  ) {
    return;
  }
  // composedPath walks actionable ancestors across shadow boundaries too;
  // on plain pages it visits exactly what closest() would.
  const actionable =
    event
      .composedPath?.()
      .find((node) => node instanceof Element && node.matches(ACTIONABLE)) ??
    target.closest(ACTIONABLE);
  if (!(actionable instanceof Element)) {
    return;
  }
  // Cmd/ctrl/shift+click on a link opens a new tab/window; skip the click —
  // the new tab's own navigate event carries the intent, and a replayed
  // plain click would navigate this tab away instead of spawning one.
  if (
    (event.metaKey || event.ctrlKey || event.shiftKey) &&
    actionable.matches("a[href]")
  ) {
    return;
  }
  const { selector, text } = describeElement(actionable);
  record({ kind: "click", selector, text });
};

const isSensitive = (el: HTMLInputElement): boolean =>
  el.type === "password" ||
  SENSITIVE_AUTOCOMPLETE.test(el.getAttribute("autocomplete") ?? "");

export const onChange = (event: Event) => {
  const el = eventTarget(event);
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
    sensitive,
    value: sensitive && !recordSecrets ? "" : el.value,
  });
};

export const onSubmit = (event: Event) => {
  const target = eventTarget(event);
  if (recordingSuppressed() || !(target instanceof Element)) {
    return;
  }
  record({ kind: "submit", selector: describeElement(target).selector });
};
