/** First-run (and post-reset) onboarding: welcome → vault → password → go. */

import { cn } from "cnfast";
import { CircleCheck, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { StepCard } from "@/components/step-card";
import { GHOST_TEXT_BUTTON, INPUT, PRIMARY_BUTTON } from "@/components/styles";
import { IconSwap, StepFlow } from "@/components/transitions";
import { sendMessage } from "@/lib/messaging";
import { setStored } from "@/lib/storage";
import { TOUR_URL } from "@/lib/tour";

type Step = "welcome" | "vault" | "password" | "done";

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [password, setPassword] = useState("");

  const go = (next: Step) => () => setStep(next);

  const submitPassword = useCallback(async () => {
    if (password) {
      await sendMessage("setVaultPassword", password);
      setPassword("");
    }
    setStep("done");
  }, [password]);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      submitPassword().catch(() => null);
    },
    [submitPassword]
  );

  const handlePasswordChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value),
    []
  );

  const startTour = useCallback(() => {
    setStored("tour", { phase: "record", step: 0 })
      .then(() => browser.tabs.create({ url: TOUR_URL }))
      .catch(() => null);
    onDone();
  }, [onDone]);

  const steps: Record<Step, ReactNode> = {
    done: (
      <StepCard
        description="Take a two-minute guided tour: record and replay real demo flows on a live page, or jump straight in."
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
          onClick={startTour}
          type="button"
        >
          Try it on a demo page
        </button>
        <button
          className={cn(GHOST_TEXT_BUTTON, "mt-1")}
          onClick={onDone}
          type="button"
        >
          Skip the tour
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
          onSubmit={handleSubmit}
        >
          <label className="sr-only" htmlFor="onboarding-password">
            Vault password
          </label>
          <input
            className={cn(INPUT, "text-center")}
            id="onboarding-password"
            minLength={8}
            name="onboarding-password"
            onChange={handlePasswordChange}
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
  };

  return <StepFlow stepKey={step}>{steps[step]}</StepFlow>;
}
