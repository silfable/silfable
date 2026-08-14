"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";

import type { WebProposal } from "@/lib/db";

export function TokenLaunchPreviewCard({
  proposal,
  busy,
  hasVolatileMint,
  onPrepare,
  onExecute,
  onVerify,
}: {
  proposal: WebProposal;
  busy: boolean;
  hasVolatileMint: boolean;
  onPrepare: (finalReview: boolean) => void;
  onExecute: () => void;
  onVerify: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const now = useClock();
  const stage = proposal.launchStage ?? "draft";
  const confirmed = stage === "confirmed";
  const terminal = confirmed || stage === "failed";
  const expiresAt = proposal.launchExpiresAt;
  const preflightExpired = Boolean(expiresAt && now >= expiresAt);
  const canExecute = stage === "final-review" && !preflightExpired && hasVolatileMint && confirmation === "LAUNCH TOKEN MAINNET" && acknowledged;
  const lamportsToSol = (value?: string) => value && /^\d+$/u.test(value) ? `${(Number(value) / 1_000_000_000).toFixed(6)} SOL` : "Pending";

  return (
    <section className={`mt-4 overflow-hidden rounded-xl border ${confirmed ? "border-emerald-400/40 bg-emerald-400/[0.04]" : stage === "failed" ? "border-rose-400/40 bg-rose-400/[0.04]" : "border-cyan-400/30 bg-slate-950/80"}`}>
      <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-cyan-300">Pump.fun · Token Launch</p>
          <h3 className="mt-1 text-base font-semibold text-white">{proposal.launchName} (${proposal.launchSymbol})</h3>
        </div>
        <span className={`rounded border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] ${confirmed ? "border-emerald-400/40 text-emerald-300" : stage === "failed" ? "border-rose-400/40 text-rose-300" : "border-amber-400/35 text-amber-300"}`}>
          {stage.replace(/-/gu, " ")}
        </span>
      </header>

      <div className="grid grid-cols-2 border-b border-white/10 text-xs sm:grid-cols-3">
        <Fact label="Creator" value={short(proposal.launchCreatorWallet)} />
        <Fact label="Mint" value={proposal.launchMintAddress ? short(proposal.launchMintAddress) : "Generated at preflight"} />
        <Fact label="Metadata" value={proposal.launchMetadataUri?.startsWith("ipfs://") ? "Published to IPFS" : "Hosted HTTPS"} />
        <Fact label="Network fee" value={lamportsToSol(proposal.launchNetworkFeeLamports)} />
        <Fact label="Account rent" value={lamportsToSol(proposal.launchRentLamports)} />
        <Fact label="Total estimate" value={lamportsToSol(proposal.launchTotalEstimatedOutflowLamports)} />
        {(stage === "preflight" || stage === "final-review") && <Fact label="Unsigned preflight" value={formatExpiry(expiresAt, now)} />}
      </div>

      <div className="space-y-2 px-4 py-3 text-xs leading-5 text-slate-300">
        <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-300" /> Metadata URI and creator wallet are pinned to this review card.</p>
        {proposal.launchTransactionDigest && <p className="font-mono text-[10px] text-slate-500">Digest: {proposal.launchTransactionDigest.slice(0, 20)}… · simulation slot {proposal.launchSimulationSlot?.toLocaleString() ?? "pending"}</p>}
        {(stage === "preflight" || stage === "final-review") && expiresAt && <p className={`rounded-md border p-2 ${preflightExpired ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-amber-400/30 bg-amber-400/[0.07] text-amber-100"}`}>{preflightExpired ? "This unsigned preflight has expired. Prepare a fresh preflight before signing." : <>Unsigned transaction expires at <strong>{formatLocalTime(expiresAt)}</strong> ({formatRemaining(expiresAt - now)} remaining). It is also bound to Solana block height {proposal.launchLastValidBlockHeight?.toLocaleString() ?? "pending"}; prepare again if the wallet prompt is delayed.</>}</p>}
        {stage === "final-review" && !hasVolatileMint && <p className="rounded-md border border-amber-400/30 bg-amber-400/10 p-2 text-amber-200">The temporary mint signer expired after reload. Run preflight again to generate a fresh mint safely.</p>}
        {proposal.launchError && <p className="rounded-md border border-rose-400/30 bg-rose-400/10 p-2 text-rose-200">{proposal.launchError}</p>}
      </div>

      {stage === "final-review" && hasVolatileMint && !preflightExpired && (
        <div className="mx-4 mb-4 space-y-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.07] p-3">
          <p className="flex items-start gap-2 text-xs font-semibold text-amber-200"><TriangleAlert className="size-4 shrink-0" /> Irreversible Mainnet authorization</p>
          <p className="text-xs leading-5 text-slate-300">This creates a real Pump.fun token mint. Review the exact mint, metadata, fee ceiling, and wallet in Phantom/Solflare.</p>
          <label className="block font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">Type LAUNCH TOKEN MAINNET<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-white" /></label>
          <label className="flex items-start gap-2 text-xs leading-5 text-slate-300"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" /> I approve one wallet signing request and one Mainnet broadcast attempt for this exact transaction.</label>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">Browser wallet approval required</span>
        <div className="flex flex-wrap gap-2">
          {stage === "draft" && <Action disabled={busy} onClick={() => onPrepare(false)}>{busy ? "Simulating…" : "Run unsigned preflight"}</Action>}
          {stage === "preflight" && <Action disabled={busy} onClick={() => onPrepare(true)}>{busy ? "Revalidating…" : "Run final Mainnet checks"}</Action>}
          {stage === "final-review" && (!hasVolatileMint || preflightExpired) && <Action disabled={busy} onClick={() => onPrepare(false)}>{busy ? "Preparing…" : "Prepare fresh preflight"}</Action>}
          {stage === "final-review" && hasVolatileMint && !preflightExpired && <Action danger disabled={busy || !canExecute} onClick={onExecute}>{busy ? "Submitting…" : "Launch token on Mainnet"}</Action>}
          {(stage === "submitted" || stage === "unknown") && <Action disabled={busy} onClick={onVerify}>{busy ? "Checking…" : "Verify on-chain"}</Action>}
          {proposal.launchExplorerUrl && <button type="button" onClick={() => window.open(proposal.launchExplorerUrl, "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1 rounded-md border border-white/15 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-200 hover:border-cyan-300/50"><ExternalLink className="size-3" /> Open explorer</button>}
          {proposal.launchMetadataGatewayUrl && <button type="button" onClick={() => window.open(proposal.launchMetadataGatewayUrl, "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1 rounded-md border border-white/15 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-200 hover:border-cyan-300/50"><ExternalLink className="size-3" /> Metadata</button>}
          {terminal && stage === "failed" && <Action disabled={busy} onClick={() => onPrepare(false)}>Prepare fresh launch</Action>}
        </div>
      </footer>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 border-b border-r border-white/[0.07] px-3 py-2.5"><dt className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className="mt-1 truncate text-[11px] font-medium text-slate-100">{value}</dd></div>;
}

function Action({ children, disabled, onClick, danger = false }: { children: React.ReactNode; disabled: boolean; onClick: () => void; danger?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-md border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-40 ${danger ? "border-rose-400/50 bg-rose-400/10 text-rose-200" : "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"}`}>{children}</button>;
}

function short(value?: string): string { return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Unavailable"; }

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

function formatLocalTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(timestamp));
}

function formatExpiry(expiresAt: number | undefined, now: number): string {
  if (!expiresAt) return "Pending";
  return now >= expiresAt ? "Expired" : `${formatRemaining(expiresAt - now)} remaining`;
}
