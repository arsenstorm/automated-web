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
      fingerprint: "abc",
      startUrl: "https://example.com/app?tab=1",
    });
    expect(workflow.origin).toBe("https://example.com");
    expect(workflow.steps[0]).toEqual({
      kind: "navigate",
      url: "https://example.com/app?tab=1",
    });
  });

  it("prepends a navigate to the start URL when the first action is for another tab", () => {
    const workflow = buildWorkflow({
      actions: [{ kind: "navigate", tab: 1, url: "https://example.com/other" }],
      fingerprint: "abc",
      startUrl: "https://example.com/app",
    });
    expect(workflow.steps[0]).toEqual({
      kind: "navigate",
      url: "https://example.com/app",
    });
    expect(workflow.steps[1]).toEqual({
      kind: "navigate",
      tab: 1,
      url: "https://example.com/other",
    });
  });

  it("keeps an existing leading navigate and drops click-before-submit", () => {
    const workflow = buildWorkflow({
      actions: [
        { kind: "navigate", url: "https://example.com/form" },
        CLICK,
        { kind: "submit", selector: "form" },
      ],
      fingerprint: "abc",
      startUrl: "https://example.com/form",
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
          sensitive: false,
          value: "was {{s2}}",
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
          sensitive: false,
          value: "{{s3}}",
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

  it("accepts a user-click step with no selector", () => {
    expect(validateSteps([NAV, { id: "s2", kind: "user-click" }])).toBeNull();
    expect(
      validateSteps([NAV, { id: "s2", kind: "user-click", selector: "" }])
    ).toBeNull();
  });

  it("requires the first step to open the start tab", () => {
    expect(
      validateSteps([{ id: "s1", kind: "navigate", tab: 1, url: NAV.url }])
    ).toContain("start tab");
    expect(
      validateSteps([{ id: "s1", kind: "navigate", tab: 0, url: NAV.url }])
    ).toBeNull();
  });

  it("requires a new tab ordinal to start with a navigate", () => {
    expect(
      validateSteps([NAV, { id: "s2", kind: "click", selector: "#go", tab: 1 }])
    ).toContain("must start by opening a page");
  });

  it("allows a navigate to open a new tab ordinal", () => {
    expect(
      validateSteps([
        NAV,
        { id: "s2", kind: "navigate", tab: 1, url: "https://example.com/b" },
        { id: "s3", kind: "click", selector: "#go", tab: 1 },
      ])
    ).toBeNull();
  });
});
