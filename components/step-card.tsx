/** Centered card shell: icon tile, heading, description, step actions. */

import { cn } from "cnfast";
import type { ReactNode } from "react";
import { ViewTitle } from "./view-title";

export function StepCard({
  danger = false,
  icon,
  title,
  description,
  children,
}: {
  danger?: boolean;
  icon: ReactNode;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-lg",
          danger ? "bg-destructive/10" : "bg-secondary"
        )}
      >
        {icon}
      </div>
      <ViewTitle className="mt-4 font-medium text-sm">{title}</ViewTitle>
      <p className="mt-1 max-w-56 text-pretty text-muted-foreground text-sm">
        {description}
      </p>
      {children}
    </>
  );
}
