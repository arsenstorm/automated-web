/** Centered empty state shown when no workflows exist yet. */

import { cn } from "cnfast";
import { Workflow } from "lucide-react";
import { ErrorNotice } from "@/components/error-notice";
import { PRIMARY_BUTTON } from "@/components/styles";

export function EmptyState({
  onRecord,
  error = null,
}: {
  onRecord: () => void;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
        <Workflow aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>
      <h2 className="mt-4 font-medium text-sm">No workflows yet</h2>
      <p className="mt-1 max-w-56 text-pretty text-muted-foreground text-sm">
        Record a repetitive task once and replay it with one click.
      </p>
      <button
        className={cn(PRIMARY_BUTTON, "mt-4")}
        onClick={onRecord}
        type="button"
      >
        Create your first workflow
      </button>
      <ErrorNotice message={error} />
    </div>
  );
}
