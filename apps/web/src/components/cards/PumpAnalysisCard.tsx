"use client";

import { CheckCircle2, ExternalLink, ShieldAlert, XCircle } from "lucide-react";

import type { PumpTokenIntelligence } from "@silfable/contracts";

export function PumpAnalysisCard({ intelligence }: { intelligence: PumpTokenIntelligence }) {
  const eligibility = intelligence.researchEligibility;
  const eligible = eligibility?.status === "eligible";
  const path = intelligence.metrics.referencePath;
  const tokenDecimals = intelligence.decimals ?? 0;
  const failedChecks = eligibility?.checks.filter((check) => !check.passed) ?? [];

  return (
    <section className={`mt-4 overflow-hidden rounded-xl border ${eligible ? "border-emerald-400/35 bg-emerald-400/[0.035]" : "border-amber-400/35 bg-amber-400/[0.035]"}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-cyan-300">Pump.fun · Finalized intelligence</p>
          <h3 className="mt-1 text-base font-semibold text-white">{short(intelligence.mint)}</h3>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">Slot {intelligence.slot.toLocaleString()} · {formatVenue(intelligence.venue)}</p>
        </div>
        <span className={`rounded border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] ${eligible ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-200"}`}>
          {eligible ? "research eligible" : "research blocked"}
        </span>
      </header>

      <dl className="grid grid-cols-2 border-b border-white/10 sm:grid-cols-3">
        <Fact label="Canonical venue" value={intelligence.accountVerified || intelligence.pumpSwapPoolVerified ? "Verified" : "Not verified"} />
        <Fact label="Curve progress" value={formatPercent(intelligence.metrics.curveProgressPercent)} />
        <Fact label="Top-10 concentration" value={formatPercent(intelligence.top10ConcentrationPercent)} />
        <Fact label={`Quote reserves (${intelligence.metrics.quoteSymbol})`} value={formatNumber(intelligence.metrics.quoteReservesUi)} />
        <Fact label={`Spot price (${intelligence.metrics.quoteSymbol})`} value={formatNumber(intelligence.metrics.spotPriceQuotePerToken, 10)} />
        <Fact label={`Estimated market cap (${intelligence.metrics.quoteSymbol})`} value={formatNumber(intelligence.metrics.estimatedMarketCapQuote)} />
        <Fact label="Mint authority" value={intelligence.mintAuthority === null ? "Revoked" : "Active"} tone={intelligence.mintAuthority === null ? "good" : "bad"} />
        <Fact label="Freeze authority" value={intelligence.freezeAuthority === null ? "Revoked" : "Active"} tone={intelligence.freezeAuthority === null ? "good" : "bad"} />
        <Fact label="Token program" value={short(intelligence.tokenProgram)} />
      </dl>

      <div className="space-y-3 px-4 py-3">
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">Reserve-only reference path · {(Number(intelligence.metrics.referenceBuyInputLamports) / 1_000_000_000).toFixed(6)} SOL</p>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            <Metric label="Estimated tokens" value={formatRawToken(path.buyOutputTokenAmount, tokenDecimals)} />
            <Metric label="Buy impact" value={formatBps(path.buyPriceImpactBps)} />
            <Metric label="Sell-back SOL" value={formatLamports(path.sellOutputQuoteAmount)} />
            <Metric label="Round-trip loss" value={formatBps(path.roundTripLossBps)} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-500">{path.disclosure}</p>
        </div>

        {failedChecks.length > 0 && (
          <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-amber-200"><ShieldAlert className="size-4" /> {failedChecks.length} deterministic check{failedChecks.length === 1 ? "" : "s"} blocked</p>
            <div className="mt-2 space-y-1.5">
              {failedChecks.map((check) => <p key={check.id} className="flex items-start gap-2 text-[11px] leading-4 text-slate-300"><XCircle className="mt-0.5 size-3 shrink-0 text-amber-300" /> {check.message}</p>)}
            </div>
          </div>
        )}

        <details className="rounded-lg border border-white/10 bg-black/15 p-3">
          <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.14em] text-slate-300">All checks and warnings</summary>
          <div className="mt-3 space-y-2">
            {eligibility?.checks.map((check) => <p key={check.id} className="flex items-start gap-2 text-[11px] leading-4 text-slate-300">{check.passed ? <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-300" /> : <XCircle className="mt-0.5 size-3 shrink-0 text-amber-300" />}{check.message}</p>)}
            {intelligence.warnings.map((warning, index) => <p key={`${index}-${warning}`} className="flex items-start gap-2 text-[11px] leading-4 text-amber-100"><ShieldAlert className="mt-0.5 size-3 shrink-0 text-amber-300" />{warning}</p>)}
          </div>
        </details>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">Read-only · no execution authority</span>
        <div className="flex gap-2">
          <ExternalButton href={`https://solscan.io/token/${intelligence.mint}`}>Solscan</ExternalButton>
          <ExternalButton href={`https://pump.fun/coin/${intelligence.mint}`}>Pump.fun</ExternalButton>
        </div>
      </footer>
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return <div className="min-w-0 border-b border-r border-white/[0.07] px-3 py-2.5"><dt className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className={`mt-1 truncate text-[11px] font-medium ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-amber-200" : "text-slate-100"}`}>{value}</dd></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-1 text-[11px] font-medium text-slate-100">{value}</p></div>;
}

function ExternalButton({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-white/15 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-200 hover:border-cyan-300/50"><ExternalLink className="size-3" />{children}</a>;
}

function short(value: string | null | undefined): string { return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Unavailable"; }
function formatVenue(value: PumpTokenIntelligence["venue"]): string { return value.replace(/-/gu, " "); }
function formatPercent(value: number | null): string { return value === null ? "Unavailable" : `${value.toFixed(2)}%`; }
function formatBps(value: number | null): string { return value === null ? "Unavailable" : `${value.toFixed(1)} bps`; }
function formatNumber(value: number | null, digits = 4): string { return value === null ? "Unavailable" : value.toLocaleString(undefined, { maximumFractionDigits: digits }); }
function formatLamports(value: string | null): string { return value === null ? "Unavailable" : `${(Number(value) / 1_000_000_000).toFixed(8)} SOL`; }
function formatRawToken(value: string | null, decimals: number): string { return value === null ? "Unavailable" : (Number(value) / (10 ** decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 }); }
