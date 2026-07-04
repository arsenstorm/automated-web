/**
 * The house crossfade: blur + fade (+ optional scale) used for every
 * AnimatePresence swap. Spread onto a motion element: `{...CROSSFADE}`.
 */

const BLUR_IN = { filter: "blur(0px)", opacity: 1 };
const BLUR_OUT = { filter: "blur(2px)", opacity: 0 };

export const crossfade = (scale?: number) => ({
  animate: scale === undefined ? BLUR_IN : { ...BLUR_IN, scale: 1 },
  exit: scale === undefined ? BLUR_OUT : { ...BLUR_OUT, scale },
  initial: scale === undefined ? BLUR_OUT : { ...BLUR_OUT, scale },
  transition: { duration: 0.15 },
});

/** Default block/page crossfade. */
export const CROSSFADE = crossfade(0.98);
