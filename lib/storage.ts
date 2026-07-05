/**
 * Typed access to `browser.storage.local` for extension contexts, built on
 * wxt/storage items so schema changes get explicit versions + migrations
 * instead of relying on new fields happening to read back as falsy.
 */

import { storage, type WxtStorageItem } from "wxt/utils/storage";
import { DEFAULT_SETTINGS, type Settings, type StorageShape } from "./types";

type StorageItems = {
  [K in keyof StorageShape]: WxtStorageItem<
    StorageShape[K],
    Record<string, unknown>
  >;
};

const items: StorageItems = {
  events: storage.defineItem("local:events", { fallback: null }),
  onboarded: storage.defineItem("local:onboarded", { fallback: false }),
  patterns: storage.defineItem("local:patterns", { fallback: null }),
  recording: storage.defineItem("local:recording", { fallback: null }),
  run: storage.defineItem("local:run", { fallback: null }),
  settings: storage.defineItem("local:settings", {
    fallback: DEFAULT_SETTINGS,
    migrations: {
      // v1 predates recordSecrets; fill any missing fields with defaults.
      2: (old: Partial<Settings>): Settings => ({
        ...DEFAULT_SETTINGS,
        ...old,
      }),
    },
    version: 2,
  }),
  suppressed: storage.defineItem("local:suppressed", { fallback: [] }),
  vaultMeta: storage.defineItem("local:vaultMeta", { fallback: {} }),
  workflows: storage.defineItem("local:workflows", { fallback: null }),
};

export async function getStored<K extends keyof StorageShape>(
  key: K
): Promise<StorageShape[K]> {
  // Clone so callers mutating a fallback can't pollute later reads.
  return structuredClone(await items[key].getValue());
}

export function setStored<K extends keyof StorageShape>(
  key: K,
  value: StorageShape[K]
): Promise<void> {
  return items[key].setValue(value);
}
