/** Centered recording state: pulsing dot, heading, stop and cancel. */

import { cn } from "cnfast";
import type { RecordingState } from "@/lib/types";
import { DESTRUCTIVE_BUTTON, GHOST_TEXT_BUTTON } from "./ui";

export function RecordingCard({
  recording,
  onStop,
  onCancel,
}: {
  recording: RecordingState;
  onStop: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10">
        <span aria-hidden="true" className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
        </span>
      </div>
      <h2 className="mt-4 font-medium text-sm">
        Recording {new URL(recording.startUrl).host}
      </h2>
      <p className="mt-1 max-w-56 text-pretty text-muted-foreground text-sm">
        Perform the task in the tab, then stop to save it as a workflow.
      </p>
      <button
        className={cn(DESTRUCTIVE_BUTTON, "mt-4")}
        onClick={onStop}
        type="button"
      >
        Stop recording
      </button>
      <button
        className={cn(GHOST_TEXT_BUTTON, "mt-1")}
        onClick={onCancel}
        type="button"
      >
        Cancel
      </button>
    </div>
  );
}
