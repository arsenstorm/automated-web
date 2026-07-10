/**
 * Vault contract: locked means dormant (reads default to empty, writes
 * throw) and secure data is never stored as plaintext.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { getStored } from "@/lib/storage";
import type { Workflow } from "@/lib/types";
import {
  getSecure,
  lockVault,
  resetVault,
  setSecure,
  setVaultPassword,
  unlockVault,
  vaultStatus,
} from "./vault";

const PASSWORD = "correct horse battery staple";

const WORKFLOW: Workflow = {
  createdAt: 0,
  fingerprint: "fp",
  id: "w1",
  name: "Workflow",
  origin: "https://example.com",
  steps: [{ kind: "navigate", url: "https://example.com/" }],
};

beforeEach(() => {
  fakeBrowser.reset();
});

it("round-trips a value under an auto-created key", async () => {
  await setSecure("workflows", [WORKFLOW]);
  expect(await getSecure("workflows")).toEqual([WORKFLOW]);
  const meta = await getStored("vaultMeta");
  expect(meta.rawKeyJwk).toBeDefined();
});

it("re-encrypts existing data when a password is set", async () => {
  await setSecure("workflows", [WORKFLOW]);
  await setVaultPassword(PASSWORD);
  expect(await getSecure("workflows")).toEqual([WORKFLOW]);
  await lockVault();
  expect(await getSecure("workflows")).toEqual([]);
});

it("resetVault wipes the vault back to no-password", async () => {
  await setVaultPassword(PASSWORD);
  await setSecure("workflows", [WORKFLOW]);
  await resetVault();
  expect(await vaultStatus()).toBe("no-password");
  expect(await getSecure("workflows")).toEqual([]);
});

describe("while locked", () => {
  beforeEach(async () => {
    await setVaultPassword(PASSWORD);
    await setSecure("workflows", [WORKFLOW]);
    await lockVault();
  });

  it("returns defaults on read", async () => {
    expect(await getSecure("workflows")).toEqual([]);
    expect(await vaultStatus()).toBe("locked");
  });

  it("throws on write instead of storing plaintext", async () => {
    await expect(setSecure("workflows", [WORKFLOW])).rejects.toThrow(
      "Vault is locked"
    );
  });

  it("rejects the wrong password and accepts the right one", async () => {
    expect(await unlockVault("wrong password")).toBe(false);
    expect(await vaultStatus()).toBe("locked");
    expect(await unlockVault(PASSWORD)).toBe(true);
    expect(await getSecure("workflows")).toEqual([WORKFLOW]);
  });
});
