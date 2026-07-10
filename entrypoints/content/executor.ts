/** Replay step executor: waits for elements and applies recorded actions. */

import { hasCaptcha } from "@/lib/replay-state";
import { deepQuery, findByText, lastTag, trimmedText } from "@/lib/selector";
import type { StepAction, StepResult } from "@/lib/types";
import { suppressRecording } from "./recorder";

const ELEMENT_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 200;
const REPLAY_SUPPRESS_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Polling instead of a MutationObserver: an observer on the document can't
// see mutations inside shadow roots, and deepQuery has to re-walk the chain
// anyway.
const waitForElement = async (selector: string): Promise<Element | null> => {
  const deadline = Date.now() + ELEMENT_TIMEOUT_MS;
  for (;;) {
    const el = deepQuery(document, selector);
    if (el) {
      return el;
    }
    if (Date.now() >= deadline) {
      return null;
    }
    // biome-ignore lint/performance/noAwaitInLoops: polling loop — each wait must complete before re-checking.
    await sleep(POLL_INTERVAL_MS);
  }
};

/** Native value setter so React-controlled inputs pick up the change. */
const setNativeValue = (el: Element, value: string) => {
  const prototype = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) {
    setter.call(el, value);
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
};

const applyStep = (el: Element, step: StepAction) => {
  // "nearest": no scroll at all when the element is already visible — a
  // centering scroll here shifts the page under the tour's spotlight.
  el.scrollIntoView({ block: "nearest" });
  if (step.kind === "input") {
    if (el instanceof HTMLElement) {
      el.focus();
    }
    setNativeValue(el, step.value);
    return;
  }
  if (step.kind === "submit" && el instanceof HTMLFormElement) {
    el.requestSubmit();
    return;
  }
  if (el instanceof HTMLElement) {
    el.click();
  }
};

export const executeStep = async (step: StepAction): Promise<StepResult> => {
  // navigate/sleep/pause/close-tab/user-click are handled by the background
  // and never sent here.
  if (
    step.kind === "navigate" ||
    step.kind === "sleep" ||
    step.kind === "pause" ||
    step.kind === "close-tab" ||
    step.kind === "user-click"
  ) {
    return { ok: true };
  }
  if (hasCaptcha(document)) {
    return { ok: false, reason: "captcha" };
  }
  let el = await waitForElement(step.selector);
  // Positional selectors (nth-of-type) drift when page content shifts. For
  // clicks the recorded text is ground truth: on a mismatch, rescue via a
  // unique text match rather than clicking the wrong element; else pause.
  if (
    step.kind === "click" &&
    step.text &&
    (!el || trimmedText(el) !== step.text)
  ) {
    el = findByText(document, lastTag(step.selector), step.text);
  }
  if (!el) {
    return { detail: step.selector, ok: false, reason: "timeout" };
  }
  if (step.kind === "extract") {
    const output =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? el.value
        : (trimmedText(el) ?? el.textContent?.trim() ?? "");
    return { ok: true, output };
  }
  // A secret with no stored value (the default — storing them is opt-in):
  // focus the field and pause for the user to type it, then skip the step.
  if (step.kind === "input" && step.sensitive && !step.value) {
    el.scrollIntoView({ block: "nearest" });
    if (el instanceof HTMLElement) {
      el.focus();
    }
    return {
      detail: "enter it on the page, then skip",
      ok: false,
      reason: "secret",
    };
  }
  suppressRecording(REPLAY_SUPPRESS_MS);
  applyStep(el, step);
  return { ok: true };
};
