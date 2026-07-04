/** Passive event recorder: captures clicks, inputs, submits into a buffer. */

import { sendMessage } from "@/lib/messaging";
import { describeElement } from "@/lib/selector";
import type { RecordedEvent, StepAction } from "@/lib/types";
import { isInToast } from "./toast";

const ACTIONABLE = 'button, a, [role="button"], input[type="submit"], label';
const SENSITIVE_AUTOCOMPLETE = /password|cc-/;
const PENDING_WAIT_MS = 100;
const PENDING_WAIT_ROUNDS = 10;

const buffer: RecordedEvent[] = [];
let suppressUntil = 0;
/** In-flight storeValue calls; flushing waits so valueRefs are patched in. */
let pendingValues = 0;

/** Pause recording briefly, e.g. around replayed steps. */
export const suppressRecording = (ms: number) => {
  suppressUntil = Date.now() + ms;
};

const recordingSuppressed = () => Date.now() < suppressUntil;

export const record = (action: StepAction) => {
  buffer.push({ ts: Date.now(), origin: location.origin, action });
};

export const flush = ({ force = false } = {}): Promise<void> => {
  if (buffer.length === 0 || (pendingValues > 0 && !force)) {
    return Promise.resolve();
  }
  return sendMessage("recordEvents", buffer.splice(0)).catch(() => {
    // Extension context gone (reload); nothing to do.
  });
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait briefly for in-flight vault writes, then ship whatever we have. */
export const flushNow = async (): Promise<void> => {
  for (
    let round = 0;
    round < PENDING_WAIT_ROUNDS && pendingValues > 0;
    round++
  ) {
    await sleep(PENDING_WAIT_MS);
  }
  await flush({ force: true });
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
  // Record synchronously to preserve event order; patch the ref when the
  // vault write resolves. Empty ref = value unavailable (vault locked);
  // replay pauses on it.
  const action: Extract<StepAction, { kind: "input" }> = {
    kind: "input",
    selector,
    valueRef: "",
    sensitive,
  };
  record(action);
  pendingValues++;
  sendMessage("storeValue", { value: el.value, sensitive })
    .then((ref) => {
      action.valueRef = ref ?? "";
    })
    .catch(() => null)
    .finally(() => {
      pendingValues--;
    });
};

export const onSubmit = (event: Event) => {
  if (recordingSuppressed() || !(event.target instanceof Element)) {
    return;
  }
  record({ kind: "submit", selector: describeElement(event.target).selector });
};
