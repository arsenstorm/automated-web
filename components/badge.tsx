/** Rounded status pill with semantic tones. */

import { cn } from "cnfast";
import type { ReactNode } from "react";

const BADGE_TONES = {
  neutral: "bg-secondary text-secondary-foreground",
  attention:
    "bg-primary/15 text-primary-foreground dark:bg-primary/20 dark:text-primary",
  positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  negative: "bg-destructive/10 text-destructive",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-medium text-xs",
        BADGE_TONES[tone]
      )}
    >
      {children}
    </span>
  );
}
