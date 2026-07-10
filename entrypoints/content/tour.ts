/** In-page spotlight tour over the writeup's demo panels (closed shadow root). */

import { OVERLAY_CARD_CSS } from "@/lib/overlay-css";
import { getStored } from "@/lib/storage";
import { DEMOS, TOUR_URL } from "@/lib/tour";
import type { TourState } from "@/lib/types";
import { renderCardContent } from "./tour-card";
import { cardPosition, spotFrame } from "./tour-layout";

const FIND_PANEL_INTERVAL_MS = 300;
const FIND_PANEL_MAX_TRIES = 40;

/** Spot highlight plus card sizing/motion, layered over OVERLAY_CARD_CSS. */
const TOUR_CSS = `
  .spot {
    all: initial;
    position: fixed;
    z-index: 2147483646;
    pointer-events: none;
    border-radius: 20px;
    box-shadow:
      0 0 0 2px oklch(0.852 0.199 91.936),
      0 0 0 100vmax rgb(0 0 0 / 0.55);
    transition: top 0.2s, left 0.2s, width 0.2s, height 0.2s;
  }
  .card {
    gap: 8px;
    width: 380px;
    transition: top 0.2s, left 0.2s;
  }
  button {
    align-self: flex-start;
    font-size: 13px;
  }
`;

let tourHost: HTMLElement | null = null;
let panelEl: Element | null = null;
let spotEl: HTMLElement | null = null;
let cardEl: HTMLElement | null = null;
let lastShown: TourState | null = null;
let findTimer: ReturnType<typeof setInterval> | null = null;
let panelObserver: ResizeObserver | null = null;

/** True when the element is our tour UI — the recorder must ignore it. */
export const isInTour = (el: Element): boolean =>
  tourHost !== null && (el === tourHost || tourHost.contains(el));

const TRAILING_SLASH = /\/$/;
const stripSlash = (path: string) => path.replace(TRAILING_SLASH, "");

const onTourPage = (): boolean => {
  try {
    // Pathname-only so a local dev build of the writeup site works too;
    // trailing-slash-insensitive because the live site redirects to one.
    return (
      stripSlash(location.pathname) === stripSlash(new URL(TOUR_URL).pathname)
    );
  } catch {
    return false;
  }
};

const positionSpot = () => {
  if (!(spotEl && panelEl)) {
    return;
  }
  const rect = panelEl.getBoundingClientRect();
  const frame = spotFrame(rect);
  spotEl.style.top = `${frame.top}px`;
  spotEl.style.left = `${frame.left}px`;
  spotEl.style.width = `${frame.width}px`;
  spotEl.style.height = `${frame.height}px`;
  if (!cardEl) {
    return;
  }
  const card = cardEl.getBoundingClientRect();
  const position = cardPosition(rect, card, {
    height: window.innerHeight,
    width: window.innerWidth,
  });
  cardEl.style.left = `${position.left}px`;
  cardEl.style.top = `${position.top}px`;
};

const removeOverlay = () => {
  if (findTimer !== null) {
    clearInterval(findTimer);
    findTimer = null;
  }
  panelObserver?.disconnect();
  panelObserver = null;
  tourHost?.remove();
  document.documentElement.style.overflow = "";
  document.documentElement.style.paddingRight = "";
  tourHost = null;
  panelEl = null;
  spotEl = null;
  cardEl = null;
  window.removeEventListener("scroll", positionSpot, true);
  window.removeEventListener("resize", positionSpot);
};

/**
 * Freeze the page so the panel stays put while the tour is up. Padding
 * replaces the scrollbar it removes, so centered content doesn't shift.
 */
const lockScroll = () => {
  const root = document.documentElement;
  if (root.style.overflow === "hidden") {
    return;
  }
  // Pad by how much width hiding the scrollbar actually reclaimed — pages
  // that reserve the gutter themselves (scrollbar-gutter, overlay bars)
  // reclaim nothing and must get no padding.
  const before = root.clientWidth;
  root.style.overflow = "hidden";
  const reclaimed = root.clientWidth - before;
  if (reclaimed > 0) {
    root.style.paddingRight = `${reclaimed}px`;
  }
};

/** Create the host/spot/card once; later renders update them in place so the
 * spot and card transition smoothly between steps instead of blinking. */
const ensureOverlay = (): HTMLElement => {
  if (tourHost && cardEl) {
    return cardEl;
  }
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = OVERLAY_CARD_CSS + TOUR_CSS;
  const spot = document.createElement("div");
  spot.className = "spot";
  const card = document.createElement("div");
  card.className = "card";
  shadow.append(style, spot, card);
  document.documentElement.append(host);
  tourHost = host;
  spotEl = spot;
  cardEl = card;
  window.addEventListener("scroll", positionSpot, true);
  window.addEventListener("resize", positionSpot);
  return card;
};

const findPanel = (demoIndex: number): Element | null => {
  const demo = DEMOS[demoIndex];
  if (!demo) {
    return null;
  }
  return (
    document.querySelector(`[data-demo="${demo.key}"]`) ??
    document.getElementById(demo.ids[0].slice(1))?.closest(".not-prose") ??
    null
  );
};

const renderOverlay = (tour: TourState, panel: Element) => {
  if (!DEMOS[tour.step]) {
    removeOverlay();
    return;
  }
  const card = ensureOverlay();
  renderCardContent(card, tour);

  // Only re-center when the spotlight moves to a different panel — the same
  // panel re-centering on every phase change reads as the page jumping.
  const panelChanged = panel !== panelEl;
  panelEl = panel;
  if (panelChanged) {
    // Instant scroll: a smooth one would be cancelled by the scroll lock.
    panel.scrollIntoView({ behavior: "instant", block: "center" });
  }
  lockScroll();
  positionSpot();
  // Demo resets and late-rendering content resize the panel after we've
  // measured it; keep the spot and card glued to the live rect.
  panelObserver?.disconnect();
  panelObserver = new ResizeObserver(positionSpot);
  panelObserver.observe(panel);
};

const resetDemo = (panel: Element) => {
  const reset = panel.querySelector("[data-demo-reset]");
  if (reset instanceof HTMLElement) {
    reset.click();
  }
};

const syncTour = (tour: TourState | null) => {
  if (!tour) {
    lastShown = null;
    removeOverlay();
    return;
  }
  // Demos render client-side; poll briefly until the panel exists.
  if (findTimer !== null) {
    clearInterval(findTimer);
    findTimer = null;
  }
  let tries = 0;
  const attempt = () => {
    const panel = findPanel(tour.step);
    if (!panel) {
      tries += 1;
      if (findTimer === null) {
        findTimer = setInterval(attempt, FIND_PANEL_INTERVAL_MS);
      } else if (tries > FIND_PANEL_MAX_TRIES) {
        clearInterval(findTimer);
        findTimer = null;
      }
      return;
    }
    // Fresh demo state before the user replays what they just recorded.
    const enteredReplay =
      tour.phase === "replay" &&
      (lastShown?.phase !== "replay" || lastShown.step !== tour.step);
    renderOverlay(tour, panel);
    if (enteredReplay) {
      resetDemo(panel);
    }
    lastShown = tour;
  };
  attempt();
};

/** No-op off the writeup page; otherwise mirrors the stored tour state. */
export const mountTour = () => {
  if (!onTourPage()) {
    return;
  }
  getStored("tour")
    .then(syncTour)
    .catch(() => null);
  browser.storage.onChanged.addListener((changes) => {
    if (changes.tour) {
      getStored("tour")
        .then(syncTour)
        .catch(() => null);
    }
  });
};
