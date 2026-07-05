import { describe, expect, it } from "vitest";
import { deepQuery, describeElement, findByText, lastTag } from "./selector";

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
    const [, el] = doc.querySelectorAll("input");
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

const shadowHost = (id: string, parent?: ShadowRoot) => {
  const host = document.createElement("div");
  host.id = id;
  (parent ?? document.body).append(host);
  return { host, root: host.attachShadow({ mode: "open" }) };
};

describe("describeElement with shadow DOM", () => {
  it("chains the host selector before the inner selector", () => {
    render("");
    const { root } = shadowHost("host");
    const button = document.createElement("button");
    root.append(button);
    expect(describeElement(button).selector).toBe("#host >>> button");
  });

  it("chains through nested shadow roots", () => {
    render("");
    const { root: outer } = shadowHost("outer");
    const { root: inner } = shadowHost("inner", outer);
    const button = document.createElement("button");
    inner.append(button);
    expect(describeElement(button).selector).toBe(
      "#outer >>> #inner >>> button"
    );
  });

  it("checks uniqueness within the shadow root, not the document", () => {
    render('<input name="q" />');
    const { root } = shadowHost("host");
    const inside = document.createElement("input");
    inside.setAttribute("name", "q");
    root.append(inside);
    expect(describeElement(inside).selector).toBe('#host >>> input[name="q"]');
  });

  it("numbers siblings that are direct children of a shadow root", () => {
    render("");
    const { root } = shadowHost("host");
    const first = document.createElement("button");
    const second = document.createElement("button");
    root.append(first, second);
    expect(describeElement(second).selector).toBe(
      "#host >>> button:nth-of-type(2)"
    );
  });
});

describe("deepQuery", () => {
  it("resolves a plain selector against the document", () => {
    const doc = render('<button id="go">Go</button>');
    expect(deepQuery(doc, "#go")?.id).toBe("go");
  });

  it("resolves a chain through open shadow roots", () => {
    render("");
    const { root } = shadowHost("host");
    const button = document.createElement("button");
    root.append(button);
    expect(deepQuery(document, "#host >>> button")).toBe(button);
  });

  it("returns null when the host has no open shadow root", () => {
    render("");
    const host = document.createElement("div");
    host.id = "host";
    document.body.append(host);
    host.attachShadow({ mode: "closed" });
    expect(deepQuery(document, "#host >>> button")).toBeNull();
  });

  it("returns null on a missing element or invalid selector", () => {
    render("");
    expect(deepQuery(document, "#nope >>> button")).toBeNull();
    expect(deepQuery(document, ">>bad<<")).toBeNull();
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

  it("reads the final segment of a shadow chain", () => {
    expect(lastTag("#host >>> main > a:nth-of-type(2)")).toBe("a");
  });
});
