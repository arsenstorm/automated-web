/** In-page spotlight tour over the writeup's demo panels (closed shadow root). */

import { sendMessage } from "@/lib/messaging";
import { getStored, setStored } from "@/lib/storage";
import { DEMOS, TOUR_URL } from "@/lib/tour";
import type { TourState } from "@/lib/types";

const FIND_PANEL_INTERVAL_MS = 300;
const FIND_PANEL_MAX_TRIES = 40;

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
    all: initial;
    position: fixed;
    z-index: 2147483647;
    transition: top 0.2s, left 0.2s;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 380px;
    max-width: calc(100vw - 32px);
    padding: 16px;
    border-radius: 10px;
    background: oklch(1 0 0);
    color: oklch(0.141 0.005 285.823);
    font: 400 14px/1.45 system-ui, sans-serif;
    box-shadow:
      0 0 0 1px oklch(0.141 0.005 285.823 / 0.08),
      0 10px 15px -3px rgb(0 0 0 / 0.1),
      0 4px 6px -4px rgb(0 0 0 / 0.1);
  }
  p { margin: 0; }
  .row { display: flex; gap: 8px; }
  .title { font-weight: 600; }
  .body { color: oklch(0.552 0.016 285.938); }
  button {
    all: initial;
    cursor: pointer;
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: 8px;
    font: 500 13px/1.45 system-ui, sans-serif;
    color: oklch(0.21 0.006 285.885);
    background: oklch(0.967 0.001 286.375);
  }
  button:hover { background: oklch(0.967 0.001 286.375 / 0.7); }
  button:focus-visible {
    outline: 2px solid oklch(0.705 0.015 286.067);
    outline-offset: 2px;
  }
  @media (prefers-color-scheme: dark) {
    .card {
      background: oklch(0.21 0.006 285.885);
      color: oklch(0.985 0 0);
      box-shadow: 0 0 0 1px oklch(1 0 0 / 0.1);
    }
    .body { color: oklch(0.705 0.015 286.067); }
    button {
      color: oklch(0.985 0 0);
      background: oklch(0.274 0.006 286.033);
    }
    button:hover { background: oklch(0.274 0.006 286.033 / 0.7); }
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

const SPOT_PAD = 6;
const CARD_GAP = 16;
const VIEWPORT_MARGIN = 16;

const positionSpot = () => {
  if (!(spotEl && panelEl)) {
    return;
  }
  const rect = panelEl.getBoundingClientRect();
  spotEl.style.top = `${rect.top - SPOT_PAD}px`;
  spotEl.style.left = `${rect.left - SPOT_PAD}px`;
  spotEl.style.width = `${rect.width + SPOT_PAD * 2}px`;
  spotEl.style.height = `${rect.height + SPOT_PAD * 2}px`;
  if (!cardEl) {
    return;
  }
  // Card sits beside the spot, vertically centered on it; if there's no
  // horizontal room, it drops below the spot instead. Always viewport-clamped.
  const card = cardEl.getBoundingClientRect();
  const beside = rect.right + SPOT_PAD + CARD_GAP;
  let left: number;
  let top: number;
  if (beside + card.width + VIEWPORT_MARGIN <= window.innerWidth) {
    left = beside;
    top = rect.top + rect.height / 2 - card.height / 2;
  } else if (rect.left - SPOT_PAD - CARD_GAP - card.width >= VIEWPORT_MARGIN) {
    left = rect.left - SPOT_PAD - CARD_GAP - card.width;
    top = rect.top + rect.height / 2 - card.height / 2;
  } else {
    left = rect.left + rect.width / 2 - card.width / 2;
    top = rect.bottom + SPOT_PAD + CARD_GAP;
  }
  cardEl.style.left = `${Math.min(
    Math.max(left, VIEWPORT_MARGIN),
    window.innerWidth - card.width - VIEWPORT_MARGIN
  )}px`;
  cardEl.style.top = `${Math.min(
    Math.max(top, VIEWPORT_MARGIN),
    window.innerHeight - card.height - VIEWPORT_MARGIN
  )}px`;
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
  style.textContent = TOUR_CSS;
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
  const demo = DEMOS[tour.step];
  if (!demo) {
    removeOverlay();
    return;
  }
  const card = ensureOverlay();
  const title = document.createElement("p");
  title.className = "title";
  title.textContent = demo.title;
  const body = document.createElement("p");
  body.className = "body";
  const row = document.createElement("div");
  row.className = "row";
  const addButton = (label: string, onClick: () => void) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("click", onClick);
    row.append(button);
  };
  const endTour = () => {
    setStored("tour", null).catch(() => null);
  };

  if (tour.phase === "done") {
    const isLast = tour.step === DEMOS.length - 1;
    if (isLast) {
      title.textContent = "You're ready to go";
      body.textContent =
        "That's the tour — you can now record and replay workflows on any site. Want to remove the demo workflows the tour created?";
      addButton("Remove demo workflows", () => {
        for (const id of tour.workflowIds ?? []) {
          sendMessage("deleteWorkflow", id).catch(() => null);
        }
        endTour();
      });
      addButton("Keep them", endTour);
    } else {
      body.textContent = demo.doneCopy;
      addButton("Continue", () => {
        setStored("tour", {
          phase: "record",
          step: tour.step + 1,
          workflowIds: tour.workflowIds,
        }).catch(() => null);
      });
      addButton("Exit tour", endTour);
    }
  } else {
    body.textContent =
      tour.phase === "record" ? demo.recordCopy : demo.replayCopy;
    addButton("Exit tour", endTour);
  }
  card.replaceChildren(title, body, row);

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
