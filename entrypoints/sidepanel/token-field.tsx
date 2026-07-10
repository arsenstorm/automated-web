/** Text field with an "insert output" picker splicing {{sN}} tokens at the caret. */

import { cn } from "cnfast";
import { type ChangeEvent, type RefObject, useCallback, useRef } from "react";
import { PopoverMenu } from "@/components/popover-menu";
import { GHOST_TEXT_BUTTON, INPUT, MENU_ITEM } from "@/components/styles";

export const GHOST_SMALL_BUTTON = cn(
  GHOST_TEXT_BUTTON,
  "self-start px-1 py-1 text-xs"
);

/** An earlier extract step offered by the insert-output picker. */
export interface OutputOption {
  id: string;
  label: string;
}

export function Field({
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

export function TokenField({
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
      <button className={GHOST_SMALL_BUTTON} type="button" {...props}>
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
