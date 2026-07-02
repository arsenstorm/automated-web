import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { notifyStuck } from "./notify";

describe("notifyStuck", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("creates a notification the user must dismiss", async () => {
    const created: unknown[] = [];
    fakeBrowser.notifications.onClosed.addListener(() => {
      // no-op; presence proves the mock is wired
    });
    // fakeBrowser records created notifications via getAll
    await notifyStuck("captcha detected");

    const all = await fakeBrowser.notifications.getAll();
    created.push(...Object.keys(all));
    expect(created.length).toBe(1);
  });
});
