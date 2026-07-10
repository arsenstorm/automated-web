import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing";

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: "happy-dom",
    // Keep tests offline: happy-dom otherwise fetches real iframe URLs
    // (e.g. the captcha-detection fixture in lib/replay-state.test.ts).
    environmentOptions: {
      happyDOM: {
        settings: {
          disableIframePageLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
  },
});
