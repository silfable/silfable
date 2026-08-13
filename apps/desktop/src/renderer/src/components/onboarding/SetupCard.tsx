import React from "react";
import { Button } from "../ui/Button";

export function SetupCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="setupCard">
      <header>
        <span className="setupIcon">{icon}</span>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </header>
      <div className="setupBody">{children}</div>
    </section>
  );
}

export function SetupActions({
  step,
  onBack,
  onContinue,
  continueDisabled,
  continueLabel = "Save and continue",
  secondaryLabel,
}: {
  step: number;
  onBack?: (() => void) | undefined;
  onContinue: () => void;
  continueDisabled?: boolean | undefined;
  continueLabel?: string | undefined;
  secondaryLabel?: string | undefined;
}) {
  return (
    <footer className="setupActions">
      <span>Step {step} / 6 · Mainnet only</span>
      <div>
        {onBack && (
          <Button variant="secondary" size="sm" onClick={onBack}>
            Back
          </Button>
        )}
        {secondaryLabel && (
          <Button variant="secondary" size="sm" onClick={onContinue}>
            {secondaryLabel}
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          disabled={continueDisabled}
          onClick={onContinue}
        >
          {continueLabel}
        </Button>
      </div>
    </footer>
  );
}
