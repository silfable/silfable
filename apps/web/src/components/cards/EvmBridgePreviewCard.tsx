"use client";

import { ArrowRight, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import type { WebProposal } from "@/lib/db";

function formatUnits(raw?: string): string | null {
  if (!raw || !/^\d+$/u.test(raw)) return null;
  const value = BigInt(raw);
  const whole = value / BigInt(1_000_000);
  const fraction = (value % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function EvmBridgePreviewCard({ proposal, busy, onPrepare }: { proposal: WebProposal; busy: boolean; onPrepare: () => void }) {
  const approvalConfirmed = proposal.status === "approval_confirmed" || Boolean(proposal.bridgeApprovalTxHash && !proposal.sourceTxHash && !proposal.bridgeAction);
  const estimatedOutput = approvalConfirmed ? null : formatUnits(proposal.outputAmount);
  const minimumOutput = approvalConfirmed ? null : formatUnits(proposal.minimumOutputAmount);
  const terminal = ["confirmed", "reverted"].includes(proposal.status);
  const buttonLabel = busy || proposal.status === "signing"
    ? "Waiting..."
    : proposal.status === "confirmed"
      ? "Bridge completed"
      : proposal.status === "reverted"
        ? "Source reverted"
        : proposal.status === "source_confirmed"
          ? "Check settlement"
            : proposal.status === "unknown"
              ? "Check source / settlement"
              : approvalConfirmed
                ? "Prepare deposit quote"
            : proposal.bridgeAction === "approval"
              ? "Approve exact USDG"
              : proposal.bridgeAction === "deposit"
                ? "Review bridge in wallet"
                : "Prepare quote";

  return (
    <div className="missionPreview rounded-xl border border-cyan-400/25 bg-slate-950/70 p-4">
      <header className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <span className="block font-mono text-[11px] uppercase tracking-wider text-cyan-300">Relay · Bridge proposal</span>
          <strong className="flex items-center gap-2 font-mono text-sm text-white">Robinhood USDG <ArrowRight className="size-3.5 text-cyan-300" /> Solana USDC</strong>
        </div>
        <span className={`statusPill border ${proposal.status === "confirmed" || approvalConfirmed ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : proposal.status === "reverted" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
          {proposal.status === "confirmed" ? "Confirmed" : approvalConfirmed ? "Approval confirmed" : proposal.status === "source_confirmed" ? "Settling" : proposal.status === "reverted" ? "Reverted" : "Restricted"}
        </span>
      </header>
      <dl className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-white/5 bg-black/30 p-2.5 text-xs">
        <div><dt className="font-mono text-slate-500">Source amount</dt><dd className="font-mono text-white">{proposal.amountUsdg} USDG</dd></div>
        <div><dt className="font-mono text-slate-500">Destination</dt><dd className="font-mono text-white">Solana Mainnet</dd></div>
        {estimatedOutput && <div><dt className="font-mono text-slate-500">Estimated receive</dt><dd className="font-mono text-white">{estimatedOutput} USDC</dd></div>}
        {minimumOutput && <div><dt className="font-mono text-slate-500">Minimum receive</dt><dd className="font-mono text-white">{minimumOutput} USDC</dd></div>}
        {!approvalConfirmed && proposal.bridgeTotalFeeUsd != null && <div><dt className="font-mono text-slate-500">Relay impact / fees</dt><dd className="font-mono text-white">${proposal.bridgeTotalFeeUsd.toFixed(4)}</dd></div>}
        {!approvalConfirmed && proposal.bridgeEstimatedSeconds != null && <div><dt className="font-mono text-slate-500">Estimated time</dt><dd className="font-mono text-white">~{proposal.bridgeEstimatedSeconds}s</dd></div>}
        <div className="col-span-2"><dt className="font-mono text-slate-500">Solana recipient</dt><dd className="break-all font-mono text-white">{proposal.destinationRecipient}</dd></div>
      </dl>
      <div className="mb-4 space-y-1.5 text-xs">
        {approvalConfirmed && <div className="flex items-start gap-2 text-emerald-300"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /><p>Exact USDG approval is confirmed. A fresh Relay quote is required for the deposit transaction.</p></div>}
        {(proposal.checks ?? []).map((check) => <div key={check.code} className="flex items-start gap-2 text-slate-300"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" /><p>{check.message}</p></div>)}
      </div>
      {proposal.bridgeStatusMessage && <p className="mb-3 rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs leading-5 text-cyan-100">{proposal.bridgeStatusMessage}</p>}
      {proposal.bridgeError && <p className="mb-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-200">{proposal.bridgeError}</p>}
      {(proposal.bridgeApprovalTxHash || proposal.sourceTxHash || proposal.destinationTxHash) && (
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          {proposal.bridgeApprovalTxHash && <a className="inline-flex items-center gap-1 text-cyan-300" href={`https://robinhoodchain.blockscout.com/tx/${proposal.bridgeApprovalTxHash}`} target="_blank" rel="noreferrer">USDG approval <ExternalLink className="size-3" /></a>}
          {proposal.sourceTxHash && <a className="inline-flex items-center gap-1 text-cyan-300" href={`https://robinhoodchain.blockscout.com/tx/${proposal.sourceTxHash}`} target="_blank" rel="noreferrer">Robinhood source <ExternalLink className="size-3" /></a>}
          {proposal.destinationTxHash && <a className="inline-flex items-center gap-1 text-cyan-300" href={`https://solscan.io/tx/${proposal.destinationTxHash}`} target="_blank" rel="noreferrer">Solana destination <ExternalLink className="size-3" /></a>}
        </div>
      )}
      <footer className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <div className="text-[11px] text-slate-400"><span className="flex items-center gap-1 font-medium text-slate-300"><ShieldCheck className="size-3.5" /> {proposal.status === "confirmed" ? "Bridge settlement verified" : approvalConfirmed ? "USDG approval confirmed" : "EVM wallet approval required"}</span><small>{proposal.status === "confirmed" ? "Robinhood source and Solana destination evidence are attached to this card." : approvalConfirmed ? "Prepare a fresh quote, then review the separate bridge deposit in your wallet." : "Approval and bridge deposit are separate wallet actions. Destination completion is independently checked on Solana."}</small></div>
        <button type="button" disabled={terminal || busy || proposal.status === "signing"} onClick={onPrepare} className="primaryButton shrink-0 px-4 py-2 text-xs font-semibold">{buttonLabel}</button>
      </footer>
    </div>
  );
}
