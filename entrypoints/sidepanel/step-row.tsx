/** One editable step row in the timeline: summary line + expandable editor. */

import { cn } from "cnfast";
import { ChevronDown, GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import {
  type ChangeEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useRef,
} from "react";
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
// Relative on purpose: Biome's type inference can't resolve the `@/` alias
// (declared in .wxt/tsconfig.json) and would misread the switch on step.kind.
import type { StepAction } from "../../lib/types";

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

const MS_PER_SECOND = 1000;
const MAX_SLEEP_SECONDS = 300;

type StepOf<Kind extends StepAction["kind"]> = Extract<
  StepAction,
  { kind: Kind }
>;

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
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    [onChange]
  );
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <input
        className={cn(INPUT, "py-1")}
        onChange={handleChange}
        placeholder={placeholder}
        ref={inputRef}
        type="text"
        value={value}
      />
    </label>
  );
}

function OutputOptionButton({
  option,
  close,
  onInsert,
}: {
  option: OutputOption;
  close: () => void;
  onInsert: (id: string) => void;
}) {
  const handleClick = useCallback(() => {
    close();
    onInsert(option.id);
  }, [close, onInsert, option.id]);
  return (
    <button className={MENU_ITEM} onClick={handleClick} type="button">
      {`{{${option.id}}} — ${option.label}`}
    </button>
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
  const insert = useCallback(
    (id: string) => {
      const el = inputRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? start;
      onChange(`${value.slice(0, start)}{{${id}}}${value.slice(end)}`);
      el?.focus();
    },
    [value, onChange]
  );
  const renderTrigger = useCallback(
    (props: {
      "aria-expanded": boolean;
      onClick: () => void;
      ref: RefObject<HTMLButtonElement | null>;
    }) => (
      <button
        className={cn(GHOST_TEXT_BUTTON, "self-start px-1 py-1 text-xs")}
        type="button"
        {...props}
      >
        Insert output
      </button>
    ),
    []
  );
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
        <PopoverMenu align="left" renderTrigger={renderTrigger}>
          {(close) =>
            options.map((option) => (
              <OutputOptionButton
                close={close}
                key={option.id}
                onInsert={insert}
                option={option}
              />
            ))
          }
        </PopoverMenu>
      )}
    </div>
  );
}

function NavigateFields({
  step,
  earlierOutputs,
  onChange,
}: {
  step: StepOf<"navigate">;
  earlierOutputs: OutputOption[];
  onChange: (step: StepAction) => void;
}) {
  const setUrl = useCallback(
    (url: string) => onChange({ ...step, url }),
    [step, onChange]
  );
  return (
    <TokenField
      label="URL"
      onChange={setUrl}
      options={earlierOutputs}
      placeholder="https://example.com/page"
      value={step.url}
    />
  );
}

function ClickFields({
  step,
  onChange,
}: {
  step: StepOf<"click">;
  onChange: (step: StepAction) => void;
}) {
  const setSelector = useCallback(
    (selector: string) => onChange({ ...step, selector }),
    [step, onChange]
  );
  const setText = useCallback(
    (text: string) => onChange({ ...step, text: text || undefined }),
    [step, onChange]
  );
  // Spread preserves id/frameUrl/tab/selector/text so converting back is
  // lossless. The label slots into "Click … to continue" on the page, so the
  // recorded button text is seeded in quotes.
  const convertToUserClick = useCallback(
    () =>
      onChange({
        ...step,
        kind: "user-click",
        label: step.text ? `“${step.text}”` : undefined,
      }),
    [step, onChange]
  );
  return (
    <>
      <Field
        label="CSS selector"
        onChange={setSelector}
        placeholder="#buy-button"
        value={step.selector}
      />
      <Field
        label="Expected text (optional)"
        onChange={setText}
        placeholder="Buy now"
        value={step.text ?? ""}
      />
      <button
        className={cn(GHOST_TEXT_BUTTON, "self-start px-1 py-1 text-xs")}
        onClick={convertToUserClick}
        type="button"
      >
        Wait for my click instead
      </button>
      <p className="text-muted-foreground text-xs">
        Replay will pause here and let you pick the element by clicking it.
      </p>
    </>
  );
}

