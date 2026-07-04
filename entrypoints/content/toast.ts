/** In-page suggestion toast, isolated in a closed shadow root. */

import { sendMessage } from "@/lib/messaging";

const TOAST_TTL_MS = 15_000;

/**
 * Matches the side panel's design tokens (amber primary, zinc neutrals) and
 * follows the OS color scheme. Inline in the shadow root so page CSS can't
 * reach it.
 */
const TOAST_CSS = `
  .toast {
    all: initial;
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 320px;
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
  .title { font-weight: 600; }
  .body { color: oklch(0.552 0.016 285.938); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  button {
    all: initial;
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 8px;
    font: 500 14px/1.45 system-ui, sans-serif;
    color: oklch(0.21 0.006 285.885);
    background: oklch(0.967 0.001 286.375);
  }
  button:hover { background: oklch(0.967 0.001 286.375 / 0.7); }
  button:focus-visible {
    outline: 2px solid oklch(0.705 0.015 286.067);
    outline-offset: 2px;
  }
  button.primary {
    color: oklch(0.421 0.095 57.708);
    background: oklch(0.852 0.199 91.936);
  }
  button.primary:hover { background: oklch(0.852 0.199 91.936 / 0.9); }
  @media (prefers-color-scheme: dark) {
    .toast {
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
    button.primary {
      color: oklch(0.421 0.095 57.708);
      background: oklch(0.795 0.184 86.047);
    }
    button.primary:hover { background: oklch(0.795 0.184 86.047 / 0.9); }
  }
`;

let toastHost: HTMLElement | null = null;

/** True when the element is our toast — the recorder must ignore it. */
export const isInToast = (el: Element): boolean =>
  toastHost !== null && (el === toastHost || toastHost.contains(el));

const removeToast = () => {
  toastHost?.remove();
  toastHost = null;
};

export const showToast = (fingerprint: string, stepCount: number) => {
  removeToast();
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = TOAST_CSS;

  const box = document.createElement("div");
  box.className = "toast";
  const title = document.createElement("p");
  title.className = "title";
  title.textContent = "Automate this task?";
  const text = document.createElement("p");
  text.className = "body";
  text.textContent = `You've repeated the same ${stepCount}-step task on this site. Save it to replay it with one click.`;
  const row = document.createElement("div");
  row.className = "row";

  const actions: [string, string, () => void][] = [
    [
      "Save workflow",
      "primary",
      () => sendMessage("saveSuggestion", { fingerprint }).catch(() => null),
    ],
    [
      "Dismiss",
      "",
      () =>
        sendMessage("dismissSuggestion", {
          fingerprint,
          never: false,
        }).catch(() => null),
    ],
    [
      "Never for this site",
      "",
      () =>
        sendMessage("dismissSuggestion", { fingerprint, never: true }).catch(
          () => null
        ),
    ],
  ];
  for (const [label, className, act] of actions) {
    const button = document.createElement("button");
    button.textContent = label;
    button.className = className;
    button.addEventListener("click", () => {
      act();
      removeToast();
    });
    row.append(button);
  }
  box.append(title, text, row);
  shadow.append(style, box);
  document.documentElement.append(host);
  toastHost = host;
  setTimeout(removeToast, TOAST_TTL_MS);
};
