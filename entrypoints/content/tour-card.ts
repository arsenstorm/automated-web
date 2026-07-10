/** Renders the tour card's copy and action buttons for the current state. */

import { sendMessage } from "@/lib/messaging";
import { setStored } from "@/lib/storage";
import { DEMOS } from "@/lib/tour";
import type { TourState } from "@/lib/types";

export const renderCardContent = (card: HTMLElement, tour: TourState): void => {
  const demo = DEMOS[tour.step];
  if (!demo) {
    return;
  }
  const title = document.createElement("p");
  title.className = "title";
  title.textContent = demo.title;
  const body = document.createElement("p");
  body.className = "body";
  const row = document.createElement("div");
  row.className = "row";
  const addButton = (label: string, onClick: () => void) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("click", onClick);
    row.append(button);
  };
  const endTour = () => {
    setStored("tour", null).catch(() => null);
  };

  if (tour.phase === "done") {
    const isLast = tour.step === DEMOS.length - 1;
    if (isLast) {
      title.textContent = "You're ready to go";
      body.textContent =
        "That's the tour — you can now record and replay workflows on any site. Want to remove the demo workflows the tour created?";
      addButton("Remove demo workflows", () => {
        for (const id of tour.workflowIds ?? []) {
          sendMessage("deleteWorkflow", id).catch(() => null);
        }
        endTour();
      });
      addButton("Keep them", endTour);
    } else {
      body.textContent = demo.doneCopy;
      addButton("Continue", () => {
        setStored("tour", {
          phase: "record",
          step: tour.step + 1,
          workflowIds: tour.workflowIds,
        }).catch(() => null);
      });
      addButton("Exit tour", endTour);
    }
  } else {
    body.textContent =
      tour.phase === "record" ? demo.recordCopy : demo.replayCopy;
    addButton("Exit tour", endTour);
  }
  card.replaceChildren(title, body, row);
};
