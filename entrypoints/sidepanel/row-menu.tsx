/** Three-dot options popover for a workflow row: edit, rename, delete. */

import { cn } from "cnfast";
import { EllipsisVertical } from "lucide-react";
import { type RefObject, useState } from "react";
import { IconButton } from "@/components/buttons";
import { PopoverMenu } from "@/components/popover-menu";
import { MENU_ITEM } from "@/components/styles";
import { fireAndForget, sendMessage } from "@/lib/messaging";
import type { Workflow } from "@/lib/types";

export function RowMenu({
  workflow,
  onEdit,
  onRename,
  onChanged,
  triggerRef,
}: {
  workflow: Workflow;
  onEdit: () => void;
  onRename: () => void;
  onChanged: () => void;
  /** The options trigger — the row also refocuses it after a rename. */
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  /** Delete asks once: first click arms, second click deletes. */
  const [confirming, setConfirming] = useState(false);

  return (
    <PopoverMenu
      onOpenChange={(open) => {
        if (!open) {
          setConfirming(false);
        }
      }}
      renderTrigger={(props) => (
        <IconButton label={`Options for ${workflow.name}`} {...props}>
          <EllipsisVertical aria-hidden="true" className="size-4 shrink-0" />
        </IconButton>
      )}
      triggerRef={triggerRef}
    >
      {(close) => (
        <>
          <button
            className={MENU_ITEM}
            onClick={() => {
              close();
              onEdit();
            }}
            type="button"
          >
            Edit steps
          </button>
          <button
            className={MENU_ITEM}
            onClick={() => {
              close();
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
              close();
              fireAndForget(
                sendMessage("deleteWorkflow", workflow.id),
                onChanged
              );
            }}
            type="button"
          >
            {confirming ? "Really delete?" : "Delete"}
          </button>
        </>
      )}
    </PopoverMenu>
  );
}
