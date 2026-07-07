/** Shared data model + storage keys. Everything lives in `browser.storage.local`. */

/**
 * `id` is a stable short handle ("s1", "s2", …) backfilled by the timeline
 * editor; `{{sN}}` tokens in input values / navigate URLs reference the
 * output of the step with that id. Recorded-but-never-edited steps have none.
 */
interface StepBase {
  /**
   * Element lives in an iframe: that frame's URL at record time. Stamped by
   * the background from the message sender; not user-editable.
   */
  frameUrl?: string;
  id?: string;
}

interface NavigateStep extends StepBase {
  kind: "navigate";
  url: string;
}

interface ClickStep extends StepBase {
  kind: "click";
  selector: string;
  text?: string;
}

interface InputStep extends StepBase {
  kind: "input";
  selector: string;
  sensitive: boolean;
  value: string;
}

interface SubmitStep extends StepBase {
  kind: "submit";
  selector: string;
}

interface SleepStep extends StepBase {
  kind: "sleep";
  ms: number;
}

interface PauseStep extends StepBase {
  kind: "pause";
}

interface ExtractStep extends StepBase {
  kind: "extract";
  selector: string;
}

export type StepAction =
  | NavigateStep
  | ClickStep
  | InputStep
  | SubmitStep
  | SleepStep
  | PauseStep
  | ExtractStep;

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
  /** When the run paused; user events after this feed resume self-healing. */
  pausedAt?: number;
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
  /** Resume a paused run once the user performs the steps it waited on. */
  autoResume: boolean;
  minRepeats: number;
  /** Store secret-field values (encrypted) so replay can fill them. */
  recordSecrets: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  autoResume: false,
  minRepeats: 3,
  recordSecrets: false,
};

/** Guided onboarding tour progress (see lib/tour.ts). */
export interface TourState {
  phase: "record" | "replay" | "done";
  /** Index into DEMOS. */
  step: number;
  /** Workflow to replay, set once the record phase completes. */
  workflowId?: string;
  /** Every workflow recorded during the tour, offered for cleanup at the end. */
  workflowIds?: string[];
}

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
  /** Guided demo tour progress; null when no tour is active. */
  tour: TourState | null;
  vaultMeta: VaultMeta;
  workflows: VaultEntry | null;
}
