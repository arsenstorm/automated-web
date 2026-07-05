/**
 * View/step heading that takes focus on mount, so keyboard and screen-reader
 * users land on the new view after a swap instead of dropping to the body
 * when the previous view unmounts.
 */

import { cn } from "cnfast";
import { type ReactNode, useEffect, useRef } from "react";

export function ViewTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 className={cn("outline-none", className)} ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}
