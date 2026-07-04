/** Typed access to `browser.storage.local` for extension contexts. */

import { DEFAULT_SETTINGS, type StorageShape } from "./types";

const DEFAULTS: StorageShape = {
  events: null,
  onboarded: false,
  patterns: null,
  recording: null,
  suppressed: [],
  workflows: null,
  run: null,
  vaultMeta: {},
  settings: DEFAULT_SETTINGS,
};

export async function getStored<K extends keyof StorageShape>(
  key: K
): Promise<StorageShape[K]> {
  const result = await browser.storage.local.get(key);
  // Clone so callers mutating a default can't pollute later reads.
  return (
    (result[key] as StorageShape[K] | undefined) ??
    structuredClone(DEFAULTS[key])
  );
}

export function setStored<K extends keyof StorageShape>(
  key: K,
  value: StorageShape[K]
): Promise<void> {
  return browser.storage.local.set({ [key]: value });
}
