import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: ({ browser }) => ({
    // Toolbar button with no popup — clicking it opens the side panel
    // (wired via setPanelBehavior in the background).
    action: {},
    // Passive capture works wherever the user browses, so the content script
    // runs everywhere. Host access also grants tab.url reads, which is why
    // "tabs" isn't requested. ponytail: prototype-wide; move to
    // optional_host_permissions with per-site opt-in before a store release.
    host_permissions: ["<all_urls>"],
    name: "Automated Web",
    permissions: [
      "alarms", // periodic pattern mining while the service worker sleeps
      "storage", // workflows/events/patterns (encrypted) + settings
      "notifications", // "workflow stuck / finished" alerts
      "scripting", // inject the recorder into tabs already open at install
      "sidePanel", // the UI lives in the side panel
      "webNavigation", // maps recorded frame URLs to live frameIds at replay
    ],
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          // Everything stays on-device; nothing is collected or transmitted.
          data_collection_permissions: { required: ["none"] },
          id: "automated-web@arsenstorm.com",
        },
      },
    }),
  }),
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
