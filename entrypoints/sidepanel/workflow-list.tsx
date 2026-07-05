/** Workflow list grouped by domain. */

import { hostOfUrl } from "@/lib/naming";
import type { RunState, Workflow } from "@/lib/types";
import { WorkflowRow } from "./workflow-row";

export function WorkflowList({
  workflows,
  run,
  namingId,
  onChanged,
  onEdit,
}: {
  workflows: Workflow[];
  run: RunState | null;
  namingId: string | null;
  onChanged: () => void;
  onEdit: (id: string) => void;
}) {
  const groups = new Map<string, Workflow[]>();
  const sorted = [...workflows].sort((a, b) => b.createdAt - a.createdAt);
  for (const workflow of sorted) {
    const host = hostOfUrl(workflow.origin) ?? workflow.origin;
    const group = groups.get(host);
    if (group) {
      group.push(workflow);
    } else {
      groups.set(host, [workflow]);
    }
  }
  const hosts = [...groups.keys()].sort();

  return (
    <div className="flex flex-col gap-4">
      {hosts.map((host) => (
        <section aria-labelledby={`workflows-${host}`} key={host}>
          <h2
            className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
            id={`workflows-${host}`}
          >
            {host}
          </h2>
          <ul className="mt-1 divide-y divide-border">
            {(groups.get(host) ?? []).map((workflow) => (
              <WorkflowRow
                key={workflow.id}
                namingId={namingId}
                onChanged={onChanged}
                onEdit={() => onEdit(workflow.id)}
                run={run}
                workflow={workflow}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
