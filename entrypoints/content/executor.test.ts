/** Pins the click text-rescue and extract behaviors of executeStep. */

import { beforeEach, describe, expect, it } from "vitest";
import { executeStep } from "./executor";

describe("executeStep", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("rescues a positionally-drifted click via unique text match", async () => {
    document.body.innerHTML = "<button>Cancel</button><button>Buy now</button>";
    const [cancelBtn, buyBtn] = document.querySelectorAll("button");
    let cancelClicked = false;
    let buyClicked = false;
    cancelBtn?.addEventListener("click", () => {
      cancelClicked = true;
    });
    buyBtn?.addEventListener("click", () => {
      buyClicked = true;
    });

    const result = await executeStep({
      kind: "click",
      selector: "button:nth-of-type(1)",
      text: "Buy now",
    });

    expect(result).toMatchObject({ ok: true });
    expect(buyClicked).toBe(true);
    expect(cancelClicked).toBe(false);
  });

  it("pauses instead of guessing when the text rescue is ambiguous", async () => {
    document.body.innerHTML =
      "<button>Cancel</button><button>Buy now</button><button>Buy now</button>";
    let anyClicked = false;
    for (const button of document.querySelectorAll("button")) {
      button.addEventListener("click", () => {
        anyClicked = true;
      });
    }

    const result = await executeStep({
      kind: "click",
      selector: "button:nth-of-type(1)",
      text: "Buy now",
    });

    expect(result).toMatchObject({
      detail: "button:nth-of-type(1)",
      ok: false,
      reason: "timeout",
    });
    expect(anyClicked).toBe(false);
  });

  it("short-circuits on a captcha without clicking", async () => {
    document.body.innerHTML =
      '<div class="g-recaptcha"></div><button>Go</button>';
    const button = document.querySelector("button");
    let clicked = false;
    button?.addEventListener("click", () => {
      clicked = true;
    });

    const result = await executeStep({
      kind: "click",
      selector: "button",
      text: "Go",
    });

    expect(result).toEqual({ ok: false, reason: "captcha" });
    expect(clicked).toBe(false);
  });

  it("extracts an input's value", async () => {
    document.body.innerHTML = "<input>";
    const input = document.querySelector("input") as HTMLInputElement;
    input.value = "ORDER-1";

    const result = await executeStep({ kind: "extract", selector: "input" });

    expect(result).toEqual({ ok: true, output: "ORDER-1" });
  });

  it("extracts an element's text, trimmed and whitespace-collapsed", async () => {
    document.body.innerHTML = "<span>  ORDER   2  </span>";

    const result = await executeStep({ kind: "extract", selector: "span" });

    expect(result).toEqual({ ok: true, output: "ORDER 2" });
  });

  it("treats background-only step kinds as no-ops", async () => {
    const result = await executeStep({ kind: "pause" });

    expect(result).toEqual({ ok: true });
  });
});
