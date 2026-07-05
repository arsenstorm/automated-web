/** Centered inline error that animates in and out; nothing when null. */

import { TriangleAlert } from "lucide-react";
import { Expand } from "./transitions";

export function ErrorNotice({
  message,
  className,
}: {
  message: string | null;
  className?: string;
}) {
  return (
    <div className={className} role="status">
      <Expand show={message !== null}>
        <p className="flex items-center justify-center gap-1.5 py-3 text-destructive text-sm">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {message}
        </p>
      </Expand>
    </div>
  );
}
