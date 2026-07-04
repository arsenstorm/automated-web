/**
 * Encrypted vault primitives (WebCrypto AES-GCM, PBKDF2 for password mode).
 * Pure crypto — storage wiring lives in the background script.
 */

import type { VaultEntry } from "./types";

const PBKDF2_ITERATIONS = 600_000;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const AES_PARAMS = { name: "AES-GCM", length: 256 } as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export function randomSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/** Random key for the no-password vault (extractable so it can persist as JWK). */
export function generateRandomKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES_PARAMS, true, ["encrypt", "decrypt"]);
}

export function exportKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

export function importKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, AES_PARAMS, true, [
    "encrypt",
    "decrypt",
  ]);
}

/** Derive the vault key from a user password + stored salt. */
export async function deriveKey(
  password: string,
  saltBase64: string
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(saltBase64),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    AES_PARAMS,
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptValue(
  key: CryptoKey,
  value: string
): Promise<VaultEntry> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(value)
  );
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

/** Throws on wrong key or tampered ciphertext (AES-GCM auth tag). */
export async function decryptValue(
  key: CryptoKey,
  entry: VaultEntry
): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(entry.iv) },
    key,
    fromBase64(entry.data)
  );
  return decoder.decode(plain);
}
