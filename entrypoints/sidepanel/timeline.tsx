/** Timeline editor: view, reorder, and edit a workflow's steps. */

import { X } from "lucide-react";
import { Reorder } from "motion/react";
import { useCallback, useState } from "react";
import { IconButton } from "@/components/buttons";
import { ErrorNotice } from "@/components/error-notice";
import { PRIMARY_BUTTON } from "@/components/styles";
import { ViewTitle } from "@/components/view-title";
import { sendMessage } from "@/lib/messaging";
import { describeStep } from "@/lib/naming";
import type { StepAction, Workflow } from "@/lib/types";
import { ensureStepIds, nextStepId, validateSteps } from "@/lib/workflow";
import { AddStepMenu } from "./add-step-menu";
import { DraftStepRow } from "./draft-step-row";
import { StepRow } from "./step-row";
import type { OutputOption } from "./token-field";

export function TimelineView({
  workflow,
  onBack,
  onChanged,
}: {
  workflow: Workflow;
  onBack: () => void;
  onChanged: () => void;
}) {
  // Ids are backfilled once on open and persisted on save.
  const [initial] = useState<StepAction[]>(() => ensureStepIds(workflow.steps));
  const [draft, setDraft] = useState<StepAction[]>(initial);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Close asks once when dirty: first click warns, second discards. */
  const [leaving, setLeaving] = useState(false);
  const [announce, setAnnounce] = useState("");

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const validationError = dirty ? validateSteps(draft) : null;
  const [first, ...rest] = draft;
  const maxTab = Math.max(0, ...draft.map((step) => step.tab ?? 0));

  const outputsBefore = (index: number): OutputOption[] =>
    draft
      .slice(0, index)
      .flatMap((step) =>
        (step.kind === "extract" || step.kind === "user-click") && step.id
          ? [{ id: step.id, label: describeStep(step) }]
          : []
      );

  const update = useCallback(
    (index: number, step: StepAction) => {
      setDraft(draft.map((existing, i) => (i === index ? step : existing)));
    },
    [draft]
  );

  const updateFirst = useCallback(
    (step: StepAction) => update(0, step),
    [update]
  );

  const remove = useCallback(
    (index: number) => {
      setDraft(draft.filter((_, i) => i !== index));
    },
    [draft]
  );

  const move = useCallback(
    (index: number, delta: -1 | 1) => {
      const target = index + delta;
      // Slot 0 is the pinned navigate.
      if (target < 1 || target >= draft.length) {
        return;
      }
      const next = [...draft];
      const [moved] = next.splice(index, 1);
      if (!moved) {
        return;
      }
      next.splice(target, 0, moved);
      setDraft(next);
      setAnnounce(`Moved to position ${target + 1} of ${draft.length}`);
    },
    [draft]
  );

  const add = useCallback(
    (make: (id: string) => StepAction) => {
      // Inherit the last step's tab so an appended step doesn't silently
      // target tab 0 in a cross-tab workflow.
      const tab = draft.at(-1)?.tab;
      const step = {
        ...make(nextStepId(draft)),
        ...(tab === undefined ? {} : { tab }),
      };
      setDraft([...draft, step]);
      setExpandedId(step.id ?? null);
    },
    [draft]
  );

  const toggle = useCallback(
    (id: string | undefined) => {
      setExpandedId(expandedId === id ? null : (id ?? null));
    },
    [expandedId]
  );

  const toggleFirst = useCallback(() => toggle(first?.id), [toggle, first?.id]);

  const reorderRest = useCallback(
    (next: StepAction[]) => setDraft(first ? [first, ...next] : next),
    [first]
  );

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await sendMessage("updateWorkflowSteps", {
        id: workflow.id,
        steps: draft,
      });
      onChanged();
      onBack();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save");
      setSaving(false);
    }
  }, [workflow.id, draft, onChanged, onBack]);

  const handleSave = useCallback(() => {
    save().catch(() => null);
  }, [save]);

  const back = useCallback(() => {
    if (dirty && !leaving) {
      setLeaving(true);
      return;
    }
    onBack();
  }, [dirty, leaving, onBack]);

  return (
    <main className="flex flex-1 flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <ViewTitle className="truncate font-semibold text-sm">
          {workflow.name}
        </ViewTitle>
        <IconButton
          label={leaving ? "Discard changes" : "Back to workflows"}
          onClick={back}
        >
          <X aria-hidden="true" className="size-4 shrink-0" />
        </IconButton>
      </header>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      <div className="flex flex-col">
        {first ? (
          <StepRow
            earlierOutputs={[]}
            expanded={expandedId === first.id}
            onChange={updateFirst}
            onToggle={toggleFirst}
            pinned
            step={first}
          />
        ) : null}
        <Reorder.Group
          as="ol"
          axis="y"
          className="flex flex-col"
          onReorder={reorderRest}
          values={rest}
        >
          {rest.map((step, restIndex) => {
            const index = restIndex + 1;
            return (
              <DraftStepRow
                draftLength={draft.length}
                earlierOutputs={outputsBefore(index)}
                expanded={expandedId === step.id}
                index={index}
                key={step.id ?? index}
                maxTab={maxTab}
                onMove={move}
                onRemove={remove}
                onToggle={toggle}
                onUpdate={update}
                step={step}
              />
            );
          })}
        </Reorder.Group>
      </div>
      <AddStepMenu onAdd={add} />
      <div className="mt-auto flex flex-col pt-2">
        <ErrorNotice
          message={
            saveError ??
            validationError ??
            (leaving ? "Unsaved changes — close again to discard" : null)
          }
        />
        <button
          className={PRIMARY_BUTTON}
          disabled={!dirty || saving || validationError !== null}
          onClick={handleSave}
          type="button"
        >
          Save changes
        </button>
      </div>
    </main>
  );
}
