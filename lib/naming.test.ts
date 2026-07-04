import { describe, expect, it } from "vitest";
import { suggestName } from "./naming";
import type { StepAction } from "./types";

const ORIGIN = "https://example.com";
const HOST = "example.com";

describe("suggestName", () => {
  it("names flows with a password input as logins", () => {
    const actions: StepAction[] = [
      { kind: "navigate", url: `${ORIGIN}/login` },
      { kind: "input", selector: "#password", value: "r", sensitive: true },
      { kind: "submit", selector: "form" },
    ];
    expect(suggestName(actions, HOST)).toBe("Log in to example.com");
  });

  it("names flows typing into a search field as searches", () => {
    const actions: StepAction[] = [
      {
        kind: "input",
        selector: 'input[name="q"]',
        value: "r",
        sensitive: false,
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
      { kind: "input", selector: "#note", value: "r", sensitive: false },
    ];
    expect(suggestName(input, HOST)).toBe("Fill a form on example.com");
    expect(suggestName([{ kind: "navigate", url: ORIGIN }], HOST)).toBe(
      "Workflow on example.com"
    );
  });
});
