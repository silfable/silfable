"use client";

import { ArrowRight, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import type { WebProposal } from "@/lib/db";

function formatTokenUnits(raw: string | undefined): string | null {
  if (!raw || !/^\d+$/u.test(raw)) return null;
  const value = BigInt(raw);
  const tokenScale = BigInt(1_000_000);
  const whole = value / tokenScale;
  const fraction = (value % tokenScale).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function SolanaBridgePreviewCard({ proposal, onPrepare }: { proposal: WebProposal; onPrepare: () => void }) {
  const hasQuote = Boolean(proposal.bridgeTransaction && proposal.bridgeRequestId);
  const disabled = ["signing", "submitted", "source_confirmed", "confirmed"].includes(proposal.status);
  const buttonLabel = proposal.status === "signing"
    ? "Waiting for wallet..."
    : proposal.status === "source_confirmed"
      ? "Settling on Robinhood..."
      : proposal.status === "submitted"
        ? "Verification required"
        : proposal.status === "unknown"
          ? "Check settlement"
        : proposal.status === "confirmed"
          ? "Bridge completed"
          : hasQuote
            ? "Review / approve"
            : "Prepare bridge review";
  const estimatedOutput = formatTokenUnits(proposal.outputAmount);
  const minimumOutput = formatTokenUnits(proposal.minimumOutputAmount);

  return (
    <div className="missionPreview border border-cyan-400/25 bg-slate-950/70 rounded-xl p-4">
      <header className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
        <div>
          <span className="text-[11px] font-mono tracking-wider text-cyan-300 block uppercase">RELAY · BRIDGE PROPOSAL</span>
          <strong className="text-sm text-white font-mono flex items-center gap-2">Solana USDC <ArrowRight className="size-3.5 text-cyan-300" /> Robinhood USDG</strong>
        </div>
        <span className={`statusPill border ${proposal.status === "confirmed" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-amber-500/10 text-amber-300 border-amber-500/30"}`}>
          {proposal.status === "confirmed" ? "Confirmed" : proposal.status === "source_confirmed" ? "Settling" : "Restricted"}
        </span>
      </header>
      <dl className="grid grid-cols-2 gap-2 text-xs mb-3 bg-black/30 p-2.5 rounded-lg border border-white/5">
        <div><dt className="text-slate-500 font-mono">Source amount</dt><dd className="text-white font-mono">{proposal.amountUsdc} USDC</dd></div>
        <div><dt className="text-slate-500 font-mono">Destination</dt><dd className="text-white font-mono">Robinhood Chain</dd></div>
        {estimatedOutput && <div><dt className="text-slate-500 font-mono">Estimated receive</dt><dd className="text-white font-mono">{estimatedOutput} USDG</dd></div>}
        {minimumOutput && <div><dt className="text-slate-500 font-mono">Minimum receive</dt><dd className="text-white font-mono">{minimumOutput} USDG</dd></div>}
        {proposal.bridgeEstimatedSeconds && <div><dt className="text-slate-500 font-mono">Estimated time</dt><dd className="text-white font-mono">~{proposal.bridgeEstimatedSeconds}s</dd></div>}
        {proposal.sourceUsdcBalance && <div><dt className="text-slate-500 font-mono">Verified USDC balance</dt><dd className="text-emerald-300 font-mono">{proposal.sourceUsdcBalance} USDC</dd></div>}
        {proposal.sourceSolBalance && <div><dt className="text-slate-500 font-mono">Verified SOL / fee reserve</dt><dd className="text-emerald-300 font-mono">{proposal.sourceSolBalance} / {proposal.feeReserveSol ?? "0.0001"} SOL</dd></div>}
        <div className="col-span-2"><dt className="text-slate-500 font-mono">Recipient</dt><dd className="text-white font-mono break-all">{proposal.destinationRecipient}</dd></div>
      </dl>
      <div className="space-y-1.5 mb-4 text-xs">
        {(proposal.checks ?? []).map((check) => <div key={check.code} className="flex items-start gap-2 text-slate-300"><CheckCircle2 className="size-3.5 text-emerald-400 shrink-0 mt-0.5" /><p>{check.message}</p></div>)}
      </div>
      {(proposal.sourceTxHash || proposal.destinationTxHash) && (
        <div className="flex flex-wrap gap-3 mb-3 text-xs">
          {proposal.sourceTxHash && <a className="text-cyan-300 inline-flex items-center gap-1" href={`https://solscan.io/tx/${proposal.sourceTxHash}`} target="_blank" rel="noreferrer">Source transaction <ExternalLink className="size-3" /></a>}
          {proposal.destinationTxHash && <a className="text-cyan-300 inline-flex items-center gap-1" href={`https://8crv4vmq6tiu1yqr.blockscout.com/tx/${proposal.destinationTxHash}`} target="_blank" rel="noreferrer">Destination transaction <ExternalLink className="size-3" /></a>}
        </div>
      )}
      <footer className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
        <div className="text-[11px] text-slate-400"><span className="block font-medium text-slate-300 flex items-center gap-1"><ShieldCheck className="size-3.5" /> Solana wallet approval required</span><small>{hasQuote ? "Review the exact wallet transaction before signing." : "Preparing a quote does not open the wallet or broadcast a transaction."}</small></div>
        <button type="button" disabled={disabled} onClick={onPrepare} className="primaryButton shrink-0 px-4 py-2 text-xs font-semibold">{buttonLabel}</button>
      </footer>
    </div>
  );
}
