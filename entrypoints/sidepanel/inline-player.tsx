/** Run progress inside a workflow row: bar, status, transport controls. */

import { cn } from "cnfast";
import { Play, SkipForward } from "lucide-react";
import { motion } from "motion/react";
import { sendMessage } from "@/lib/messaging";
import type { RunState, RunStatus } from "@/lib/types";
import { Badge, type BadgeTone, IconButton } from "./ui";

const RUN_TONES: Record<RunStatus, BadgeTone> = {
  running: "neutral",
  paused: "attention",
  done: "positive",
  failed: "negative",
};

const FULL_WIDTH = 100;

export function InlinePlayer({
  run,
  total,
  onChanged,
}: {
  run: RunState;
  total: number;
  onChanged: () => void;
}) {
  // Step 0 is the initial navigate — the page the run starts on, not work.
  // Number and measure progress against the real steps only.
  const steps = Math.max(total - 1, 1);
  const completed =
    run.status === "done" ? steps : Math.max(run.stepIndex - 1, 0);
  const percent = (completed / steps) * FULL_WIDTH;

  return (
    <div className="pt-2">
      <div
        aria-hidden="true"
        className="h-1 overflow-hidden rounded-full bg-secondary"
      >
        <motion.div
          animate={{ width: `${percent}%` }}
          className={cn(
            "h-full",
            run.status === "failed" ? "bg-destructive" : "bg-primary"
          )}
          initial={false}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge tone={RUN_TONES[run.status]}>{run.status}</Badge>
          <p className="min-w-0 truncate text-muted-foreground text-sm tabular-nums">
            Step {Math.min(Math.max(run.stepIndex, 1), steps)} of {steps}
            {run.pausedReason ? ` — ${run.pausedReason}` : ""}
          </p>
        </div>
        {run.status === "paused" && (
          <div className="flex shrink-0 gap-1">
            <IconButton
              label="Resume"
              onClick={() => {
                sendMessage("resumeRun", undefined).then(onChanged);
              }}
            >
              <Play
                aria-hidden="true"
                className="size-4 shrink-0 fill-current"
              />
            </IconButton>
            <IconButton
              label="Skip step"
              onClick={() => {
                sendMessage("skipStep", undefined).then(onChanged);
              }}
            >
              <SkipForward aria-hidden="true" className="size-4 shrink-0" />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}
