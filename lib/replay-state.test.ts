import { describe, expect, it } from "vitest";
import {
  afterStep,
  hasCaptcha,
  healedStepIndex,
  pausedRun,
  pickTabForUrl,
  resumedRun,
  startedRun,
} from "./replay-state";
import type { StepAction } from "./types";

describe("run-state transitions", () => {
  it("advances through steps and finishes", () => {
    let run = startedRun("wf-1", 7);
    expect(run.status).toBe("running");
    run = afterStep(run, { ok: true }, 2);
    expect(run.stepIndex).toBe(1);
    expect(run.status).toBe("running");
    run = afterStep(run, { ok: true }, 2);
    expect(run.status).toBe("done");
  });

  it("pauses with the failure reason and resumes at the same step", () => {
    let run = startedRun("wf-1", 7);
    run = afterStep(run, { detail: "#login", ok: false, reason: "timeout" }, 3);
    expect(run.status).toBe("paused");
    expect(run.stepIndex).toBe(0);
    expect(run.pausedReason).toBe("timeout: #login");
    run = resumedRun(run);
    expect(run.status).toBe("running");
    expect(run.pausedReason).toBeUndefined();
  });

  it("pauses with an arbitrary reason (vault locked, interrupted)", () => {
    const run = pausedRun(startedRun("wf-1", 7), "vault locked");
    expect(run.status).toBe("paused");
    expect(run.pausedReason).toBe("vault locked");
  });
});

describe("healedStepIndex", () => {
  const PASSWORD: StepAction = {
    kind: "input",
    selector: "#password",
    sensitive: true,
    value: "",
  };
  const SUBMIT: StepAction = { kind: "submit", selector: "form" };
  const NAV: StepAction = {
    kind: "navigate",
    url: "https://example.com/dashboard",
  };
  const CLICK: StepAction = { kind: "click", selector: "#report" };
  const STEPS: StepAction[] = [PASSWORD, SUBMIT, NAV, CLICK];

  it("skips steps the user performed by hand while paused", () => {
    // Paused on the password step; the user typed it and submitted the form.
    const actions: { action: StepAction; tab: number }[] = [
      { action: { ...PASSWORD, value: "" }, tab: 0 },
      { action: SUBMIT, tab: 0 },
      {
        action: {
          kind: "navigate",
          url: "https://example.com/dashboard?session=1",
        },
        tab: 0,
      },
    ];
    expect(healedStepIndex(0, STEPS, actions)).toBe(3);
  });

  it("ignores unrelated actions between matching ones", () => {
    const actions: { action: StepAction; tab: number }[] = [
      { action: { kind: "click", selector: "#cookie-banner" }, tab: 0 },
      { action: { ...PASSWORD, value: "" }, tab: 0 },
      { action: SUBMIT, tab: 0 },
    ];
    expect(healedStepIndex(0, STEPS, actions)).toBe(2);
  });

  it("stays put when the user did nothing matching", () => {
    expect(healedStepIndex(0, STEPS, [])).toBe(0);
    expect(
      healedStepIndex(0, STEPS, [
        { action: { kind: "click", selector: "#other" }, tab: 0 },
      ])
    ).toBe(0);
  });

  it("stops at steps a user cannot perform", () => {
    const steps: StepAction[] = [SUBMIT, { kind: "sleep", ms: 100 }, CLICK];
    expect(
      healedStepIndex(0, steps, [
        { action: SUBMIT, tab: 0 },
        { action: CLICK, tab: 0 },
      ])
    ).toBe(1);
  });

  it("stops at a user-click step", () => {
    const steps: StepAction[] = [SUBMIT, { kind: "user-click" }, CLICK];
    expect(
      healedStepIndex(0, steps, [
        { action: SUBMIT, tab: 0 },
        { action: CLICK, tab: 0 },
      ])
    ).toBe(1);
  });

  it("does not match a step on a different tab", () => {
    const steps: StepAction[] = [{ ...CLICK, tab: 1 }];
    expect(healedStepIndex(0, steps, [{ action: CLICK, tab: 0 }])).toBe(0);
    expect(healedStepIndex(0, steps, [{ action: CLICK, tab: 1 }])).toBe(1);
  });
});

describe("pickTabForUrl", () => {
  const URL_A = "https://example.com/dashboard";

  it("prefers an exact URL match over a same-origin match", () => {
    const candidates = [
      { id: 1, url: "https://example.com/other" },
      { id: 2, url: URL_A },
    ];
    expect(pickTabForUrl(candidates, URL_A, [])).toEqual({
      exact: true,
      id: 2,
    });
  });

  it("falls back to a same-origin match", () => {
    const candidates = [{ id: 1, url: "https://example.com/other" }];
    expect(pickTabForUrl(candidates, URL_A, [])).toEqual({
      exact: false,
      id: 1,
    });
  });

  it("skips excluded tab ids", () => {
    const candidates = [{ id: 2, url: URL_A }];
    expect(pickTabForUrl(candidates, URL_A, [2])).toBeNull();
  });

  it("matches a still-loading tab via pendingUrl", () => {
    const candidates = [{ id: 3, pendingUrl: URL_A }];
    expect(pickTabForUrl(candidates, URL_A, [])).toEqual({
      exact: true,
      id: 3,
    });
  });

  it("falls through an empty url to pendingUrl", () => {
    // Chrome reports url "" on a just-spawned tab, with the target pending.
    const candidates = [{ id: 3, pendingUrl: URL_A, url: "" }];
    expect(pickTabForUrl(candidates, URL_A, [])).toEqual({
      exact: true,
      id: 3,
    });
  });

  it("returns null when nothing matches", () => {
    const candidates = [{ id: 1, url: "https://other.com/page" }];
    expect(pickTabForUrl(candidates, URL_A, [])).toBeNull();
  });

  it("returns null for an unparseable url, even with eligible candidates", () => {
    const candidates = [{ id: 1, url: URL_A }];
    expect(pickTabForUrl(candidates, "not a url", [])).toBeNull();
  });
});

describe("hasCaptcha", () => {
  // Detached document: happy-dom would fetch real iframe URLs in the live one.
  const render = (html: string): Document => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = html;
    return doc;
  };

  it("detects captcha container elements", () => {
    expect(hasCaptcha(render('<div class="g-recaptcha"></div>'))).toBe(true);
  });

  it("detects known captcha iframes", () => {
    const doc = render(
      '<iframe src="https://challenges.cloudflare.com/turnstile/v0/x"></iframe>'
    );
    const iframe = doc.querySelector("iframe");
    if (iframe) {
      // happy-dom reports zero rects; stub a visible one
      iframe.getBoundingClientRect = () => ({ height: 80 }) as DOMRect;
    }
    expect(hasCaptcha(doc)).toBe(true);
  });

  it("returns false on a captcha-free page", () => {
    expect(hasCaptcha(render("<form><input /></form>"))).toBe(false);
  });
});
