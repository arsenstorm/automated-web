import { describe, expect, it } from "vitest";
import { describeElement, findByText, lastTag } from "./selector";

const render = (html: string): Document => {
  document.body.innerHTML = html;
  return document;
};

describe("describeElement", () => {
  it("prefers a unique human-looking id", () => {
    const doc = render('<button id="login-submit">Log in</button>');
    const el = doc.querySelector("button");
    expect(el).not.toBeNull();
    expect(describeElement(el as Element).selector).toBe("#login-submit");
  });

  it("rejects machine-generated ids", () => {
    const doc = render(
      '<button id="ember12345" data-testid="submit">Go</button>'
    );
    const el = doc.querySelector("button");
    expect(describeElement(el as Element).selector).toBe(
      '[data-testid="submit"]'
    );
  });

  it("uses tag[name] for form fields", () => {
    const doc = render('<form><input name="username" type="text" /></form>');
    const el = doc.querySelector("input");
    expect(describeElement(el as Element).selector).toBe(
      'input[name="username"]'
    );
  });

  it("uses aria-label when nothing better exists", () => {
    const doc = render('<button aria-label="Close dialog">×</button>');
    const el = doc.querySelector("button");
    expect(describeElement(el as Element).selector).toBe(
      '[aria-label="Close dialog"]'
    );
  });

  it("falls back to a short nth-of-type path", () => {
    const doc = render(
      "<div><ul><li>a</li><li><button>Pick me</button></li></ul></div>"
    );
    const el = doc.querySelector("button");
    const { selector, text } = describeElement(el as Element);
    expect(doc.querySelectorAll(selector).length).toBe(1);
    expect(doc.querySelector(selector)).toBe(el);
    expect(text).toBe("Pick me");
  });

  it("skips non-unique attribute selectors", () => {
    const doc = render(
      '<div><input name="q" /><section><input name="q" /></section></div>'
    );
    const el = doc.querySelectorAll("input")[1];
    const { selector } = describeElement(el as Element);
    expect(doc.querySelectorAll(selector).length).toBe(1);
    expect(doc.querySelector(selector)).toBe(el);
  });

  it("truncates long text", () => {
    const doc = render(`<button>${"x".repeat(100)}</button>`);
    const el = doc.querySelector("button");
    expect(describeElement(el as Element).text?.length).toBe(40);
  });

  it("uses href for links instead of a positional path", () => {
    const doc = render(
      '<main><p><a href="/logout">Log out</a></p><p><a href="#">skip</a></p></main>'
    );
    const el = doc.querySelector('a[href="/logout"]');
    expect(describeElement(el as Element).selector).toBe('a[href="/logout"]');
  });
});

describe("findByText", () => {
  it("rescues a moved element by its unique text", () => {
    const doc = render(
      "<main><p><a href='/a'>Alpha</a></p><p><a href='/b'>Beta</a></p></main>"
    );
    const el = findByText(doc, "a", "Beta");
    expect(el?.getAttribute("href")).toBe("/b");
  });

  it("returns null when the text is ambiguous or absent", () => {
    const doc = render("<p><a href='/a'>Same</a><a href='/b'>Same</a></p>");
    expect(findByText(doc, "a", "Same")).toBeNull();
    expect(findByText(doc, "a", "Missing")).toBeNull();
    expect(findByText(doc, "", "Same")).toBeNull();
  });
});

describe("lastTag", () => {
  it("extracts the final segment's tag", () => {
    expect(lastTag("main > p:nth-of-type(77) > a")).toBe("a");
    expect(lastTag('a[href="/x"]')).toBe("a");
    expect(lastTag("#login-submit")).toBe("");
  });
});
