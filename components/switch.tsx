/** shadcn-style track-and-thumb toggle on Base UI's Switch. */

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "cnfast";
import { FOCUS_RING } from "./styles";
import { TOUCH_TARGET } from "./touch-target";

export function Switch({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  /** Accessible name; the control renders no visible text. */
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <BaseSwitch.Root
      aria-label={label}
      checked={checked}
      className={cn(
        "relative inline-flex h-5 w-8 shrink-0 items-center rounded-full bg-input transition-colors disabled:pointer-events-none disabled:opacity-50 data-[checked]:bg-primary motion-reduce:transition-none",
        FOCUS_RING
      )}
      disabled={disabled}
      onCheckedChange={onChange}
    >
      {TOUCH_TARGET}
      <BaseSwitch.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-background transition-transform data-[checked]:translate-x-3.5 motion-reduce:transition-none" />
    </BaseSwitch.Root>
  );
}
