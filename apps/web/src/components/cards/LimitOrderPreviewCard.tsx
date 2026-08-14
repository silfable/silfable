"use client";

import React from "react";
import { WebProposal } from "@/lib/db";
import { CheckCircle2 } from "lucide-react";

interface LimitOrderPreviewCardProps {
  proposal: WebProposal;
  status: "ready_for_user_signature" | "preview_only" | "signing" | "signed" | "failed";
  onExecute: () => void;
}

export function LimitOrderPreviewCard({
  proposal,
  status,
  onExecute,
}: LimitOrderPreviewCardProps) {
  return (
    <div className="missionPreview border border-indigo-500/20 bg-slate-900/60 rounded-xl p-4">
      <header className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
        <div>
          <span className="text-[11px] font-mono tracking-wider text-indigo-400 block uppercase">
            JUPITER LIMIT ORDER PROPOSAL
          </span>
          <strong className="text-sm text-white font-mono">
            {proposal.mint.slice(0, 8)}...{proposal.mint.slice(-8)}
          </strong>
        </div>
        <span className="statusPill bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
          Ready for Review
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-xs mb-3 bg-black/30 p-2.5 rounded-lg border border-white/5">
        <div>
          <dt className="text-slate-500 font-mono">Deposit</dt>
          <dd className="text-emerald-400 font-semibold">{proposal.solAmount} SOL</dd>
        </div>
        <div>
          <dt className="text-slate-500 font-mono">Target Trigger</dt>
          <dd className="text-slate-200 font-mono">Dip Buy Trigger</dd>
        </div>
        <div>
          <dt className="text-slate-500 font-mono">Est. Tokens</dt>
          <dd className="text-slate-200 font-mono">{proposal.estimatedTokens}</dd>
        </div>
        <div>
          <dt className="text-slate-500 font-mono">Policy</dt>
          <dd className="text-emerald-400 font-mono">Vault Check Passed</dd>
        </div>
      </dl>

      <div className="space-y-1.5 mb-4 text-xs">
        <div className="flex items-start gap-2 text-slate-300">
          <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <p>Jupiter Limit Vault registered & verified</p>
        </div>
        <div className="flex items-start gap-2 text-slate-300">
          <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <p>Minimum output rate guarded against MEV sandwiches</p>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
        <div className="text-[11px] text-slate-400">
          <span className="block font-medium text-slate-300">
            Venue: Jupiter Limit v2 Vault
          </span>
          <small className="text-slate-500 block leading-tight mt-0.5">
            {proposal.explanation}
          </small>
        </div>

        <button
          disabled={status === "signed" || status === "signing"}
          onClick={onExecute}
          className="primaryButton shrink-0 px-4 py-2 text-xs font-semibold"
        >
          {status === "signed"
            ? "✓ Order Placed"
            : status === "signing"
            ? "Placing Order..."
            : "Create Limit Order"}
        </button>
      </footer>
    </div>
  );
}
