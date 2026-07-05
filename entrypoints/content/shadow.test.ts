/** Shadow DOM record + replay: composedPath capture, chained-selector replay. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { onMessage } from "@/lib/messaging";
import type { RecordedEvent } from "@/lib/types";
import { executeStep } from "./executor";
import { flush, onClick, suppressRecording } from "./recorder";

// One listener per JS context is the messaging library's rule, so it lives
// at module scope and each flushed() call reads what the last flush sent.
let received: RecordedEvent[] = [];
onMessage("recordEvents", ({ data }) => {
  received = data;
});

const mountShadowButton = () => {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  host.id = "host";
  document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  const button = document.createElement("button");
  button.textContent = "Go";
  root.append(button);
  return { host, root, button };
};

describe("recording inside shadow roots", () => {
  beforeEach(() => {
    suppressRecording(0);
  });

  it("records a chained selector via composedPath", async () => {
    const { host, root, button } = mountShadowButton();
    // event.target is retargeted to the host; composedPath keeps the truth.
    onClick({
      target: host,
      composedPath: () => [button, root, host, document.body, document],
    } as unknown as MouseEvent);
    received = [];
    await flush();
    expect(received[0]?.action).toMatchObject({
      kind: "click",
      selector: "#host >>> button",
      text: "Go",
    });
  });
});

describe("replaying inside shadow roots", () => {
  it("clicks through a chained selector", async () => {
    const { button } = mountShadowButton();
    const clicked = vi.fn();
    button.addEventListener("click", clicked);
    const result = await executeStep({
      kind: "click",
      selector: "#host >>> button",
    });
    expect(result).toEqual({ ok: true });
    expect(clicked).toHaveBeenCalledOnce();
  });
});
