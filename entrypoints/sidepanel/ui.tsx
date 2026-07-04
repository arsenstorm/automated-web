/** Shared primitives for the side panel: buttons, badges, icon crossfades. */

import { cn } from "cnfast";
import { TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { CROSSFADE, crossfade } from "./motion";

export const INPUT =
  "w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1";

export const PRIMARY_BUTTON =
  "rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export const DESTRUCTIVE_BUTTON =
  "rounded-md bg-destructive px-3 py-2 font-medium text-sm text-white hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-destructive focus-visible:outline-offset-2";

export const GHOST_TEXT_BUTTON =
  "rounded-md px-3 py-1.5 font-medium text-muted-foreground text-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

/** Centered card shell: icon tile, heading, description, step actions. */
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
      <h1 className="mt-4 font-medium text-sm">{title}</h1>
      <p className="mt-1 max-w-56 text-pretty text-muted-foreground text-sm">
        {description}
      </p>
      {children}
    </>
  );
}

const TOUCH_TARGET = (
  <span
    aria-hidden="true"
    className="-translate-1/2 absolute top-1/2 left-1/2 pointer-fine:hidden size-[max(100%,3rem)]"
  />
);

export function SmallButton({
  children,
  onClick,
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      className="relative rounded-md bg-secondary px-2.5 py-1 font-medium text-secondary-foreground text-sm hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50 disabled:hover:bg-secondary"
      disabled={disabled}
      onClick={onClick}
      type={type === "submit" ? "submit" : "button"}
    >
      {TOUCH_TARGET}
      {children}
    </button>
  );
}

const ICON_BUTTON_VARIANTS = {
  destructive: "bg-destructive text-white hover:bg-destructive/90",
  ghost:
    "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
} as const;

export function IconButton({
  label,
  onClick,
  variant = "ghost",
  disabled = false,
  children,
  onBlur,
  onFocus,
  onMouseEnter,
  onMouseLeave,
}: {
  label: string;
  onClick: () => void;
  variant?: keyof typeof ICON_BUTTON_VARIANTS;
  disabled?: boolean;
  children: ReactNode;
  onBlur?: () => void;
  onFocus?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <button
      className={cn(
        "relative rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
        ICON_BUTTON_VARIANTS[variant]
      )}
      disabled={disabled}
      onBlur={onBlur}
      onClick={onClick}
      onFocus={onFocus}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      type="button"
    >
      {TOUCH_TARGET}
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}

/** Height expand/collapse for a conditionally shown block. */
export function Expand({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className="overflow-hidden"
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Centered inline error that animates in and out; nothing when null. */
export function ErrorNotice({ message }: { message: string | null }) {
  return (
    <Expand show={message !== null}>
      <p className="flex items-center justify-center gap-1.5 py-3 text-destructive text-sm">
        <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
        {message}
      </p>
    </Expand>
  );
}

/** Centered step-flow shell: crossfades between steps keyed by `stepKey`. */
export function StepFlow({
  stepKey,
  children,
}: {
  stepKey: string;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col justify-center">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          {...CROSSFADE}
          className="flex flex-col items-center px-4 py-8 text-center"
          key={stepKey}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

/** Blur/scale/fade crossfade between icons keyed by `id`. */
export function IconSwap({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span {...crossfade(0.9)} className="flex" key={id}>
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

/** Credit line rendered once at the app root, below the page crossfade. */
export function Footer() {
  return (
    <footer className="mt-auto pt-4 text-center text-muted-foreground text-xs">
      Built with care by{" "}
      <a
        className="underline underline-offset-2 hover:text-foreground"
        href="http://arsenstorm.com"
        rel="noopener"
        target="_blank"
      >
        Arsen Shkrumelyak
      </a>
    </footer>
  );
}

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
