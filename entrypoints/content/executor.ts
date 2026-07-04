/** Replay step executor: waits for elements and applies recorded actions. */

import { hasCaptcha } from "@/lib/replay";
import { findByText, lastTag, trimmedText } from "@/lib/selector";
import type { StepAction, StepResult } from "@/lib/types";
import { suppressRecording } from "./recorder";

const ELEMENT_TIMEOUT_MS = 10_000;
const REPLAY_SUPPRESS_MS = 2000;

const waitForElement = (selector: string): Promise<Element | null> =>
  new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) {
      resolve(found);
      return;
    }
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, ELEMENT_TIMEOUT_MS);
  });

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
  el.scrollIntoView({ block: "center" });
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
  if (step.kind === "navigate") {
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
    return { ok: false, reason: "timeout", detail: step.selector };
  }
  suppressRecording(REPLAY_SUPPRESS_MS);
  applyStep(el, step);
  return { ok: true };
};
