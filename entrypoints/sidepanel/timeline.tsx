/** Timeline editor: view, reorder, and edit a workflow's steps. */

import { cn } from "cnfast";
import {
  Globe,
  type LucideIcon,
  MousePointerClick,
  Pause,
  Plus,
  ScanText,
  Send,
  Timer,
  Type,
  X,
} from "lucide-react";
import { Reorder } from "motion/react";
import { useState } from "react";
import { IconButton, SmallButton } from "@/components/buttons";
import { ErrorNotice } from "@/components/error-notice";
import { PopoverMenu } from "@/components/popover-menu";
import { MENU_ITEM, PRIMARY_BUTTON } from "@/components/styles";
import { ViewTitle } from "@/components/view-title";
import { sendMessage } from "@/lib/messaging";
import { describeStep } from "@/lib/naming";
import type { StepAction, Workflow } from "@/lib/types";
import { ensureStepIds, nextStepId, validateSteps } from "@/lib/workflow";
import { type OutputOption, StepRow } from "./step-row";

const DEFAULT_SLEEP_MS = 5000;

const ADDABLE: {
  label: string;
  icon: LucideIcon;
  make: (id: string) => StepAction;
}[] = [
  {
    label: "Open a page",
    icon: Globe,
    make: (id) => ({ id, kind: "navigate", url: "" }),
  },
  {
    label: "Click an element",
    icon: MousePointerClick,
    make: (id) => ({ id, kind: "click", selector: "" }),
  },
  {
    label: "Type text",
    icon: Type,
    make: (id) => ({
      id,
      kind: "input",
      selector: "",
      value: "",
      sensitive: false,
    }),
  },
  {
    label: "Submit a form",
    icon: Send,
    make: (id) => ({ id, kind: "submit", selector: "" }),
  },
  {
    label: "Wait",
    icon: Timer,
    make: (id) => ({ id, kind: "sleep", ms: DEFAULT_SLEEP_MS }),
  },
  { label: "Pause for me", icon: Pause, make: (id) => ({ id, kind: "pause" }) },
  {
    label: "Extract text",
    icon: ScanText,
    make: (id) => ({ id, kind: "extract", selector: "" }),
  },
];

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

  const outputsBefore = (index: number): OutputOption[] =>
    draft
      .slice(0, index)
      .flatMap((step) =>
        step.kind === "extract" && step.id
          ? [{ id: step.id, label: describeStep(step) }]
          : []
      );

  const update = (index: number, step: StepAction) => {
    setDraft(draft.map((existing, i) => (i === index ? step : existing)));
  };

  const remove = (index: number) => {
    setDraft(draft.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: -1 | 1) => {
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
  };

  const add = (make: (id: string) => StepAction) => {
    const step = make(nextStepId(draft));
    setDraft([...draft, step]);
    setExpandedId(step.id ?? null);
  };

  const toggle = (id: string | undefined) => {
    setExpandedId(expandedId === id ? null : (id ?? null));
  };

  const save = async () => {
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
  };

  const back = () => {
    if (dirty && !leaving) {
      setLeaving(true);
      return;
    }
    onBack();
  };

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
        {first && (
          <StepRow
            earlierOutputs={[]}
            expanded={expandedId === first.id}
            onChange={(step) => update(0, step)}
            onToggle={() => toggle(first.id)}
            pinned
            step={first}
          />
        )}
        <Reorder.Group
          as="ol"
          axis="y"
          className="flex flex-col"
          onReorder={(next: StepAction[]) =>
            setDraft(first ? [first, ...next] : next)
          }
          values={rest}
        >
          {rest.map((step, restIndex) => {
            const index = restIndex + 1;
            return (
              <StepRow
                earlierOutputs={outputsBefore(index)}
                expanded={expandedId === step.id}
                key={step.id ?? index}
                moveDownDisabled={index >= draft.length - 1}
                moveUpDisabled={index <= 1}
                onChange={(nextStep) => update(index, nextStep)}
                onMove={(delta) => move(index, delta)}
                onRemove={() => remove(index)}
                onToggle={() => toggle(step.id)}
                step={step}
              />
            );
          })}
        </Reorder.Group>
      </div>
      <PopoverMenu
        align="left"
        menuClassName="min-w-44"
        renderTrigger={(props) => (
          <SmallButton className="flex items-center gap-1.5" {...props}>
            <Plus aria-hidden="true" className="size-4 shrink-0" />
            Add step
          </SmallButton>
        )}
      >
        {(close) =>
          ADDABLE.map(({ label, icon: Icon, make }) => (
            <button
              className={cn(MENU_ITEM, "flex items-center gap-2")}
              key={label}
              onClick={() => {
                close();
                add(make);
              }}
              type="button"
            >
              <Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              {label}
            </button>
          ))
        }
      </PopoverMenu>
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
          onClick={() => {
            save().catch(() => null);
          }}
          type="button"
        >
          Save changes
        </button>
      </div>
    </main>
  );
}
