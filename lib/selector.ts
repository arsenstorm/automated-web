/**
 * Robust selector generation for recorded elements. Pure DOM logic —
 * unit-testable in happy-dom.
 */

export interface ElementDescriptor {
  selector: string;
  text?: string;
}

/** React/Ember-style auto-generated ids (`:r1:`, `ember123`, `foo__bar-4821`). */
const MACHINE_ID = /\d{3,}|^:|__/;
const MAX_TEXT_LENGTH = 40;
const MAX_PATH_DEPTH = 3;

/** Inside a quoted attribute selector only quotes and backslashes need escaping. */
const escapeQuoted = (value: string): string => value.replace(/["\\]/g, "\\$&");

const isUnique = (doc: Document, selector: string): boolean => {
  try {
    return doc.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
};

const attributeCandidates = (el: Element): string[] => {
  const candidates: string[] = [];
  const { id } = el;
  if (id && !MACHINE_ID.test(id)) {
    candidates.push(`#${CSS.escape(id)}`);
  }
  const testId = el.getAttribute("data-testid");
  if (testId) {
    candidates.push(`[data-testid="${escapeQuoted(testId)}"]`);
  }
  const href = el.getAttribute("href");
  if (
    el.tagName === "A" &&
    href &&
    href !== "#" &&
    !href.startsWith("javascript:")
  ) {
    candidates.push(`a[href="${escapeQuoted(href)}"]`);
  }
  const name = el.getAttribute("name");
  if (name) {
    candidates.push(
      `${el.tagName.toLowerCase()}[name="${escapeQuoted(name)}"]`
    );
  }
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    candidates.push(`[aria-label="${escapeQuoted(ariaLabel)}"]`);
  }
  return candidates;
};

const nthOfTypeSegment = (el: Element): string => {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) {
    return tag;
  }
  const siblings = Array.from(parent.children).filter(
    (child) => child.tagName === el.tagName
  );
  if (siblings.length === 1) {
    return tag;
  }
  return `${tag}:nth-of-type(${siblings.indexOf(el) + 1})`;
};

const cssPath = (el: Element): string => {
  const segments: string[] = [];
  let current: Element | null = el;
  while (current && current !== el.ownerDocument.documentElement) {
    segments.unshift(nthOfTypeSegment(current));
    if (segments.length > MAX_PATH_DEPTH) {
      break;
    }
    current = current.parentElement;
  }
  return segments.join(" > ");
};

export const trimmedText = (el: Element): string | undefined => {
  const text = el.textContent?.trim().replace(/\s+/g, " ");
  if (!text) {
    return;
  }
  return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
};

const TAG_START = /^[a-z][\w-]*/i;

/** Tag name of a selector's final segment ("main > p:nth-of-type(7) > a" → "a"). */
export const lastTag = (selector: string): string =>
  selector.split(">").pop()?.trim().match(TAG_START)?.[0].toLowerCase() ?? "";

/** The single element of `tag` whose trimmed text equals `text`, else null. */
export function findByText(
  doc: Document,
  tag: string,
  text: string
): Element | null {
  if (!tag) {
    return null;
  }
  const matches = Array.from(doc.querySelectorAll(tag)).filter(
    (el) => trimmedText(el) === text
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/**
 * Describe an element with the most stable unique selector available:
 * id → data-testid → name → aria-label → short nth-of-type CSS path.
 */
export function describeElement(el: Element): ElementDescriptor {
  const doc = el.ownerDocument;
  for (const candidate of attributeCandidates(el)) {
    if (isUnique(doc, candidate)) {
      return { selector: candidate, text: trimmedText(el) };
    }
  }
  return { selector: cssPath(el), text: trimmedText(el) };
}
