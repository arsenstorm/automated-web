/** One-shot capture of the user's click for a replay "user-click" step. */

import { sendMessage } from "@/lib/messaging";
import { eventTarget } from "./recorder";
import { isInToast, removeUserClickBanner, showUserClickBanner } from "./toast";
import { isInTour } from "./tour";

/** Emails and ids fit well under this; guards against clicking a whole table. */
const OUTPUT_MAX_LENGTH = 500;

let armed = false;

/** The clicked element's replay output: field value, else trimmed text. */
const outputOf = (el: Element): string => {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return el.value;
  }
  return (el.textContent ?? "").trim().slice(0, OUTPUT_MAX_LENGTH);
};

export const armUserClick = (
  label: string | undefined,
  workflowName: string
) => {
  armed = true;
  if (window.self === window.top) {
    showUserClickBanner(
      label
        ? `Click ${label} to continue`
        : `Click the element to continue “${workflowName}”`
    );
  }
};

export const disarmUserClick = () => {
  armed = false;
  removeUserClickBanner();
};

/**
 * Capture-phase listener, armed only while a user-click step waits. Never
 * prevents default — the click acts on the page; replay just needs its text.
 */
export const onUserClick = (event: MouseEvent) => {
  if (!armed) {
    return;
  }
  const target = eventTarget(event);
  if (!(target instanceof Element) || isInToast(target) || isInTour(target)) {
    return;
  }
  disarmUserClick();
  sendMessage("userClickDone", { output: outputOf(target) }).catch(() => null);
};
