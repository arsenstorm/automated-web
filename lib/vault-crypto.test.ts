import { describe, expect, it } from "vitest";
import {
  decryptValue,
  deriveKey,
  encryptValue,
  exportKey,
  generateRandomKey,
  importKey,
  randomSalt,
} from "./vault-crypto";

describe("vault crypto", () => {
  it("roundtrips a value with a random key", async () => {
    const key = await generateRandomKey();
    const entry = await encryptValue(key, "hunter2");
    expect(entry.data).not.toContain("hunter2");
    expect(await decryptValue(key, entry)).toBe("hunter2");
  });

  it("survives key export/import (JWK persistence)", async () => {
    const key = await generateRandomKey();
    const entry = await encryptValue(key, "secret");
    const restored = await importKey(await exportKey(key));
    expect(await decryptValue(restored, entry)).toBe("secret");
  });

  it("derives the same key from the same password + salt", async () => {
    const salt = randomSalt();
    const entry = await encryptValue(await deriveKey("pw", salt), "value");
    expect(await decryptValue(await deriveKey("pw", salt), entry)).toBe(
      "value"
    );
  });

  it("rejects a wrong password", async () => {
    const salt = randomSalt();
    const entry = await encryptValue(await deriveKey("right", salt), "value");
    await expect(
      decryptValue(await deriveKey("wrong", salt), entry)
    ).rejects.toThrow();
  });

  it("rejects tampered ciphertext (GCM auth tag)", async () => {
    const key = await generateRandomKey();
    const entry = await encryptValue(key, "value");
    const bytes = Uint8Array.from(atob(entry.data), (c) => c.charCodeAt(0));
    bytes[0] = bytes[0] === undefined ? 0 : (bytes[0] + 1) % 256;
    const tampered = {
      iv: entry.iv,
      data: btoa(String.fromCharCode(...bytes)),
    };
    await expect(decryptValue(key, tampered)).rejects.toThrow();
  });
});
