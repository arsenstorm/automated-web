import { defineExtensionMessaging } from "@webext-core/messaging";

/**
 * Typed messaging between the side panel, background, and content scripts.
 * Add message types here as `name(data): returnType`, then use
 * `sendMessage("name", data)` / `onMessage("name", handler)`.
 */
export interface ProtocolMap {
  ping(): void;
}

export const { sendMessage, onMessage } =
  defineExtensionMessaging<ProtocolMap>();
