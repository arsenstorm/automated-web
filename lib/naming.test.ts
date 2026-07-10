import { describe, expect, it } from "vitest";
import { describeStep, suggestName } from "./naming";
import type { StepAction } from "./types";

const ORIGIN = "https://example.com";
const HOST = "example.com";

describe("suggestName", () => {
  it("names flows with a password input as logins", () => {
    const actions: StepAction[] = [
      { kind: "navigate", url: `${ORIGIN}/login` },
      { kind: "input", selector: "#password", sensitive: true, value: "r" },
      { kind: "submit", selector: "form" },
    ];
    expect(suggestName(actions, HOST)).toBe("Log in to example.com");
  });

  it("names flows typing into a search field as searches", () => {
    const actions: StepAction[] = [
      {
        kind: "input",
        selector: 'input[name="q"]',
        sensitive: false,
        value: "r",
      },
      { kind: "submit", selector: "form" },
    ];
    expect(suggestName(actions, HOST)).toBe("Search on example.com");
  });

  it("names cross-site flows as a journey, not by link text", () => {
    const actions: StepAction[] = [
      { kind: "navigate", url: `${ORIGIN}/writeup` },
      {
        kind: "click",
        selector: 'a[href="https://github.com/x"]',
        text: "on GitHub",
      },
      { kind: "navigate", url: "https://github.com/x/repo" },
    ];
    expect(suggestName(actions, HOST)).toBe("example.com → github.com");
  });

  it("treats an external link opened in a new tab as a journey", () => {
    // The new tab's page load lands in another tab, so it is never recorded.
    const actions: StepAction[] = [
      { kind: "navigate", url: `${ORIGIN}/writeup` },
      {
        kind: "click",
        selector: 'a[href="https://github.com/x/repo"]',
        text: "on GitHub",
      },
    ];
    expect(suggestName(actions, HOST)).toBe("example.com → github.com");
  });

  it("uses the last short click text", () => {
    const actions: StepAction[] = [
      { kind: "click", selector: "#menu", text: "Menu" },
      { kind: "click", selector: "#subscribe", text: "Subscribe" },
      { kind: "submit", selector: "form" },
    ];
    expect(suggestName(actions, HOST)).toBe("Subscribe on example.com");
  });

  it("falls back for input-only and bare flows", () => {
    const input: StepAction[] = [
      { kind: "input", selector: "#note", sensitive: false, value: "r" },
    ];
    expect(suggestName(input, HOST)).toBe("Fill a form on example.com");
    expect(suggestName([{ kind: "navigate", url: ORIGIN }], HOST)).toBe(
      "Workflow on example.com"
    );
  });
});

describe("describeStep", () => {
  it("labels each kind", () => {
    expect(describeStep({ kind: "navigate", url: `${ORIGIN}/a` })).toBe(
      "Open example.com"
    );
    expect(describeStep({ kind: "click", selector: "#go", text: "Go" })).toBe(
      "Click Go"
    );
    expect(describeStep({ kind: "sleep", ms: 5000 })).toBe("Wait 5s");
    expect(describeStep({ kind: "pause" })).toBe("Pause for me");
    expect(describeStep({ kind: "extract", selector: ".price" })).toBe(
      "Extract text from .price"
    );
  });

  it("labels user-click with and without a label", () => {
    expect(describeStep({ kind: "user-click", label: "the email cell" })).toBe(
      "Wait for my click — the email cell"
    );
    expect(describeStep({ kind: "user-click" })).toBe("Wait for my click");
  });
});
