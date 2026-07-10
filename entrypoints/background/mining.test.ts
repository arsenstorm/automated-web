/** Pins the suggestion lifecycle (save/dismiss/suppress) and the locked-vault no-op. */

import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { getStored } from "@/lib/storage";
import type { CandidatePattern, RecordedEvent } from "@/lib/types";
import { dismissSuggestion, runMiner, saveSuggestion } from "./mining";
import {
  getSecure,
  lockVault,
  setSecure,
  setVaultPassword,
  unlockVault,
} from "./vault";

const ORIGIN = "https://example.com";

const PATTERN: CandidatePattern = {
  count: 3,
  fingerprint: "fp1",
  lastSeen: 0,
  origin: ORIGIN,
  steps: [
    { kind: "navigate", url: `${ORIGIN}/start` },
    { kind: "click", selector: "#go", text: "Go" },
  ],
};

describe("saveSuggestion", () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await setSecure("patterns", { fp1: PATTERN });
  });

  it("promotes the pattern to a workflow and suppresses re-suggesting it", async () => {
    await saveSuggestion("fp1");

    const workflows = await getSecure("workflows");
    expect(workflows).toHaveLength(1);
    expect(workflows[0]).toMatchObject({ fingerprint: "fp1" });

    const patterns = await getSecure("patterns");
    expect(patterns.fp1).toBeUndefined();

    const suppressed = await getStored("suppressed");
    expect(suppressed).toContain("fp1");
  });

  it("is a no-op for an unknown fingerprint", async () => {
    await saveSuggestion("nope");

    expect(await getSecure("workflows")).toEqual([]);
    expect(await getStored("suppressed")).toEqual([]);
    expect(await getSecure("patterns")).toEqual({ fp1: PATTERN });
  });
});

describe("dismissSuggestion", () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await setSecure("patterns", { fp1: PATTERN });
  });

  it("suppresses just the fingerprint when never is false", async () => {
    await dismissSuggestion("fp1", false);

    const suppressed = await getStored("suppressed");
    expect(suppressed).toContain("fp1");

    const patterns = await getSecure("patterns");
    expect(patterns.fp1).toBeUndefined();
  });

  it("suppresses the whole origin when never is true", async () => {
    await dismissSuggestion("fp1", true);

    const suppressed = await getStored("suppressed");
    expect(suppressed).toContain(`never:${ORIGIN}`);

    const patterns = await getSecure("patterns");
    expect(patterns.fp1).toBeUndefined();
  });
});

describe("runMiner while locked", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("is dormant: it touches nothing while the vault is locked", async () => {
    const events: RecordedEvent[] = [
      {
        action: { kind: "navigate", url: `${ORIGIN}/start` },
        origin: ORIGIN,
        ts: 0,
      },
    ];
    // Order matters: a password + key must exist before writes, then the
    // vault is locked so runMiner has nothing readable to act on.
    await setVaultPassword("pw");
    await setSecure("events", events);
    await lockVault();

    await runMiner();

    await unlockVault("pw");
    expect(await getSecure("events")).toEqual(events);
    expect(await getSecure("patterns")).toEqual({});
  });
});
