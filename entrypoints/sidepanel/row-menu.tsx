/** Three-dot options popover for a workflow row: rename and delete. */

import { cn } from "cnfast";
import { EllipsisVertical } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/buttons";
import { FOCUS_RING_INSET } from "@/components/styles";
import { fireAndForget, sendMessage } from "@/lib/messaging";
import type { Workflow } from "@/lib/types";
import { useAnimDuration } from "./motion";

const MENU_ITEM = `block w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-secondary ${FOCUS_RING_INSET}`;

export function RowMenu({
  workflow,
  onRename,
  onChanged,
  triggerRef,
}: {
  workflow: Workflow;
  onRename: () => void;
  onChanged: () => void;
  /** The options trigger — the row also refocuses it after a rename. */
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(false);
  /** Delete asks once: first click arms, second click deletes. */
  const [confirming, setConfirming] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const duration = useAnimDuration(0.12);

  useEffect(() => {
    if (!open) {
      setConfirming(false);
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
    <div className="relative" ref={containerRef}>
      <IconButton
        aria-expanded={open}
        label={`Options for ${workflow.name}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        ref={triggerRef}
      >
        <EllipsisVertical aria-hidden="true" className="size-4 shrink-0" />
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute right-0 z-10 mt-1 w-32 rounded-md bg-background p-1 shadow-md ring-1 ring-black/10 dark:shadow-none dark:ring-white/10"
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration }}
          >
            <button
              className={MENU_ITEM}
              onClick={() => {
                setOpen(false);
                onRename();
              }}
              type="button"
            >
              Rename
            </button>
            <button
              className={cn(MENU_ITEM, "text-destructive")}
              onClick={() => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                setOpen(false);
                fireAndForget(
                  sendMessage("deleteWorkflow", workflow.id),
                  onChanged
                );
              }}
              type="button"
            >
              {confirming ? "Really delete?" : "Delete"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
