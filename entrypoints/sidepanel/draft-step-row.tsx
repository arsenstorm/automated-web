import { useCallback } from "react";
import type { StepAction } from "@/lib/types";
import { StepRow } from "./step-row";
import type { OutputOption } from "./token-field";

/** Wires one draft step's row to index-based callbacks with stable handlers. */
export function DraftStepRow({
  index,
  step,
  draftLength,
  earlierOutputs,
  expanded,
  maxTab,
  onUpdate,
  onMove,
  onRemove,
  onToggle,
}: {
  index: number;
  step: StepAction;
  draftLength: number;
  earlierOutputs: OutputOption[];
  expanded: boolean;
  maxTab: number;
  onUpdate: (index: number, step: StepAction) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
  onToggle: (id: string | undefined) => void;
}) {
  const handleChange = useCallback(
    (next: StepAction) => onUpdate(index, next),
    [onUpdate, index]
  );
  const handleMove = useCallback(
    (delta: -1 | 1) => onMove(index, delta),
    [onMove, index]
  );
  const handleRemove = useCallback(() => onRemove(index), [onRemove, index]);
  const handleToggle = useCallback(
    () => onToggle(step.id),
    [onToggle, step.id]
  );
  return (
    <StepRow
      earlierOutputs={earlierOutputs}
      expanded={expanded}
      maxTab={maxTab}
      moveDownDisabled={index >= draftLength - 1}
      moveUpDisabled={index <= 1}
      onChange={handleChange}
      onMove={handleMove}
      onRemove={handleRemove}
      onToggle={handleToggle}
      step={step}
    />
  );
}
