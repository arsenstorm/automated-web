import { describe, expect, it } from "vitest";
import type { StepAction } from "./types";
import {
  buildWorkflow,
  ensureStepIds,
  nextStepId,
  validateSteps,
} from "./workflow";

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

const NAV: StepAction = {
  id: "s1",
  kind: "navigate",
  url: "https://example.com/",
};

describe("step ids", () => {
  it("backfills missing ids without clobbering existing ones", () => {
    const steps = ensureStepIds([
      { kind: "navigate", url: "https://example.com/" },
      { id: "s3", kind: "pause" },
      CLICK,
    ]);
    expect(steps.map((step) => step.id)).toEqual(["s4", "s3", "s5"]);
  });

  it("skips past the highest existing suffix", () => {
    expect(nextStepId([NAV, { id: "s7", kind: "pause" }])).toBe("s8");
    expect(nextStepId([])).toBe("s1");
  });
});

describe("validateSteps", () => {
  it("accepts a valid edited list", () => {
    expect(
      validateSteps([
        NAV,
        { id: "s2", kind: "extract", selector: ".price" },
        {
          id: "s3",
          kind: "input",
          selector: "#note",
          value: "was {{s2}}",
          sensitive: false,
        },
        { id: "s4", kind: "sleep", ms: 5000 },
        { id: "s5", kind: "pause" },
      ])
    ).toBeNull();
  });

  it("rejects empty lists, missing ids, and duplicate ids", () => {
    expect(validateSteps([])).toContain("at least one step");
    expect(validateSteps([{ kind: "navigate", url: NAV.url }])).toContain(
      "unique id"
    );
    expect(validateSteps([NAV, { id: "s1", kind: "pause" }])).toContain(
      "unique id"
    );
  });

  it("requires a token-free navigate with a full URL first", () => {
    expect(validateSteps([{ id: "s1", kind: "pause" }])).toContain(
      "first step"
    );
    expect(
      validateSteps([{ id: "s1", kind: "navigate", url: "not a url" }])
    ).toContain("full URL");
    expect(
      validateSteps([
        { id: "s1", kind: "navigate", url: "https://example.com/{{s1}}" },
      ])
    ).toContain("earlier step");
  });

  it("rejects empty selectors and out-of-range sleeps", () => {
    expect(
      validateSteps([NAV, { id: "s2", kind: "click", selector: "  " }])
    ).toContain("selector");
    expect(
      validateSteps([NAV, { id: "s2", kind: "sleep", ms: 300_001 }])
    ).toContain("0–5 minutes");
    expect(
      validateSteps([NAV, { id: "s2", kind: "sleep", ms: 1.5 }])
    ).toContain("0–5 minutes");
  });

  it("rejects tokens referencing later or unknown steps", () => {
    expect(
      validateSteps([
        NAV,
        {
          id: "s2",
          kind: "input",
          selector: "#note",
          value: "{{s3}}",
          sensitive: false,
        },
        { id: "s3", kind: "extract", selector: ".price" },
      ])
    ).toContain("earlier step");
  });

  it("allows tokened later navigate urls that only parse after substitution", () => {
    expect(
      validateSteps([
        NAV,
        { id: "s2", kind: "extract", selector: ".link" },
        { id: "s3", kind: "navigate", url: "{{s2}}" },
      ])
    ).toBeNull();
  });
});
