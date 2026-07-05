/** Secrets never leave the page: redacted at capture, paused at replay. */

import { beforeEach, describe, expect, it } from "vitest";
import { onMessage } from "@/lib/messaging";
import type { RecordedEvent } from "@/lib/types";
import { executeStep } from "./executor";
import { flush, onChange, setRecordSecrets } from "./recorder";

// One listener per JS context is the messaging library's rule, so it lives
// at module scope and each flushed() call reads what the last flush sent.
let received: RecordedEvent[] = [];
onMessage("recordEvents", ({ data }) => {
  received = data;
});

describe("recorder redaction", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    setRecordSecrets(false);
  });

  const changeValue = (html: string, value: string) => {
    document.body.innerHTML = html;
    const el = document.querySelector("input") as HTMLInputElement;
    el.value = value;
    onChange({ target: el } as unknown as Event);
  };

  const flushed = async (): Promise<RecordedEvent[]> => {
    received = [];
    await flush();
    return received;
  };

  it("drops password values but keeps the step", async () => {
    changeValue('<input name="pw" type="password">', "hunter2");
    const [event] = await flushed();
    expect(event?.action).toMatchObject({
      kind: "input",
      value: "",
      sensitive: true,
    });
  });

  it("redacts by autocomplete (cc-number) too", async () => {
    changeValue('<input autocomplete="cc-number" name="card">', "4111");
    const [event] = await flushed();
    expect(event?.action).toMatchObject({ value: "", sensitive: true });
  });

  it("stores secret values when the user opts in", async () => {
    setRecordSecrets(true);
    changeValue('<input name="pw" type="password">', "hunter2");
    const [event] = await flushed();
    expect(event?.action).toMatchObject({ value: "hunter2", sensitive: true });
  });

  it("keeps ordinary input values", async () => {
    changeValue('<input name="email" type="email">', "a@b.c");
    const [event] = await flushed();
    expect(event?.action).toMatchObject({ value: "a@b.c", sensitive: false });
  });
});

describe("executor secret pause", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("focuses the field and pauses instead of typing", async () => {
    document.body.innerHTML = '<input name="pw" type="password">';
    const el = document.querySelector("input") as HTMLInputElement;
    const result = await executeStep({
      kind: "input",
      selector: 'input[name="pw"]',
      value: "",
      sensitive: true,
    });
    expect(result).toMatchObject({ ok: false, reason: "secret" });
    expect(el.value).toBe("");
    expect(document.activeElement).toBe(el);
  });

  it("types a stored secret when one was recorded under opt-in", async () => {
    document.body.innerHTML = '<input name="pw" type="password">';
    const el = document.querySelector("input") as HTMLInputElement;
    const result = await executeStep({
      kind: "input",
      selector: 'input[name="pw"]',
      value: "hunter2",
      sensitive: true,
    });
    expect(result).toEqual({ ok: true });
    expect(el.value).toBe("hunter2");
  });

  it("still types non-sensitive values", async () => {
    document.body.innerHTML = '<input name="email">';
    const el = document.querySelector("input") as HTMLInputElement;
    const result = await executeStep({
      kind: "input",
      selector: 'input[name="email"]',
      value: "a@b.c",
      sensitive: false,
    });
    expect(result).toEqual({ ok: true });
    expect(el.value).toBe("a@b.c");
  });
});