function UserClickFields({
  step,
  onChange,
}: {
  step: StepOf<"user-click">;
  onChange: (step: StepAction) => void;
}) {
  const { selector } = step;
  const setLabel = useCallback(
    (label: string) => onChange({ ...step, label: label || undefined }),
    [step, onChange]
  );
  const convertToClick = useCallback(() => {
    if (!selector) {
      return;
    }
    // Built explicitly: a spread would smuggle `label` into a ClickStep.
    onChange({
      frameUrl: step.frameUrl,
      id: step.id,
      kind: "click",
      selector,
      tab: step.tab,
      text: step.text,
    });
  }, [step, selector, onChange]);
  return (
    <>
      <Field
        label="Shown on the page as “Click … to continue”"
        onChange={setLabel}
        placeholder="the email cell"
        value={step.label ?? ""}
      />
      {step.id ? (
        <p className="text-muted-foreground text-xs">
          The clicked element's text is available as{" "}
          <code className="rounded bg-secondary px-1">{`{{${step.id}}}`}</code>{" "}
          in a later step's value or URL.
        </p>
      ) : null}
      {selector ? (
        <button
          className={cn(GHOST_TEXT_BUTTON, "self-start px-1 py-1 text-xs")}
          onClick={convertToClick}
          type="button"
        >
          Use recorded click again
        </button>
      ) : null}
    </>
  );
}

function InputFields({
  step,
  earlierOutputs,
  onChange,
}: {
  step: StepOf<"input">;
  earlierOutputs: OutputOption[];
  onChange: (step: StepAction) => void;
}) {
  const setSelector = useCallback(
    (selector: string) => onChange({ ...step, selector }),
    [step, onChange]
  );
  const setValue = useCallback(
    (value: string) => onChange({ ...step, value }),
    [step, onChange]
  );
  const setSensitive = useCallback(
    (sensitive: boolean) => onChange({ ...step, sensitive }),
    [step, onChange]
  );
  return (
    <>
      <Field
        label="CSS selector"
        onChange={setSelector}
        placeholder="#email"
        value={step.selector}
      />
      <TokenField
        label="Value"
        onChange={setValue}
        options={earlierOutputs}
        value={step.value}
      />
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-sm">Secret field</span>
        <Switch
          checked={step.sensitive}
          label="Secret field"
          onChange={setSensitive}
        />
      </div>
    </>
  );
}

function SubmitFields({
  step,
  onChange,
}: {
  step: StepOf<"submit">;
  onChange: (step: StepAction) => void;
}) {
  const setSelector = useCallback(
    (selector: string) => onChange({ ...step, selector }),
    [step, onChange]
  );
  return (
    <Field
      label="CSS selector"
      onChange={setSelector}
      placeholder="form"
      value={step.selector}
    />
  );
}

function SleepFields({
  step,
  onChange,
}: {
  step: StepOf<"sleep">;
  onChange: (step: StepAction) => void;
}) {
  const setSeconds = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const seconds = Number(event.target.value);
      onChange({
        ...step,
        ms: Number.isFinite(seconds) ? Math.round(seconds * MS_PER_SECOND) : 0,
      });
    },
    [step, onChange]
  );
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">Wait (seconds)</span>
      <input
        className={cn(INPUT, "py-1")}
        max={MAX_SLEEP_SECONDS}
        min={0}
        onChange={setSeconds}
        step={0.5}
        type="number"
        value={step.ms / MS_PER_SECOND}
      />
    </label>
  );
}

function ExtractFields({
  step,
  onChange,
}: {
  step: StepOf<"extract">;
  onChange: (step: StepAction) => void;
}) {
  const setSelector = useCallback(
    (selector: string) => onChange({ ...step, selector }),
    [step, onChange]
  );
  return (
    <>
      <Field
        label="CSS selector"
        onChange={setSelector}
        placeholder=".order-id"
        value={step.selector}
      />
      {step.id ? (
        <p className="text-muted-foreground text-xs">
          Use{" "}
          <code className="rounded bg-secondary px-1">{`{{${step.id}}}`}</code>{" "}
          in a later step's value or URL.
        </p>
      ) : null}
    </>
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
        <NavigateFields
          earlierOutputs={earlierOutputs}
          onChange={onChange}
          step={step}
        />
      );
    case "click":
      return <ClickFields onChange={onChange} step={step} />;
    case "input":
      return (
        <InputFields
          earlierOutputs={earlierOutputs}
          onChange={onChange}
          step={step}
        />
      );
    case "submit":
      return <SubmitFields onChange={onChange} step={step} />;
    case "sleep":
      return <SleepFields onChange={onChange} step={step} />;
    case "pause":
      return (
        <p className="text-muted-foreground text-sm">
          Replay stops here until you press Resume.
        </p>
      );
    case "close-tab":
      return (
        <p className="text-muted-foreground text-sm">
          Replay closes this step's tab here.
        </p>
      );
    case "extract":
      return <ExtractFields onChange={onChange} step={step} />;
    case "user-click":
      return <UserClickFields onChange={onChange} step={step} />;
    default:
      return null;
  }
}

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
