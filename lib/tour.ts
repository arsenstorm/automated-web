/** Guided onboarding tour over the demo flows in the technical writeup. */

import { getStored, setStored } from "./storage";
import type { StepAction, Workflow } from "./types";

export const TOUR_URL =
  "https://arsenstorm.com/technical-writeups/automating-browser-workflows/";

export interface TourDemo {
  /** Feedback shown after the replay finishes, before the user continues. */
  doneCopy: string;
  /** Element ids (with `#`) that a recording of this demo must touch. */
  ids: string[];
  /** Matches the panel's `data-demo` attribute on the writeup page. */
  key: string;
  recordCopy: string;
  replayCopy: string;
  title: string;
}

export const DEMOS: TourDemo[] = [
  {
    doneCopy:
      "That's the whole loop — record once, replay anytime. Next up: what happens when a form contains something secret.",
    ids: ["#demo-email", "#demo-subscribe"],
    key: "newsletter",
    recordCopy:
      "Open the side panel and press the record button. Then type any email into the highlighted newsletter form and press Subscribe. Stop recording when you're done.",
    replayCopy:
      "Recorded! The demo has been reset — now press play on your new workflow in the side panel to watch it replay.",
    title: "Record a subscription",
  },
  {
    doneCopy:
      "The card number never left the page — replays pause and ask you for redacted values instead of storing them. One more demo to go.",
    ids: ["#secret-name", "#secret-card", "#secret-save"],
    key: "secrets",
    recordCopy:
      "Start a new recording, then fill in the highlighted billing form and press Save card. The card number is redacted at capture — it never leaves the page.",
    replayCopy:
      "Recorded! Replay the workflow from the side panel — it will pause on the redacted card field and ask you to fill it in.",
    title: "Secrets stay secret",
  },
  {
    doneCopy:
      "The replayer waited for the late-rendering Save button instead of failing — no timing tweaks needed.",
    ids: ["#replay-edit", "#replay-name", "#replay-save"],
    key: "dynamic",
    recordCopy:
      "Start a new recording, click Edit profile, type a name, wait for the Save changes button to appear, then click it. Stop recording when done.",
    replayCopy:
      "Recorded! Replay it from the side panel — the Save button renders late, so watch the replayer wait for it.",
    title: "Pages that render late",
  },
];

/** True when any recorded step targeted one of the demo's elements. */
const matchesDemo = (steps: StepAction[], ids: string[]): boolean =>
  steps.some(
    (step) =>
      "selector" in step && ids.some((id) => step.selector?.includes(id))
  );

/** Record finished: if it captured the current demo, move to the replay phase. */
export const advanceTourAfterRecord = async (workflow: Workflow) => {
  const tour = await getStored("tour");
  const demo = tour ? DEMOS[tour.step] : undefined;
  if (tour?.phase !== "record" || !demo) {
    return;
  }
  if (matchesDemo(workflow.steps, demo.ids)) {
    await setStored("tour", {
      phase: "replay",
      step: tour.step,
      workflowId: workflow.id,
      workflowIds: [...(tour.workflowIds ?? []), workflow.id],
    });
  }
};

/** Replay finished: show the step's feedback card (the user continues from there). */
export const advanceTourAfterReplay = async (workflowId: string) => {
  const tour = await getStored("tour");
  if (tour?.phase !== "replay" || tour.workflowId !== workflowId) {
    return;
  }
  await setStored("tour", { ...tour, phase: "done" });
};
