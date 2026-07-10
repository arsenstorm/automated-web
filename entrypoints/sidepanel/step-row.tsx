/** One editable step row in the timeline: summary line + expandable editor. */

import { cn } from "cnfast";
import { ChevronDown, GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { type ChangeEvent, type PointerEvent, useCallback } from "react";
import { Badge } from "@/components/badge";
import { SmallButton } from "@/components/buttons";
import {
  FOCUS_RING_INSET,
  GHOST_TEXT_BUTTON,
  INPUT,
} from "@/components/styles";
import { Expand } from "@/components/transitions";
import { describeStep } from "@/lib/naming";
// Relative on purpose: Biome's type inference can't resolve the `@/` alias
// (declared in .wxt/tsconfig.json) and would misread the switch on step.kind.
import type { StepAction } from "../../lib/types";
import { StepFields } from "./step-fields";
import type { OutputOption } from "./token-field";

const KIND_LABELS: Record<StepAction["kind"], string> = {
  click: "click",
  "close-tab": "close tab",
  extract: "extract",
  input: "type",
  navigate: "open",
  pause: "pause",
  sleep: "wait",
  submit: "submit",
  "user-click": "your click",
};

export function StepRow({
  step,
  pinned = false,
  expanded,
  earlierOutputs,
  maxTab = 0,
  moveUpDisabled = true,
  moveDownDisabled = true,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  step: StepAction;
  /** The leading navigate: editable, but not draggable or deletable. */
  pinned?: boolean;
  expanded: boolean;
  earlierOutputs: OutputOption[];
  /** Highest tab ordinal used in the draft (0 for single-tab workflows). */
  maxTab?: number;
  moveUpDisabled?: boolean;
  moveDownDisabled?: boolean;
  onToggle: () => void;
  onChange: (step: StepAction) => void;
  onMove?: (delta: -1 | 1) => void;
  onRemove?: () => void;
}) {
  const controls = useDragControls();

  const startDrag = useCallback(
    (event: PointerEvent) => controls.start(event),
    [controls]
  );
  const moveUp = useCallback(() => onMove?.(-1), [onMove]);
  const moveDown = useCallback(() => onMove?.(1), [onMove]);
  const setTab = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const next = Number(event.target.value);
      // Ordinal 0 is stored as undefined everywhere (recorder, `?? 0` reads).
      onChange({ ...step, tab: next === 0 ? undefined : next });
    },
    [step, onChange]
  );

  const body = (
    <>
      <div className="flex items-center gap-1 py-1">
        {!pinned && (
          // Pointer-only by design; keyboard reordering uses the Move buttons.
          <button
            aria-hidden="true"
            className="cursor-grab touch-none p-1 text-muted-foreground active:cursor-grabbing"
            onPointerDown={startDrag}
            tabIndex={-1}
            type="button"
          >
            <GripVertical className="size-4 shrink-0" />
          </button>
        )}
        <button
          aria-expanded={expanded}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 text-left",
            FOCUS_RING_INSET
          )}
          onClick={onToggle}
          type="button"
        >
          <Badge tone="neutral">{KIND_LABELS[step.kind]}</Badge>
          {(step.tab ?? 0) > 0 ? (
            <Badge tone="neutral">{`Tab ${(step.tab ?? 0) + 1}`}</Badge>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-sm">
            {describeStep(step)}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              expanded && "rotate-180"
            )}
          />
        </button>
      </div>
      <Expand show={expanded}>
        <div className="flex flex-col gap-2 px-1 pb-3">
          {/* Step 0 is the start tab by definition; no re-assign there. */}
          {!pinned && (
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Tab</span>
              <select
                className={cn(INPUT, "py-1")}
                onChange={setTab}
                value={step.tab ?? 0}
              >
                {Array.from({ length: maxTab + 2 }, (_, i) => i).map(
                  (ordinal) => (
                    <option key={ordinal} value={ordinal}>
                      {ordinal > maxTab
                        ? `New tab (Tab ${ordinal + 1})`
                        : `Tab ${ordinal + 1}`}
                    </option>
                  )
                )}
              </select>
            </label>
          )}
          <StepFields
            earlierOutputs={earlierOutputs}
            onChange={onChange}
            step={step}
          />
          {!pinned && (
            <div className="flex items-center gap-2 pt-1">
              <SmallButton disabled={moveUpDisabled} onClick={moveUp}>
                Move up
              </SmallButton>
              <SmallButton disabled={moveDownDisabled} onClick={moveDown}>
                Move down
              </SmallButton>
              <button
                className={cn(
                  GHOST_TEXT_BUTTON,
                  "ml-auto text-destructive hover:text-destructive"
                )}
                onClick={onRemove}
                type="button"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </Expand>
    </>
  );

  if (pinned) {
    return <div className="border-border border-b">{body}</div>;
  }
  return (
    <Reorder.Item
      as="li"
      className="border-border border-b bg-background"
      dragControls={controls}
      dragListener={false}
      value={step}
    >
      {body}
    </Reorder.Item>
  );
}
