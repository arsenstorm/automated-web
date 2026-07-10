/** Editors for the click and user-click steps, convertible into each other. */

import { useCallback } from "react";
// Relative on purpose: Biome's type inference can't resolve the `@/` alias
// (declared in .wxt/tsconfig.json) and would misread the switch on step.kind.
import type { StepAction, StepOf } from "../../lib/types";
import { Field, GHOST_SMALL_BUTTON } from "./token-field";

export function ClickFields({
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
        className={GHOST_SMALL_BUTTON}
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

export function UserClickFields({
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
          className={GHOST_SMALL_BUTTON}
          onClick={convertToClick}
          type="button"
        >
          Use recorded click again
        </button>
      ) : null}
    </>
  );
}
