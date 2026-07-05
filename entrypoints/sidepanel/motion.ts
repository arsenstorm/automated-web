/**
 * The house crossfade: blur + fade (+ optional scale) used for every
 * AnimatePresence swap. Spread onto a motion element: `{...useCrossfade()}`.
 *
 * All durations go through useAnimDuration so every animation collapses to
 * an instant cut when the user prefers reduced motion. MotionConfig's
 * reducedMotion="user" only drops transform/layout animations — opacity and
 * blur would still play without this.
 */

import { useSyncExternalStore } from "react";

const BLUR_IN = { filter: "blur(0px)", opacity: 1 };
const BLUR_OUT = { filter: "blur(2px)", opacity: 0 };

const HOUSE_DURATION = 0.15;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const subscribeToReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/**
 * Live prefers-reduced-motion. Motion's own useReducedMotion snapshots the
 * value at mount and never re-renders on change, so long-lived components
 * (like App) would keep animating after the setting flips.
 */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches
  );
}

/** The given duration, or 0 when the user prefers reduced motion. */
export function useAnimDuration(base: number = HOUSE_DURATION) {
  return useReducedMotion() ? 0 : base;
}

export function useCrossfade(scale?: number) {
  const duration = useAnimDuration();
  return {
    animate: scale === undefined ? BLUR_IN : { ...BLUR_IN, scale: 1 },
    exit: scale === undefined ? BLUR_OUT : { ...BLUR_OUT, scale },
    initial: scale === undefined ? BLUR_OUT : { ...BLUR_OUT, scale },
    transition: { duration },
  };
}

/** Default block/page crossfade. */
export function usePageCrossfade() {
  return useCrossfade(0.98);
}
