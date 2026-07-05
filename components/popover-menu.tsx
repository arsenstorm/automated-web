/** Anchored popover menu: outside-click and Escape close, focus restore. */

import { cn } from "cnfast";
import { AnimatePresence, motion } from "motion/react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAnimDuration } from "@/entrypoints/sidepanel/motion";

export function PopoverMenu({
  renderTrigger,
  children,
  align = "right",
  menuClassName,
  triggerRef: externalTriggerRef,
  onOpenChange,
}: {
  /** Which edge of the trigger the menu hangs from. */
  align?: "left" | "right";
  /** Extra classes for the menu panel, e.g. a wider min-width. */
  menuClassName?: string;
  /** Render the trigger button, spreading the given props onto it. */
  renderTrigger: (props: {
    "aria-expanded": boolean;
    onClick: () => void;
    ref: RefObject<HTMLButtonElement | null>;
  }) => ReactNode;
  /** Menu content; call `close` after acting on an item. */
  children: (close: () => void) => ReactNode;
  /** External trigger ref, when the parent needs to refocus the trigger. */
  triggerRef?: RefObject<HTMLButtonElement | null>;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const internalTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = externalTriggerRef ?? internalTriggerRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const duration = useAnimDuration(0.12);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocMousedown = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const onDocKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        // Menu items unmount; without this focus would drop to the body.
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocMousedown);
    document.addEventListener("keydown", onDocKeydown);
    return () => {
      document.removeEventListener("mousedown", onDocMousedown);
      document.removeEventListener("keydown", onDocKeydown);
    };
  }, [open, triggerRef]);

  return (
    // w-fit keeps the anchor at the trigger even when a flex parent would
    // stretch this container to full width.
    <div className="relative w-fit" ref={containerRef}>
      {renderTrigger({
        "aria-expanded": open,
        onClick: () => setOpen((wasOpen) => !wasOpen),
        ref: triggerRef,
      })}
      <AnimatePresence>
        {open && (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn(
              "absolute z-10 mt-1 min-w-32 rounded-md bg-background p-1 shadow-md ring-1 ring-black/10 dark:shadow-none dark:ring-white/10",
              align === "left" ? "left-0" : "right-0",
              menuClassName
            )}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration }}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
