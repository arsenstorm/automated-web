export default defineBackground(() => {
  // Open the side panel when the toolbar icon is clicked (Chromium only).
  browser.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
});
