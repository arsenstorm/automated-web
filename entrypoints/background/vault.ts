/** Vault key management and encrypted-at-rest storage for recorded data. */

import type { VaultStatus } from "@/lib/messaging";
import { getStored, setStored } from "@/lib/storage";
import type { CandidatePattern, RecordedEvent, Workflow } from "@/lib/types";
import {
  decryptValue,
  deriveKey,
  encryptValue,
  exportKey,
  generateRandomKey,
  importKey,
  randomSalt,
} from "@/lib/vault-crypto";

const SESSION_KEY = "vaultKeyJwk";
/** Plaintext behind `vaultMeta.check`, used to verify a vault password. */
const CHECK_VALUE = "ok";

/** Everything the user records is encrypted at rest under these keys. */
interface SecureShape {
  events: RecordedEvent[];
  patterns: Record<string, CandidatePattern>;
  workflows: Workflow[];
}

const SECURE_KEYS = ["events", "patterns", "workflows"] as const;
const SECURE_DEFAULTS: SecureShape = {
  events: [],
  patterns: {},
  workflows: [],
};

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

/** Decrypted read; defaults when the key is absent (locked) or unreadable. */
export const getSecure = async <K extends keyof SecureShape>(
  key: K
): Promise<SecureShape[K]> => {
  const [vaultKey, entry] = await Promise.all([getVaultKey(), getStored(key)]);
  if (!(vaultKey && entry)) {
    return structuredClone(SECURE_DEFAULTS[key]);
  }
  try {
    return JSON.parse(await decryptValue(vaultKey, entry)) as SecureShape[K];
  } catch {
    return structuredClone(SECURE_DEFAULTS[key]);
  }
};

/** Encrypted write; throws while locked rather than storing plaintext. */
export const setSecure = async <K extends keyof SecureShape>(
  key: K,
  value: SecureShape[K]
): Promise<void> => {
  const vaultKey = await getVaultKey();
  if (!vaultKey) {
    throw new Error("Vault is locked");
  }
  await setStored(key, await encryptValue(vaultKey, JSON.stringify(value)));
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
  if (!(meta.salt && meta.check)) {
    return false;
  }
  const key = await deriveKey(password, meta.salt);
  try {
    if ((await decryptValue(key, meta.check)) !== CHECK_VALUE) {
      return false;
    }
  } catch {
    return false;
  }
  await browser.storage.session.set({ [SESSION_KEY]: await exportKey(key) });
  return true;
};

export const setVaultPassword = async (password: string): Promise<void> => {
  const oldKey = await getVaultKey();
  if (!oldKey) {
    throw new Error("Unlock the vault before changing its password");
  }
  const salt = randomSalt();
  const newKey = await deriveKey(password, salt);
  const write: Record<string, unknown> = {
    vaultMeta: { salt, check: await encryptValue(newKey, CHECK_VALUE) },
  };
  for (const key of SECURE_KEYS) {
    write[key] = await encryptValue(
      newKey,
      JSON.stringify(await getSecure(key))
    );
  }
  // Single write: a crash can't leave data encrypted under an unsaved key.
  await browser.storage.local.set(write);
  await browser.storage.session.set({ [SESSION_KEY]: await exportKey(newKey) });
};
