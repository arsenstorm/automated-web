/** Inline name editor for a workflow row. */

import { useEffect, useRef, useState } from "react";
import { sendMessage } from "@/lib/messaging";
import type { Workflow } from "@/lib/types";

export function RenameForm({
  workflow,
  onDone,
}: {
  workflow: Workflow;
  onDone: () => void;
}) {
  // Starts empty with the current/suggested name as placeholder; an empty
  // submit accepts the placeholder.
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== workflow.name) {
      sendMessage("renameWorkflow", { id: workflow.id, name: trimmed }).then(
        onDone
      );
      return;
    }
    onDone();
  };

  return (
    <form
      // Negative margins cancel the input's padding and the ring is a
      // box-shadow, so the input's text sits exactly where the name text
      // was — no layout shift on swap.
      className="-mx-2 -my-1"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="sr-only" htmlFor={`rename-${workflow.id}`}>
        Workflow name
      </label>
      <input
        className="w-full rounded-md bg-transparent px-2 py-1 font-medium text-sm ring-1 ring-input placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1"
        id={`rename-${workflow.id}`}
        name={`rename-${workflow.id}`}
        onBlur={submit}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onDone();
          }
        }}
        placeholder={workflow.name}
        ref={inputRef}
        value={name}
      />
    </form>
  );
}
