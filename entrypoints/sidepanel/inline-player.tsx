/** Run progress inside a workflow row: bar, status text, badge. */

import { cn } from "cnfast";
import { motion } from "motion/react";
import { Badge, type BadgeTone } from "@/components/badge";
import { isPauseBlock } from "@/lib/replay-state";
import type { RunState, RunStatus } from "@/lib/types";
import { useReducedMotion } from "./motion";

const RUN_TONES: Record<RunStatus, BadgeTone> = {
  done: "positive",
  failed: "negative",
  paused: "attention",
  running: "neutral",
};

const FULL_WIDTH = 100;
const MS_PER_SECOND = 1000;

export function InlinePlayer({
  run,
  total,
  sleepMs,
}: {
  run: RunState;
  total: number;
  /** Set while the run sits on a sleep step: tween the bar over it. */
  sleepMs?: number;
}) {
  const reducedMotion = useReducedMotion();
  const showReason = run.pausedReason !== undefined && !isPauseBlock(run);
  const steps = Math.max(total - 1, 1);
  const completed =
    run.status === "done" ? steps : Math.max(run.stepIndex - 1, 0);

  const percentOf = (count: number) => `${(count / steps) * FULL_WIDTH}%`;
  const sleeping = sleepMs !== undefined && !reducedMotion;
  const width = sleeping
    ? [percentOf(completed), percentOf(Math.min(completed + 1, steps))]
    : percentOf(completed);
  let transition: { duration: number; ease?: "linear" } | undefined;
  if (reducedMotion) {
    transition = { duration: 0 };
  } else if (sleeping) {
    transition = { duration: sleepMs / MS_PER_SECOND, ease: "linear" };
  }

  return (
    <div className="pt-2">
      <div
        aria-hidden="true"
        className="h-1 overflow-hidden rounded-full bg-secondary"
      >
        <motion.div
          animate={{ width }}
          className={cn(
            "h-full",
            run.status === "failed" ? "bg-destructive" : "bg-primary"
          )}
          initial={false}
          transition={transition}
        />
      </div>
      <div
        aria-live="polite"
        className="mt-1.5 flex items-center justify-between gap-2"
      >
        <p className="min-w-0 truncate text-muted-foreground text-sm tabular-nums">
          Step {Math.min(Math.max(run.stepIndex, 1), steps)} of {steps}
          {showReason ? ` — ${run.pausedReason}` : ""}
        </p>
        <Badge tone={RUN_TONES[run.status]}>{run.status}</Badge>
      </div>
    </div>
  );
}
