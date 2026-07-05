/** Settings view: titled groups of label + description + action rows. */

import { cn } from "cnfast";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { IconButton, SmallButton } from "@/components/buttons";
import { INPUT } from "@/components/styles";
import { Switch } from "@/components/switch";
import { Expand } from "@/components/transitions";
import { ViewTitle } from "@/components/view-title";
import { fireAndForget, sendMessage, type VaultStatus } from "@/lib/messaging";
import { getStored, setStored } from "@/lib/storage";
import type { Settings } from "@/lib/types";

/** Option row: label and action share a line, description runs full width. */
function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">{label}</p>
        <div className="shrink-0">{children}</div>
      </div>
      <p className="mt-0.5 text-pretty text-muted-foreground text-sm">
        {description}
      </p>
    </div>
  );
}

function RecordingSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    fireAndForget(getStored("settings").then(setSettings));
  }, []);

  const setRecordSecrets = (recordSecrets: boolean) => {
    if (!settings) {
      return;
    }
    const next = { ...settings, recordSecrets };
    setSettings(next);
    setStored("settings", next).catch(() => null);
  };

  return (
    <SettingRow
      description="Keep passwords and card numbers in the encrypted vault so replay can fill them."
      label="Store secret fields"
    >
      <Switch
        checked={settings?.recordSecrets ?? false}
        disabled={settings === null}
        label="Store secret fields"
        onChange={setRecordSecrets}
      />
    </SettingRow>
  );
}

function VaultSettings({
  status,
  onChanged,
}: {
  status: VaultStatus;
  onChanged: () => void;
}) {
  const hasPassword = status === "open";
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");

  const submit = async () => {
    await sendMessage("setVaultPassword", password);
    setPassword("");
    setEditing(false);
    onChanged();
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SettingRow
          description={
            hasPassword
              ? "Used to unlock the vault where your recordings are securely stored."
              : "Recordings are encrypted, but anyone using this browser profile can decrypt them."
          }
          label="Vault password"
        >
          <SmallButton onClick={() => setEditing((open) => !open)}>
            {hasPassword ? "Change password" : "Set password"}
          </SmallButton>
        </SettingRow>
        <Expand show={editing}>
          <form
            className="flex gap-2 pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit().catch(() => null);
            }}
          >
            <label className="sr-only" htmlFor="vault-password">
              Vault password
            </label>
            <input
              className={cn(INPUT, "min-w-0 flex-1 py-1")}
              id="vault-password"
              minLength={8}
              name="vault-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={
                hasPassword ? "New vault password" : "Vault password"
              }
              required
              type="password"
              value={password}
            />
            <SmallButton type="submit">Save</SmallButton>
          </form>
        </Expand>
      </div>
      <SettingRow
        description={
          hasPassword
            ? "Lock the vault until the password is entered again."
            : "You can't lock your vault since you haven't set a password for it."
        }
        label="Lock vault"
      >
        <SmallButton
          disabled={!hasPassword}
          onClick={() => {
            fireAndForget(sendMessage("lockVault"), onChanged);
          }}
        >
          Lock
        </SmallButton>
      </SettingRow>
    </section>
  );
}

export function SettingsView({
  status,
  onBack,
  onChanged,
}: {
  status: VaultStatus;
  onBack: () => void;
  onChanged: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <ViewTitle className="font-semibold text-sm">Settings</ViewTitle>
        <IconButton label="Back to workflows" onClick={onBack}>
          <X aria-hidden="true" className="size-4 shrink-0" />
        </IconButton>
      </header>
      <VaultSettings onChanged={onChanged} status={status} />
      <RecordingSettings />
    </main>
  );
}
