/** Three-dot options popover for a workflow row: rename and delete. */

import { EllipsisVertical } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { sendMessage } from "@/lib/messaging";
import type { Workflow } from "@/lib/types";
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
  const containerRef = useRef<HTMLDivElement>(null);

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
            transition={{ duration: 0.12 }}
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
              className={MENU_ITEM}
              onClick={() => {
                setOpen(false);
                sendMessage("deleteWorkflow", workflow.id).then(onChanged);
              }}
              type="button"
            >
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
