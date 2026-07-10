/** Per-kind step editors and the dispatcher picking the right one. */

import { cn } from "cnfast";
import { type ChangeEvent, useCallback } from "react";
import { INPUT } from "@/components/styles";
import { Switch } from "@/components/switch";
// Relative on purpose: Biome's type inference can't resolve the `@/` alias
// (declared in .wxt/tsconfig.json) and would misread the switch on step.kind.
import type { StepAction, StepOf } from "../../lib/types";
import { ClickFields, UserClickFields } from "./click-fields";
import { Field, type OutputOption, TokenField } from "./token-field";

const MS_PER_SECOND = 1000;
const MAX_SLEEP_SECONDS = 300;

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

export function StepFields({
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
