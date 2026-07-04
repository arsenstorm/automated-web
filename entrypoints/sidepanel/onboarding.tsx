/** First-run (and post-reset) onboarding: welcome → vault → password → go. */

import { cn } from "cnfast";
import { CircleCheck, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { sendMessage } from "@/lib/messaging";
import {
  GHOST_TEXT_BUTTON,
  IconSwap,
  INPUT,
  PRIMARY_BUTTON,
  StepCard,
  StepFlow,
} from "./ui";

type Step = "welcome" | "vault" | "password" | "done";

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [password, setPassword] = useState("");

  const go = (next: Step) => () => setStep(next);

  const submitPassword = async () => {
    if (password) {
      await sendMessage("setVaultPassword", password);
      setPassword("");
    }
    setStep("done");
  };

  const steps: Record<Step, ReactNode> = {
    welcome: (
      <StepCard
        description="Record a repetitive web task once and replay it with one click, right from this panel."
        icon={
          <Sparkles
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
        }
        title="Welcome to Automated Web"
      >
        <button
          className={cn(PRIMARY_BUTTON, "mt-4")}
          onClick={go("vault")}
          type="button"
        >
          Get started
        </button>
        {/* spacer to stop layout shift from previous section */}
        <div className="h-9" />
      </StepCard>
    ),
    vault: (
      <StepCard
        description="Everything you record is encrypted into a vault that never leaves this device."
        icon={
          <ShieldCheck
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
        }
        title="Meet the vault"
      >
        <button
          className={cn(PRIMARY_BUTTON, "mt-4")}
          onClick={go("password")}
          type="button"
        >
          Continue
        </button>
        <button
          className={cn(GHOST_TEXT_BUTTON, "mt-1")}
          onClick={go("welcome")}
          type="button"
        >
          Back
        </button>
      </StepCard>
    ),
    password: (
      <StepCard
        description="A password keeps your vault locked when you step away. Without one, anyone using this browser profile can replay your workflows."
        icon={
          <KeyRound
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
        }
        title="Protect your vault"
      >
        <form
          className="mt-4 flex w-full max-w-56 flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitPassword().catch(() => null);
          }}
        >
          <label className="sr-only" htmlFor="onboarding-password">
            Vault password
          </label>
          <input
            className={cn(INPUT, "text-center")}
            id="onboarding-password"
            minLength={8}
            name="onboarding-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Vault password"
            type="password"
            value={password}
          />
          <button
            className={cn(
              PRIMARY_BUTTON,
              "inline-flex justify-center transition-colors",
              !password &&
                "bg-secondary text-secondary-foreground hover:bg-secondary/70"
            )}
            type="submit"
          >
            <IconSwap id={password ? "set" : "skip"}>
              {password ? "Set password" : "Continue without a password"}
            </IconSwap>
          </button>
        </form>
        {/* spacer to stop layout shift from previous section */}
        <div className="h-9" />
      </StepCard>
    ),
    done: (
      <StepCard
        description="Record your first workflow whenever you're ready. You can change vault settings at any time."
        icon={
          <CircleCheck
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
        }
        title="You're all set"
      >
        <button
          className={cn(PRIMARY_BUTTON, "mt-4")}
          onClick={onDone}
          type="button"
        >
          Start using Automated Web
        </button>
      </StepCard>
    ),
  };

  return <StepFlow stepKey={step}>{steps[step]}</StepFlow>;
}
