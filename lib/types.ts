/** Shared data model + storage keys. Everything lives in `browser.storage.local`. */

/**
 * `id` is a stable short handle ("s1", "s2", …) backfilled by the timeline
 * editor; `{{sN}}` tokens in input values / navigate URLs reference the
 * output of the step with that id. Recorded-but-never-edited steps have none.
 */
export type StepAction = {
  id?: string;
  /**
   * Element lives in an iframe: that frame's URL at record time. Stamped by
   * the background from the message sender; not user-editable.
   */
  frameUrl?: string;
} & (
  | { kind: "navigate"; url: string }
  | { kind: "click"; selector: string; text?: string }
  | { kind: "input"; selector: string; value: string; sensitive: boolean }
  | { kind: "submit"; selector: string }
  | { kind: "sleep"; ms: number }
  | { kind: "pause" }
  | { kind: "extract"; selector: string }
);

export interface RecordedEvent {
  action: StepAction;
  /** e.g. https://accounts.example.com */
  origin: string;
  /** Stamped by the background from the message sender. */
  tabId?: number;
  ts: number;
}

/** Active manual recording, if any. */
export interface RecordingState {
  startedAt: number;
  startUrl: string;
  tabId: number;
}

export interface Workflow {
  createdAt: number;
  fingerprint: string;
  id: string;
  name: string;
  origin: string;
  steps: StepAction[];
}

export type RunStatus = "running" | "paused" | "done" | "failed";

export interface RunState {
  id: string;
  /**
   * Step outputs keyed by step id, for `{{sN}}` substitution. ponytail:
   * lives unencrypted in the transient run record; encrypt if outputs ever
   * hold secrets.
   */
  outputs?: Record<string, string>;
  pausedReason?: string;
  status: RunStatus;
  /** Next step to execute. */
  stepIndex: number;
  tabId: number;
  workflowId: string;
}

export type StepResult =
  | { ok: true; output?: string }
  | {
      ok: false;
      reason: "timeout" | "captcha" | "secret" | "pause" | "missing-output";
      detail?: string;
    };

/** base64(iv) + base64(AES-GCM ciphertext). */
export interface VaultEntry {
  data: string;
  iv: string;
}

export interface VaultMeta {
  /** Encrypted check value used to verify a password on unlock. */
  check?: VaultEntry;
  /** Random key (JWK) used when no password is set. */
  rawKeyJwk?: JsonWebKey;
  /** PBKDF2 salt (base64) — present iff a vault password is set. */
  salt?: string;
}

/** Miner output: a repeated session not yet saved as a workflow. */
export interface CandidatePattern {
  count: number;
  fingerprint: string;
  lastSeen: number;
  /** Last time a toast was shown for this pattern (suggestion cooldown). */
  lastSuggestedAt?: number;
  origin: string;
  /** Steps from the most recent matching session (freshest input values). */
  steps: StepAction[];
}

export interface Settings {
  minRepeats: number;
  /** Store secret-field values (encrypted) so replay can fill them. */
  recordSecrets: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  minRepeats: 3,
  recordSecrets: false,
};

export const EVENT_BUFFER_CAP = 1000;

/**
 * storage.local keys and their value shapes. `events`, `patterns`, and
 * `workflows` are encrypted at rest — read them through the background's
 * getSecure/setSecure, which decrypt to `RecordedEvent[]`,
 * `Record<string, CandidatePattern>`, and `Workflow[]` respectively.
 */
export interface StorageShape {
  events: VaultEntry | null;
  /** First-run onboarding finished. Cleared by a vault reset so it re-runs. */
  onboarded: boolean;
  patterns: VaultEntry | null;
  /** Active manual recording. */
  recording: RecordingState | null;
  /** Single active run. ponytail: one run at a time; make it a map if concurrent runs are ever wanted. */
  run: RunState | null;
  settings: Settings;
  /** Dismissed fingerprints and `never:<origin>` entries. */
  suppressed: string[];
  vaultMeta: VaultMeta;
  workflows: VaultEntry | null;
}
