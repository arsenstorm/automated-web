/** AnimatePresence shells: height expansion, icon crossfades, step flows. */

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import {
  useAnimDuration,
  useCrossfade,
  usePageCrossfade,
} from "@/entrypoints/sidepanel/motion";

/** Height expand/collapse for a conditionally shown block. */
export function Expand({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  const duration = useAnimDuration();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className="overflow-hidden"
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          transition={{ duration }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Centered step-flow shell: crossfades between steps keyed by `stepKey`. */
export function StepFlow({
  stepKey,
  children,
}: {
  stepKey: string;
  children: ReactNode;
}) {
  const fade = usePageCrossfade();
  return (
    <main className="flex flex-1 flex-col justify-center">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          {...fade}
          className="flex flex-col items-center px-4 py-8 text-center"
          key={stepKey}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

/** Blur/scale/fade crossfade between icons keyed by `id`. */
export function IconSwap({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const fade = useCrossfade(0.9);
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span {...fade} className="flex" key={id}>
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
