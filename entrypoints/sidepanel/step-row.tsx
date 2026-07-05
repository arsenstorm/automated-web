/** One editable step row in the timeline: summary line + expandable editor. */

import { cn } from "cnfast";
import { ChevronDown, GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { type RefObject, useRef } from "react";
import { Badge } from "@/components/badge";
import { SmallButton } from "@/components/buttons";
import { PopoverMenu } from "@/components/popover-menu";
import {
  FOCUS_RING_INSET,
  GHOST_TEXT_BUTTON,
  INPUT,
  MENU_ITEM,
} from "@/components/styles";
import { Switch } from "@/components/switch";
import { Expand } from "@/components/transitions";
import { describeStep } from "@/lib/naming";
import type { StepAction } from "@/lib/types";

const KIND_LABELS: Record<StepAction["kind"], string> = {
  navigate: "open",
  click: "click",
  input: "type",
  submit: "submit",
  sleep: "wait",
  pause: "pause",
  extract: "extract",
};

const MS_PER_SECOND = 1000;
const MAX_SLEEP_SECONDS = 300;

/** An earlier extract step offered by the insert-output picker. */
export interface OutputOption {
  id: string;
  label: string;
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  inputRef,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <input
        className={cn(INPUT, "py-1")}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        type="text"
        value={value}
      />
    </label>
  );
}

/** Text field with an "insert output" picker splicing `{{sN}}` at the caret. */
function TokenField({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  options: OutputOption[];
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const insert = (id: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    onChange(`${value.slice(0, start)}{{${id}}}${value.slice(end)}`);
    el?.focus();
  };
  return (
    <div className="flex flex-col">
      <Field
        inputRef={inputRef}
        label={label}
        onChange={onChange}
        placeholder={placeholder}
        value={value}
      />
      {options.length > 0 && (
        <PopoverMenu
          align="left"
          renderTrigger={(props) => (
            <button
              className={cn(GHOST_TEXT_BUTTON, "self-start px-1 py-1 text-xs")}
              type="button"
              {...props}
            >
              Insert output
            </button>
          )}
        >
          {(close) =>
            options.map((option) => (
              <button
                className={MENU_ITEM}
                key={option.id}
                onClick={() => {
                  close();
                  insert(option.id);
                }}
                type="button"
              >
                {`{{${option.id}}} — ${option.label}`}
              </button>
            ))
          }
        </PopoverMenu>
      )}
    </div>
  );
}

function StepFields({
  step,
  earlierOutputs,
  onChange,
}: {
  step: StepAction;
  earlierOutputs: OutputOption[];
  onChange: (step: StepAction) => void;
}) {
  switch (step.kind) {
    case "navigate":
      return (
        <TokenField
          label="URL"
          onChange={(url) => onChange({ ...step, url })}
          options={earlierOutputs}
          placeholder="https://example.com/page"
          value={step.url}
        />
      );
    case "click":
      return (
        <>
          <Field
            label="CSS selector"
            onChange={(selector) => onChange({ ...step, selector })}
            placeholder="#buy-button"
            value={step.selector}
          />
          <Field
            label="Expected text (optional)"
            onChange={(text) => onChange({ ...step, text: text || undefined })}
            placeholder="Buy now"
            value={step.text ?? ""}
          />
        </>
      );
    case "input":
      return (
        <>
          <Field
            label="CSS selector"
            onChange={(selector) => onChange({ ...step, selector })}
            placeholder="#email"
            value={step.selector}
          />
          <TokenField
            label="Value"
            onChange={(value) => onChange({ ...step, value })}
            options={earlierOutputs}
            value={step.value}
          />
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-sm">Secret field</span>
            <Switch
              checked={step.sensitive}
              label="Secret field"
              onChange={(sensitive) => onChange({ ...step, sensitive })}
            />
          </div>
        </>
      );
    case "submit":
      return (
        <Field
          label="CSS selector"
          onChange={(selector) => onChange({ ...step, selector })}
          placeholder="form"
          value={step.selector}
        />
      );
    case "sleep":
      return (
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Wait (seconds)</span>
          <input
            className={cn(INPUT, "py-1")}
            max={MAX_SLEEP_SECONDS}
            min={0}
            onChange={(event) => {
              const seconds = Number(event.target.value);
              onChange({
                ...step,
                ms: Number.isFinite(seconds)
                  ? Math.round(seconds * MS_PER_SECOND)
                  : 0,
              });
            }}
            step={0.5}
            type="number"
            value={step.ms / MS_PER_SECOND}
          />
        </label>
      );
    case "pause":
      return (
        <p className="text-muted-foreground text-sm">
          Replay stops here until you press Resume.
        </p>
      );
    case "extract":
      return (
        <>
          <Field
            label="CSS selector"
            onChange={(selector) => onChange({ ...step, selector })}
            placeholder=".order-id"
            value={step.selector}
          />
          {step.id && (
            <p className="text-muted-foreground text-xs">
              Use{" "}
              <code className="rounded bg-secondary px-1">{`{{${step.id}}}`}</code>{" "}
              in a later step's value or URL.
            </p>
          )}
        </>
      );
    default:
      return null;
  }
}

export function StepRow({
  step,
  pinned = false,
  expanded,
  earlierOutputs,
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
  moveUpDisabled?: boolean;
  moveDownDisabled?: boolean;
  onToggle: () => void;
  onChange: (step: StepAction) => void;
  onMove?: (delta: -1 | 1) => void;
  onRemove?: () => void;
}) {
  const controls = useDragControls();

  const body = (
    <>
      <div className="flex items-center gap-1 py-1">
        {!pinned && (
          // Pointer-only by design; keyboard reordering uses the Move buttons.
          <button
            aria-hidden="true"
            className="cursor-grab touch-none p-1 text-muted-foreground active:cursor-grabbing"
            onPointerDown={(event) => controls.start(event)}
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
          <StepFields
            earlierOutputs={earlierOutputs}
            onChange={onChange}
            step={step}
          />
          {!pinned && (
            <div className="flex items-center gap-2 pt-1">
              <SmallButton
                disabled={moveUpDisabled}
                onClick={() => onMove?.(-1)}
              >
                Move up
              </SmallButton>
              <SmallButton
                disabled={moveDownDisabled}
                onClick={() => onMove?.(1)}
              >
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
