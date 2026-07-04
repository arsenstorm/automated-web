import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => ({
    name: "Automated Web",
    // Toolbar button with no popup — clicking it opens the side panel
    // (wired via setPanelBehavior in the background).
    action: {},
    permissions: [
      "alarms",
      "storage",
      "tabs",
      "scripting",
      "activeTab",
      "notifications",
      "sidePanel",
    ],
    host_permissions: ["<all_urls>"],
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "automated-web@arsenstorm.com",
          // Everything stays on-device; nothing is collected or transmitted.
          data_collection_permissions: { required: ["none"] },
        },
      },
    }),
  }),
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
