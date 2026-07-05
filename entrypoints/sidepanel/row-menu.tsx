/** Three-dot options popover for a workflow row: rename and delete. */

import { cn } from "cnfast";
import { EllipsisVertical } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { sendMessage } from "@/lib/messaging";
import type { Workflow } from "@/lib/types";
import { useAnimDuration } from "./motion";
import { IconButton } from "./ui";

const MENU_ITEM =
  "block w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring";

export function RowMenu({
  workflow,
  onRename,
  onChanged,
}: {
  workflow: Workflow;
  onRename: () => void;
  onChanged: () => void;
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
        // The trigger is the container's first button; menu items unmount,
        // so without this focus would drop to the body.
        containerRef.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onDocMousedown);
    document.addEventListener("keydown", onDocKeydown);
    return () => {
      document.removeEventListener("mousedown", onDocMousedown);
      document.removeEventListener("keydown", onDocKeydown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <IconButton
        expanded={open}
        label={`Options for ${workflow.name}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
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
                sendMessage("deleteWorkflow", workflow.id).then(onChanged);
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
