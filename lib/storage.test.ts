import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { getStored, setStored } from "./storage";
import { DEFAULT_SETTINGS } from "./types";

describe("storage", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("falls back to defaults when unset", async () => {
    expect(await getStored("settings")).toEqual(DEFAULT_SETTINGS);
    expect(await getStored("suppressed")).toEqual([]);
    expect(await getStored("run")).toBeNull();
  });

  it("round-trips values", async () => {
    await setStored("suppressed", ["abc"]);
    expect(await getStored("suppressed")).toEqual(["abc"]);
  });

  it("hands out fresh defaults, not a shared reference", async () => {
    const first = await getStored("suppressed");
    first.push("polluted");
    expect(await getStored("suppressed")).toEqual([]);
  });
});
