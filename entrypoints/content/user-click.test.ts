/** One-shot user-click capture: output extraction, arm/disarm, one-shot. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendMessage } from "@/lib/messaging";
import { armUserClick, disarmUserClick, onUserClick } from "./user-click";

vi.mock("@/lib/messaging", () => ({
  sendMessage: vi.fn(() => Promise.resolve()),
}));

const click = (el: Element) => {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  onUserClick({ target: el } as unknown as MouseEvent);
};

// A <td> needs a <table><tr> around it or the parser drops it on assignment.
const mountCell = (text: string): HTMLElement => {
  document.body.innerHTML = `<table><tr><td>${text}</td></tr></table>`;
  return document.querySelector("td") as HTMLElement;
};

describe("user-click capture", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    disarmUserClick();
    vi.mocked(sendMessage).mockClear();
  });

  it("captures trimmed text, then ignores a second click (one-shot)", () => {
    const td = mountCell("some@email.com");
    armUserClick(undefined, "Test flow");

    click(td);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith("userClickDone", {
      output: "some@email.com",
    });

    click(td);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("captures an input's value instead of its text", () => {
    document.body.innerHTML = '<input value="a@b.c">';
    const input = document.querySelector("input") as HTMLInputElement;
    armUserClick(undefined, "Test flow");

    click(input);
    expect(sendMessage).toHaveBeenCalledWith("userClickDone", {
      output: "a@b.c",
    });
  });

  it("sends nothing when not armed", () => {
    const td = mountCell("hello");

    click(td);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("truncates output longer than 500 characters", () => {
    const td = mountCell("x".repeat(600));
    armUserClick(undefined, "Test flow");

    click(td);
    const [, data] = vi.mocked(sendMessage).mock.calls[0] as [
      string,
      { output: string },
    ];
    expect(data.output).toHaveLength(500);
  });

  it("sends nothing when disarmed before the click", () => {
    const td = mountCell("hello");
    armUserClick(undefined, "Test flow");
    disarmUserClick();

    click(td);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
