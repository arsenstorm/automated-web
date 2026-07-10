/** Pure geometry for the tour overlay: spot frame and card placement. */

export const SPOT_PAD = 6;
const CARD_GAP = 16;
const VIEWPORT_MARGIN = 16;

interface Size {
  height: number;
  width: number;
}

/** The spotlight's frame: the panel rect padded out on every side. */
export const spotFrame = (panel: DOMRect) => ({
  height: panel.height + SPOT_PAD * 2,
  left: panel.left - SPOT_PAD,
  top: panel.top - SPOT_PAD,
  width: panel.width + SPOT_PAD * 2,
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Card beside the spot, vertically centered on it; if there's no horizontal
 * room, mirrored to the left; else it drops below the spot. Always
 * viewport-clamped.
 */
export const cardPosition = (panel: DOMRect, card: Size, viewport: Size) => {
  const beside = panel.right + SPOT_PAD + CARD_GAP;
  let left: number;
  let top: number;
  if (beside + card.width + VIEWPORT_MARGIN <= viewport.width) {
    left = beside;
    top = panel.top + panel.height / 2 - card.height / 2;
  } else if (panel.left - SPOT_PAD - CARD_GAP - card.width >= VIEWPORT_MARGIN) {
    left = panel.left - SPOT_PAD - CARD_GAP - card.width;
    top = panel.top + panel.height / 2 - card.height / 2;
  } else {
    left = panel.left + panel.width / 2 - card.width / 2;
    top = panel.bottom + SPOT_PAD + CARD_GAP;
  }
  return {
    left: clamp(
      left,
      VIEWPORT_MARGIN,
      viewport.width - card.width - VIEWPORT_MARGIN
    ),
    top: clamp(
      top,
      VIEWPORT_MARGIN,
      viewport.height - card.height - VIEWPORT_MARGIN
    ),
  };
};
