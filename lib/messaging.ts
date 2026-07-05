import { defineExtensionMessaging } from "@webext-core/messaging";
import type {
  RecordedEvent,
  RecordingState,
  RunState,
  StepAction,
  StepResult,
  Workflow,
} from "./types";

export type VaultStatus = "open" | "locked" | "no-password";

/**
 * Typed messaging between the side panel, background, and content scripts.
 * Add message types here as `name(data): returnType`, then use
 * `sendMessage("name", data)` / `onMessage("name", handler)`.
 */
export interface ProtocolMap {
  cancelRecording: () => void;
  cancelRun: () => void;
  deleteWorkflow: (id: string) => void;
  dismissSuggestion: (data: { fingerprint: string; never: boolean }) => void;
  executeStep: (data: { step: StepAction }) => StepResult;
  /** Ship buffered events immediately (used when a manual recording stops). */
  flushNow: () => void;
  getRecording: () => RecordingState | null;
  getRunState: () => RunState | null;
  // side panel → background
  listWorkflows: () => Workflow[];
  /** Drops the session key; the vault stays locked until unlocked again. */
  lockVault: () => void;
  ping: () => void;
  // content → background
  recordEvents: (events: RecordedEvent[]) => void;
  renameWorkflow: (data: { id: string; name: string }) => void;
  /** Forgot-password escape hatch: wipes the vault and everything keyed to it. */
  resetVault: () => void;
  resumeRun: () => void;
  saveSuggestion: (data: { fingerprint: string }) => void;
  setVaultPassword: (password: string) => void;
  /** Skip the step a paused run is stuck on and continue. */
  skipStep: () => void;
  /** Returns false when there is no recordable active tab. */
  startRecording: () => boolean;
  startRun: (workflowId: string) => void;
  /** Saves events since startRecording as a workflow; null if too short. */
  stopRecording: () => Workflow | null;
  // background → content (tab-targeted)
  suggestWorkflow: (data: { fingerprint: string; stepCount: number }) => void;
  unlockVault: (password: string) => boolean;
  /** Replace a workflow's steps (timeline editor). Throws when invalid. */
  updateWorkflowSteps: (data: { id: string; steps: StepAction[] }) => void;
  vaultStatus: () => VaultStatus;
}

export const { sendMessage, onMessage } =
  defineExtensionMessaging<ProtocolMap>();

/**
 * Fire-and-forget for UI handlers and the background: log a failure instead
 * of leaving an unhandled rejection, and still run `after` so views resync
 * to whatever state actually stuck.
 */
export function fireAndForget(
  promise: Promise<unknown>,
  after?: () => void
): void {
  promise.catch((error) => console.error(error)).finally(() => after?.());
}
