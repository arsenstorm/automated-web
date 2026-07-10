/** "Add step" popover: the catalogue of addable steps. */

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
import { type RefObject, useCallback } from "react";
import { SmallButton } from "@/components/buttons";
import { PopoverMenu } from "@/components/popover-menu";
import { MENU_ITEM } from "@/components/styles";
import type { StepAction } from "@/lib/types";

const DEFAULT_SLEEP_MS = 5000;

const ADDABLE: {
  label: string;
  icon: LucideIcon;
  make: (id: string) => StepAction;
}[] = [
  {
    icon: Globe,
    label: "Open a page",
    make: (id) => ({ id, kind: "navigate", url: "" }),
  },
  {
    icon: MousePointerClick,
    label: "Click an element",
    make: (id) => ({ id, kind: "click", selector: "" }),
  },
  {
    icon: Type,
    label: "Type text",
    make: (id) => ({
      id,
      kind: "input",
      selector: "",
      sensitive: false,
      value: "",
    }),
  },
  {
    icon: Send,
    label: "Submit a form",
    make: (id) => ({ id, kind: "submit", selector: "" }),
  },
  {
    icon: Timer,
    label: "Wait",
    make: (id) => ({ id, kind: "sleep", ms: DEFAULT_SLEEP_MS }),
  },
  { icon: Pause, label: "Pause for me", make: (id) => ({ id, kind: "pause" }) },
  {
    icon: ScanText,
    label: "Extract text",
    make: (id) => ({ id, kind: "extract", selector: "" }),
  },
  {
    icon: X,
    label: "Close a tab",
    make: (id) => ({ id, kind: "close-tab" }),
  },
];

type Addable = (typeof ADDABLE)[number];

function AddStepItem({
  entry,
  close,
  onAdd,
}: {
  entry: Addable;
  close: () => void;
  onAdd: (make: Addable["make"]) => void;
}) {
  const { label, icon: Icon, make } = entry;
  const handleClick = useCallback(() => {
    close();
    onAdd(make);
  }, [close, onAdd, make]);
  return (
    <button
      className={cn(MENU_ITEM, "flex items-center gap-2")}
      onClick={handleClick}
      type="button"
    >
      <Icon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      {label}
    </button>
  );
}

export function AddStepMenu({
  onAdd,
}: {
  onAdd: (make: (id: string) => StepAction) => void;
}) {
  const renderTrigger = useCallback(
    (props: {
      "aria-expanded": boolean;
      onClick: () => void;
      ref: RefObject<HTMLButtonElement | null>;
    }) => (
      <SmallButton className="flex items-center gap-1.5" {...props}>
        <Plus aria-hidden="true" className="size-4 shrink-0" />
        Add step
      </SmallButton>
    ),
    []
  );
  return (
    <PopoverMenu
      align="left"
      menuClassName="min-w-44"
      renderTrigger={renderTrigger}
    >
      {(close) =>
        ADDABLE.map((entry) => (
          <AddStepItem
            close={close}
            entry={entry}
            key={entry.label}
            onAdd={onAdd}
          />
        ))
      }
    </PopoverMenu>
  );
}
