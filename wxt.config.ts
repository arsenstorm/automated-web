import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Automated Web",
    // Toolbar button with no popup — clicking it opens the side panel
    // (wired via setPanelBehavior in the background).
    action: {},
    permissions: [
      "storage",
      "tabs",
      "scripting",
      "activeTab",
      "notifications",
      "sidePanel",
    ],
    host_permissions: ["<all_urls>"],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
