"use client";

import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";

export interface SwapRouteDetail {
  label: string;
  value: ReactNode;
}

interface SwapRouteCardProps {
  network: "robinhood" | "solana";
  venue: string;
  inputSymbol: string;
  outputSymbol: string;
  statusLabel: string;
  statusTone: "ready" | "pending" | "confirmed" | "warning";
  details: SwapRouteDetail[];
  checks: Array<{ code: string; message: string }>;
  helperText: string;
  actionLabel: string;
  actionDisabled?: boolean;
  explorerUrl?: string | null;
  onAction: () => void;
}

export function SwapRouteCard({
  network,
  venue,
  inputSymbol,
  outputSymbol,
  statusLabel,
  statusTone,
  details,
  checks,
  helperText,
  actionLabel,
  actionDisabled = false,
  explorerUrl,
  onAction,
}: SwapRouteCardProps) {
  const networkLabel = network === "robinhood" ? "Robinhood Chain" : "Solana";
  return (
    <section className={`swapRouteCard swapRouteCard--${network}`} aria-label={`${networkLabel} ${venue} swap route`}>
      <header className="swapRouteHeader">
        <div>
          <span className="swapRouteEyebrow">{networkLabel} · {venue}</span>
          <strong>{inputSymbol} <ArrowRight aria-hidden="true" /> {outputSymbol}</strong>
        </div>
        <span className={`swapRouteStatus swapRouteStatus--${statusTone}`}>{statusLabel}</span>
      </header>

      <dl className="swapRouteLedger">
        {details.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}
      </dl>

      {checks.length > 0 && (
        <div className="swapRouteChecks">
          {checks.map((check) => <div key={check.code}><CheckCircle2 aria-hidden="true" /><p>{check.message}</p></div>)}
        </div>
      )}

      <footer className="swapRouteFooter">
        <div><span><ShieldCheck aria-hidden="true" /> Wallet confirmation required</span><small>{helperText}</small></div>
        {explorerUrl ? (
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="primaryButton">Open Explorer <ExternalLink aria-hidden="true" /></a>
        ) : (
          <button type="button" className="primaryButton" disabled={actionDisabled} onClick={onAction}>{actionLabel}</button>
        )}
      </footer>
    </section>
  );
}
