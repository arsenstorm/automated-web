/** Shared class strings for the side panel's visual language. */

export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

/** Inset variant for inputs and menu items, where an outer ring would clip. */
export const FOCUS_RING_INSET =
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1";

export const INPUT = `w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm placeholder:text-muted-foreground ${FOCUS_RING_INSET}`;

export const PRIMARY_BUTTON = `rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 ${FOCUS_RING}`;

export const MENU_ITEM = `block w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-secondary ${FOCUS_RING_INSET}`;

export const DESTRUCTIVE_BUTTON =
  "rounded-md bg-destructive px-3 py-2 font-medium text-sm text-white hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-destructive focus-visible:outline-offset-2 dark:text-zinc-950";

export const GHOST_TEXT_BUTTON = `rounded-md px-3 py-1.5 font-medium text-muted-foreground text-sm hover:text-foreground ${FOCUS_RING}`;
