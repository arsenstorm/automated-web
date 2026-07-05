import { describe, expect, it } from "vitest";
import type { StepAction } from "./types";
import { buildWorkflow } from "./workflow";

const CLICK: StepAction = { kind: "click", selector: "#go", text: "Go" };

describe("buildWorkflow", () => {
  it("prepends a navigate to the start URL when missing", () => {
    const workflow = buildWorkflow({
      actions: [CLICK],
      startUrl: "https://example.com/app?tab=1",
      fingerprint: "abc",
    });
    expect(workflow.origin).toBe("https://example.com");
    expect(workflow.steps[0]).toEqual({
      kind: "navigate",
      url: "https://example.com/app?tab=1",
    });
  });

  it("keeps an existing leading navigate and drops click-before-submit", () => {
    const workflow = buildWorkflow({
      actions: [
        { kind: "navigate", url: "https://example.com/form" },
        CLICK,
        { kind: "submit", selector: "form" },
      ],
      startUrl: "https://example.com/form",
      fingerprint: "abc",
    });
    expect(workflow.steps).toEqual([
      { kind: "navigate", url: "https://example.com/form" },
      { kind: "submit", selector: "form" },
    ]);
  });
});
