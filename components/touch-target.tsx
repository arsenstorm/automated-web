/**
 * Invisible hit-area extender for small controls: fills at least 48px on
 * coarse pointers, hidden entirely for mouse users. Render inside a
 * `relative` control.
 */
export const TOUCH_TARGET = (
  <span
    aria-hidden="true"
    className="-translate-1/2 absolute top-1/2 left-1/2 pointer-fine:hidden size-[max(100%,3rem)]"
  />
);
