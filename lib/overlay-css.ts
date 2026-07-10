/**
 * Shared card/button tokens for the in-page shadow-root overlays (suggestion
 * toast, tour card). Matches the side panel's design tokens (amber primary,
 * zinc neutrals) and follows the OS color scheme. Each overlay inlines this
 * plus its own layout CSS into a closed shadow root so page CSS can't reach
 * it; the widget's own rules come second and override these where they differ.
 */
export const OVERLAY_CARD_CSS = `
  .card {
    all: initial;
    position: fixed;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
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
  .row { display: flex; gap: 8px; }
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
