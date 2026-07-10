/** Modified clicks on links (cmd/ctrl/shift = new tab/window) are not recorded. */

import { beforeEach, describe, expect, it } from "vitest";
import { onMessage } from "@/lib/messaging";
import type { RecordedEvent } from "@/lib/types";
import { flush, onClick, suppressRecording } from "./recorder";

// One listener per JS context is the messaging library's rule, so it lives
// at module scope and each flushed() call reads what the last flush sent.
let received: RecordedEvent[] = [];
onMessage("recordEvents", ({ data }) => {
  received = data;
});

const flushed = async (): Promise<RecordedEvent[]> => {
  received = [];
  await flush();
  return received;
};

const mountLink = (): HTMLAnchorElement => {
  document.body.innerHTML =
    '<a href="https://example.com/next">Next</a><button>Go</button>';
  const link = document.querySelector("a");
  if (!link) {
    throw new Error("link not mounted");
  }
  return link;
};

const clickEvent = (target: Element, init: Partial<MouseEvent> = {}) =>
  ({ target, ...init }) as unknown as MouseEvent;

describe("modified clicks on links", () => {
  beforeEach(async () => {
    suppressRecording(0);
    // Drain anything a previous test left in the buffer.
    await flush();
  });

  it("skips cmd+click — the new tab's navigate carries the intent", async () => {
    onClick(clickEvent(mountLink(), { metaKey: true }));
    expect(await flushed()).toEqual([]);
  });

  it("skips ctrl+click and shift+click", async () => {
    const link = mountLink();
    onClick(clickEvent(link, { ctrlKey: true }));
    onClick(clickEvent(link, { shiftKey: true }));
    expect(await flushed()).toEqual([]);
  });

  it("still records a plain click on a link", async () => {
    onClick(clickEvent(mountLink()));
    const events = await flushed();
    expect(events[0]?.action).toMatchObject({ kind: "click", text: "Next" });
  });

  it("still records a modified click on a non-link", async () => {
    mountLink();
    const button = document.querySelector("button");
    if (!button) {
      throw new Error("button not mounted");
    }
    onClick(clickEvent(button, { metaKey: true }));
    const events = await flushed();
    expect(events[0]?.action).toMatchObject({ kind: "click", text: "Go" });
  });
});
