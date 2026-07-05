/** A workflow row: name, play/stop/replay control, options menu, inline player. */

import { Play, RotateCcw, Square } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/buttons";
import { Expand, IconSwap } from "@/components/transitions";
import { fireAndForget, sendMessage } from "@/lib/messaging";
import type { RunState, Workflow } from "@/lib/types";
import { InlinePlayer } from "./inline-player";
import { RenameForm } from "./rename-form";
import { RowMenu } from "./row-menu";

/** A finished run lingers briefly so the full bar is seen, then clears. */
const DONE_CLEAR_MS = 3000;

export function WorkflowRow({
  workflow,
  run,
  namingId,
  onChanged,
}: {
  workflow: Workflow;
  run: RunState | null;
  /** Freshly recorded workflow whose row should open in naming mode. */
  namingId: string | null;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(workflow.id === namingId);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const active = run?.workflowId === workflow.id;
  const done = active && run?.status === "done";
  const runBusy = run !== null && run.status !== "done";

  useEffect(() => {
    if (!done) {
      return;
    }
    const timer = setTimeout(() => {
      fireAndForget(sendMessage("cancelRun"), onChanged);
    }, DONE_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [done, onChanged]);

  const play = () => {
    fireAndForget(sendMessage("startRun", workflow.id), onChanged);
  };

  /** The row's single play/stop/replay control, keyed for icon crossfades. */
  let control: {
    disabled?: boolean;
    icon: ReactNode;
    key: string;
    label: string;
    onClick: () => void;
  };
  if (!active) {
    control = {
      disabled: runBusy,
      icon: (
        <Play aria-hidden="true" className="size-4 shrink-0 fill-current" />
      ),
      key: "play",
      label: `Run ${workflow.name}`,
      onClick: play,
    };
  } else if (done) {
    control = {
      icon: <RotateCcw aria-hidden="true" className="size-4 shrink-0" />,
      key: "replay",
      label: `Replay ${workflow.name}`,
      onClick: play,
    };
  } else {
    control = {
      icon: (
        <Square aria-hidden="true" className="size-4 shrink-0 fill-current" />
      ),
      key: "stop",
      label:
        run?.status === "failed"
          ? `Clear run of ${workflow.name}`
          : `Stop ${workflow.name}`,
      onClick: () => {
        fireAndForget(sendMessage("cancelRun"), onChanged);
      },
    };
  }

  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <RenameForm
              onDone={(restoreFocus) => {
                setRenaming(false);
                onChanged();
                if (restoreFocus) {
                  // Back to the options menu, where the rename began; the
                  // input is about to unmount.
                  menuButtonRef.current?.focus();
                }
              }}
              workflow={workflow}
            />
          ) : (
            <p className="truncate font-medium text-sm">{workflow.name}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <IconButton
            disabled={control.disabled}
            label={control.label}
            onClick={control.onClick}
          >
            <IconSwap id={control.key}>{control.icon}</IconSwap>
          </IconButton>
          <RowMenu
            onChanged={onChanged}
            onRename={() => setRenaming(true)}
            triggerRef={menuButtonRef}
            workflow={workflow}
          />
        </div>
      </div>
      <Expand show={active && run !== null}>
        {run && (
          <InlinePlayer
            onChanged={onChanged}
            run={run}
            total={workflow.steps.length}
          />
        )}
      </Expand>
    </li>
  );
}
