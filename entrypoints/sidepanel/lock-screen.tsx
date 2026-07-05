/** Centered locked state with a stepped forgot-password → reset flow. */

import { cn } from "cnfast";
import { KeyRound, Lock, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { sendMessage } from "@/lib/messaging";
import { useAnimDuration, useCrossfade } from "./motion";
import {
  DESTRUCTIVE_BUTTON,
  GHOST_TEXT_BUTTON,
  INPUT,
  PRIMARY_BUTTON,
  StepCard,
  StepFlow,
} from "./ui";

type Step = "unlock" | "explain" | "confirm" | "reset";

const ERROR_CLEAR_MS = 3000;

export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [step, setStep] = useState<Step>("unlock");
  const [password, setPassword] = useState("");
  /** Wrong password: red outline on the input until typing or a timeout. */
  const [error, setError] = useState(false);
  const fade = useCrossfade();
  const duration = useAnimDuration();

  useEffect(() => {
    if (!error) {
      return;
    }
    const timer = setTimeout(() => setError(false), ERROR_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [error]);

  const submit = async () => {
    const ok = await sendMessage("unlockVault", password);
    if (ok) {
      // Keep the password in the field — the screen is exiting, and clearing
      // it would flash the placeholder mid-crossfade.
      onUnlocked();
      return;
    }
    setError(true);
    setPassword("");
  };

  const go = (next: Step) => () => {
    setError(false);
    setStep(next);
  };

  const reset = () => {
    sendMessage("resetVault").then(onUnlocked);
  };

  const steps: Record<Step, ReactNode> = {
    unlock: (
      <StepCard
        description={
          // Persistent live region so the wrong-password swap is announced.
          <span className="block" id="unlock-message" role="status">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                {...fade}
                className={cn("block", error && "text-destructive")}
                key={error ? "error" : "hint"}
              >
                {error
                  ? "That password isn't right — give it another try."
                  : "Enter your vault password to record and run workflows."}
              </motion.span>
            </AnimatePresence>
          </span>
        }
        icon={
          <Lock aria-hidden="true" className="size-5 text-muted-foreground" />
        }
        title="Vault locked"
      >
        <form
          className="mt-4 flex w-full max-w-56 flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit().catch(() => setError(true));
          }}
        >
          <label className="sr-only" htmlFor="unlock-password">
            Vault password
          </label>
          <motion.input
            animate={
              // Subtle red border plus a bolder ring with a 2px gap — the
              // "outline" is a box-shadow so it never fights the focus outline.
              error
                ? {
                    borderColor: "var(--destructive)",
                    boxShadow:
                      "0 0 0 2px var(--background), 0 0 0 4px var(--destructive)",
                  }
                : {
                    borderColor: "var(--input)",
                    boxShadow: "0 0 0 0px transparent, 0 0 0 0px transparent",
                  }
            }
            aria-describedby="unlock-message"
            aria-invalid={error}
            className={cn(
              INPUT,
              "text-center",
              error && "focus-visible:outline-destructive"
            )}
            id="unlock-password"
            name="unlock-password"
            onChange={(event) => {
              setError(false);
              setPassword(event.target.value);
            }}
            placeholder="Vault password"
            required
            transition={{ duration }}
            type="password"
            value={password}
          />
          <button className={PRIMARY_BUTTON} type="submit">
            Unlock
          </button>
        </form>
        <button
          className={cn(GHOST_TEXT_BUTTON, "mt-1")}
          onClick={go("explain")}
          type="button"
        >
          Forgot your password?
        </button>
      </StepCard>
    ),
    explain: (
      <StepCard
        description="Your password never leaves this device, so there's no way to recover it. You can reset the vault instead and start fresh."
        icon={
          <KeyRound
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
        }
        title="Passwords can't be recovered"
      >
        {/* spacer to stop layout shift from previous section */}
        <div className="h-1.5" />
        <button
          className={cn(PRIMARY_BUTTON, "mt-4")}
          onClick={go("confirm")}
          type="button"
        >
          Continue
        </button>
        <button
          className={cn(GHOST_TEXT_BUTTON, "mt-1")}
          onClick={go("unlock")}
          type="button"
        >
          Back
        </button>
      </StepCard>
    ),
    confirm: (
      <StepCard
        danger
        description="Resetting the vault permanently deletes every recorded workflow and saved input. This can't be undone."
        icon={
          <TriangleAlert
            aria-hidden="true"
            className="size-5 text-destructive"
          />
        }
        title="Your workflows will be lost"
      >
        {/* spacer to stop layout shift from previous section */}
        <div className="h-1.5" />
        <button
          className={cn(PRIMARY_BUTTON, "mt-4")}
          onClick={go("reset")}
          type="button"
        >
          I understand, continue
        </button>
        <button
          className={cn(GHOST_TEXT_BUTTON, "mt-1")}
          onClick={go("explain")}
          type="button"
        >
          Back
        </button>
      </StepCard>
    ),
    reset: (
      <StepCard
        danger
        description="This is your last chance to turn back — all workflows and anything else the vault protected will be gone for good."
        icon={
          <TriangleAlert
            aria-hidden="true"
            className="size-5 text-destructive"
          />
        }
        title="Reset the vault"
      >
        {/* spacer to stop layout shift from previous section */}
        <div className="h-1.5" />
        <button
          className={cn(DESTRUCTIVE_BUTTON, "mt-4")}
          onClick={reset}
          type="button"
        >
          Reset vault
        </button>
        <button
          className={cn(GHOST_TEXT_BUTTON, "mt-1")}
          onClick={go("unlock")}
          type="button"
        >
          Cancel
        </button>
      </StepCard>
    ),
  };

  return <StepFlow stepKey={step}>{steps[step]}</StepFlow>;
}
