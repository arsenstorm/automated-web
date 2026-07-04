/** Vault key management and value encryption, bound to extension storage. */

import type { VaultStatus } from "@/lib/messaging";
import { getStored, setStored } from "@/lib/storage";
import type { VaultEntry } from "@/lib/types";
import {
  decryptValue,
  deriveKey,
  encryptValue,
  exportKey,
  generateRandomKey,
  importKey,
  randomSalt,
} from "@/lib/vault";

const SESSION_KEY = "vaultKeyJwk";
/** Sentinel entry used to verify a vault password. */
const CHECK_REF = "__check";
const CHECK_VALUE = "ok";

const sessionKeyJwk = async (): Promise<JsonWebKey | null> => {
  const stored = await browser.storage.session.get(SESSION_KEY);
  return (stored[SESSION_KEY] as JsonWebKey | undefined) ?? null;
};

/** Resolves the active vault key, creating a random one on first use. */
const getVaultKey = async (): Promise<CryptoKey | null> => {
  const meta = await getStored("vaultMeta");
  if (meta.salt) {
    const jwk = await sessionKeyJwk();
    return jwk ? await importKey(jwk) : null;
  }
  if (meta.rawKeyJwk) {
    return await importKey(meta.rawKeyJwk);
  }
  const key = await generateRandomKey();
  await setStored("vaultMeta", { rawKeyJwk: await exportKey(key) });
  return key;
};

export const storeValue = async (value: string): Promise<string | null> => {
  const key = await getVaultKey();
  if (!key) {
    return null;
  }
  const vault = await getStored("vault");
  const ref = crypto.randomUUID();
  vault[ref] = await encryptValue(key, value);
  await setStored("vault", vault);
  return ref;
};

export const decryptRef = async (ref: string): Promise<string | null> => {
  if (!ref) {
    return null;
  }
  const [key, vault] = await Promise.all([getVaultKey(), getStored("vault")]);
  const entry = vault[ref];
  if (!(key && entry)) {
    return null;
  }
  try {
    return await decryptValue(key, entry);
  } catch {
    return null;
  }
};

export const vaultStatus = async (): Promise<VaultStatus> => {
  const meta = await getStored("vaultMeta");
  if (!meta.salt) {
    return "no-password";
  }
  return (await sessionKeyJwk()) ? "open" : "locked";
};

/**
 * While locked the extension is dormant: no recording, no mining/toasts, no
 * new runs. Everything wakes up when the password is entered.
 */
export const vaultLocked = async (): Promise<boolean> =>
  (await vaultStatus()) === "locked";

export const lockVault = async (): Promise<void> => {
  await browser.storage.session.remove(SESSION_KEY);
};

/**
 * Forgot-password escape hatch: the password is unrecoverable, so wipe the
 * vault and everything encrypted with it. Suggestions/settings survive.
 */
export const resetVault = async (): Promise<void> => {
  await browser.storage.session.remove(SESSION_KEY);
  await browser.storage.local.remove([
    "events",
    "onboarded",
    "patterns",
    "recording",
    "run",
    "vault",
    "vaultMeta",
    "workflows",
  ]);
};

export const unlockVault = async (password: string): Promise<boolean> => {
  const meta = await getStored("vaultMeta");
  if (!meta.salt) {
    return false;
  }
  const key = await deriveKey(password, meta.salt);
  const vault = await getStored("vault");
  const check = vault[CHECK_REF];
  try {
    if (!check || (await decryptValue(key, check)) !== CHECK_VALUE) {
      return false;
    }
  } catch {
    return false;
  }
  await browser.storage.session.set({ [SESSION_KEY]: await exportKey(key) });
  return true;
};

const reencryptVault = async (
  oldKey: CryptoKey,
  newKey: CryptoKey,
  vault: Record<string, VaultEntry>
): Promise<Record<string, VaultEntry>> => {
  const next: Record<string, VaultEntry> = {};
  for (const [ref, entry] of Object.entries(vault)) {
    next[ref] = await encryptValue(newKey, await decryptValue(oldKey, entry));
  }
  return next;
};

export const setVaultPassword = async (password: string): Promise<void> => {
  const oldKey = await getVaultKey();
  if (!oldKey) {
    throw new Error("Unlock the vault before changing its password");
  }
  const salt = randomSalt();
  const newKey = await deriveKey(password, salt);
  const vault = await reencryptVault(oldKey, newKey, await getStored("vault"));
  vault[CHECK_REF] = await encryptValue(newKey, CHECK_VALUE);
  await setStored("vault", vault);
  await setStored("vaultMeta", { salt });
  await browser.storage.session.set({
    [SESSION_KEY]: await exportKey(newKey),
  });
};
