import { describe, expect, it } from "vitest";
import { resolveStep, tokenRefs } from "./templates";
import type { StepAction } from "./types";

describe("tokenRefs", () => {
  it("extracts ids, tolerating whitespace", () => {
    expect(tokenRefs("Order {{s2}} for {{ s10 }}")).toEqual(["s2", "s10"]);
    expect(tokenRefs("no tokens")).toEqual([]);
  });
});

describe("resolveStep", () => {
  const outputs = { s1: "ABC-123" };

  it("substitutes into input values", () => {
    const step: StepAction = {
      kind: "input",
      selector: "#note",
      value: "Order {{s1}} shipped",
      sensitive: false,
    };
    expect(resolveStep(step, outputs)).toEqual({
      step: { ...step, value: "Order ABC-123 shipped" },
    });
  });

  it("substitutes into navigate urls", () => {
    const step: StepAction = {
      kind: "navigate",
      url: "https://example.com/orders/{{s1}}",
    };
    expect(resolveStep(step, outputs)).toEqual({
      step: { ...step, url: "https://example.com/orders/ABC-123" },
    });
  });

  it("passes non-templated kinds through untouched", () => {
    const step: StepAction = { kind: "click", selector: "{{s1}}" };
    expect(resolveStep(step, outputs)).toEqual({ step });
  });

  it("reports missing outputs", () => {
    const step: StepAction = {
      kind: "input",
      selector: "#note",
      value: "{{s1}} {{s9}}",
      sensitive: false,
    };
    expect(resolveStep(step, outputs)).toEqual({ missing: ["s9"] });
  });
});
