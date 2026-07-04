/** Typed access to `browser.storage.local` for extension contexts. */

import { DEFAULT_SETTINGS, type StorageShape } from "./types";

const DEFAULTS: StorageShape = {
  events: [],
  onboarded: false,
  patterns: {},
  recording: null,
  suppressed: [],
  workflows: [],
  run: null,
  vault: {},
  vaultMeta: {},
  settings: DEFAULT_SETTINGS,
};

export async function getStored<K extends keyof StorageShape>(
  key: K
): Promise<StorageShape[K]> {
  const result = await browser.storage.local.get(key);
  return (result[key] as StorageShape[K] | undefined) ?? DEFAULTS[key];
}

export function setStored<K extends keyof StorageShape>(
  key: K,
  value: StorageShape[K]
): Promise<void> {
  return browser.storage.local.set({ [key]: value });
}
