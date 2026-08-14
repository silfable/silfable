import React from "react";
import logoUrl from "../../../../assets/logo.png";

export function SetupCard({
  title,
  subtitle,
  eyebrow,
  className,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  eyebrow?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`setupCard ${className ?? ""}`.trim()}>
      <header>
        <div>
          {eyebrow && <span className="setupChapterKicker">{eyebrow}</span>}
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
        {onBack && <button onClick={onBack}>Back</button>}
        {secondaryLabel && (
          <button onClick={onContinue}>{secondaryLabel}</button>
        )}
        <button
          className="primaryButton"
          disabled={continueDisabled}
          onClick={onContinue}
        >
          {continueLabel}
        </button>
      </div>
    </footer>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ProviderCard({
  name,
  tag,
  description,
  children,
}: {
  name: string;
  tag: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="providerCard">
      <header>
        <strong>{name}</strong>
        <StatusPill tone={tag === "Configured" ? "success" : "neutral"}>
          {tag}
        </StatusPill>
      </header>
      <p>{description}</p>
      {children}
    </section>
  );
}

export function Notice({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`notice ${tone}`}>
      <span>{tone === "danger" ? "!" : tone === "warning" ? "△" : "i"}</span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  return <span className={`statusPill ${tone}`}>{children}</span>;
}

export function Brand({ compact }: { compact: boolean }) {
  return (
    <div className={`setupBrand ${compact ? "compact" : ""}`}>
      <BrandMark />
      <div>
        <strong>Silfable</strong>
        <small>Mainnet intelligence</small>
      </div>
    </div>
  );
}

export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <span className={`brandMark ${large ? "large" : ""}`}>
      <img src={logoUrl} alt="Silfable Logo" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "inherit" }} />
    </span>
  );
}

export function CornerFooter() {
  return (
    <div className="cornerFooter">
      <span>Local-first · policy enforced</span>
      <span>MAINNET</span>
    </div>
  );
}

export function RailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="railSection">
      <header>
        <h2>{title}</h2>
      </header>
      <div className="railBody">{children}</div>
    </section>
  );
}
