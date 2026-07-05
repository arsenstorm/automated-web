/** Three-dot options popover for a workflow row: edit, rename, delete. */

import { cn } from "cnfast";
import { EllipsisVertical } from "lucide-react";
import { type RefObject, useCallback, useState } from "react";
import { IconButton } from "@/components/buttons";
import { PopoverMenu } from "@/components/popover-menu";
import { MENU_ITEM } from "@/components/styles";
import { fireAndForget, sendMessage } from "@/lib/messaging";
import type { Workflow } from "@/lib/types";

function RowMenuItems({
  workflow,
  close,
  onEdit,
  onRename,
  onChanged,
}: {
  workflow: Workflow;
  close: () => void;
  onEdit: () => void;
  onRename: () => void;
  onChanged: () => void;
}) {
  /** Delete asks once: first click arms, second click deletes. Unmounting on
   * close disarms it. */
  const [confirming, setConfirming] = useState(false);

  const handleEdit = useCallback(() => {
    close();
    onEdit();
  }, [close, onEdit]);

  const handleRename = useCallback(() => {
    close();
    onRename();
  }, [close, onRename]);

  const handleDelete = useCallback(() => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    close();
    fireAndForget(sendMessage("deleteWorkflow", workflow.id), onChanged);
  }, [confirming, close, workflow.id, onChanged]);

  return (
    <>
      <button className={MENU_ITEM} onClick={handleEdit} type="button">
        Edit steps
      </button>
      <button className={MENU_ITEM} onClick={handleRename} type="button">
        Rename
      </button>
      <button
        className={cn(MENU_ITEM, "text-destructive")}
        onClick={handleDelete}
        type="button"
      >
        {confirming ? "Really delete?" : "Delete"}
      </button>
    </>
  );
}

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
  const renderTrigger = useCallback(
    (props: {
      "aria-expanded": boolean;
      onClick: () => void;
      ref: RefObject<HTMLButtonElement | null>;
    }) => (
      <IconButton label={`Options for ${workflow.name}`} {...props}>
        <EllipsisVertical aria-hidden="true" className="size-4 shrink-0" />
      </IconButton>
    ),
    [workflow.name]
  );

  return (
    <PopoverMenu renderTrigger={renderTrigger} triggerRef={triggerRef}>
      {(close) => (
        <RowMenuItems
          close={close}
          onChanged={onChanged}
          onEdit={onEdit}
          onRename={onRename}
          workflow={workflow}
        />
      )}
    </PopoverMenu>
  );
}
