/** Small text and icon button primitives. */

import { cn } from "cnfast";
import type { ComponentPropsWithRef } from "react";
import { FOCUS_RING } from "./styles";
import { TOUCH_TARGET } from "./touch-target";

export function SmallButton({
  className,
  children,
  ...props
}: ComponentPropsWithRef<"button">) {
  return (
    <button
      className={cn(
        "relative rounded-md bg-secondary px-2.5 py-1 font-medium text-secondary-foreground text-sm hover:bg-secondary/70 disabled:opacity-50 disabled:hover:bg-secondary",
        FOCUS_RING,
        className
      )}
      type="button"
      {...props}
    >
      {TOUCH_TARGET}
      {children}
    </button>
  );
}

const ICON_BUTTON_VARIANTS = {
  destructive:
    "bg-destructive text-white hover:bg-destructive/90 dark:text-zinc-950",
  ghost:
    "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
} as const;

export function IconButton({
  label,
  variant = "ghost",
  className,
  children,
  ...props
}: {
  /** Accessible name; the visible content is the icon alone. */
  label: string;
  variant?: keyof typeof ICON_BUTTON_VARIANTS;
} & ComponentPropsWithRef<"button">) {
  return (
    <button
      className={cn(
        "relative rounded-md p-1.5 disabled:pointer-events-none disabled:opacity-50",
        FOCUS_RING,
        ICON_BUTTON_VARIANTS[variant],
        className
      )}
      type="button"
      {...props}
    >
      {TOUCH_TARGET}
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}
