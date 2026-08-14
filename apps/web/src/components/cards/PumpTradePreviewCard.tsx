"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";
import { WebProposal } from "@/lib/db";

interface PumpTradePreviewCardProps {
  proposal: WebProposal;
  status: "ready_for_user_signature" | "preview_only" | "signing" | "signed" | "failed";
  onExecuteOptionA: () => void;
  maxSlippageBps?: string;
}

export function PumpTradePreviewCard({
  proposal,
  status,
  onExecuteOptionA,
  maxSlippageBps = "100",
}: PumpTradePreviewCardProps) {
  return (
    <div className="missionPreview border border-amber-500/20 bg-slate-950/70 rounded-xl p-4">
      <header className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
        <div>
          <span className="text-[11px] font-mono tracking-wider text-amber-300 block uppercase">
            PUMP.FUN MAINNET PREVIEW
          </span>
          <strong className="text-sm text-white font-mono">
            {proposal.mint.slice(0, 8)}...{proposal.mint.slice(-8)}
          </strong>
        </div>
        <span className="statusPill bg-amber-500/10 text-amber-300 border border-amber-500/30">
          Preview only
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-xs mb-3 bg-black/30 p-2.5 rounded-lg border border-white/5">
        <div>
          <dt className="text-slate-500 font-mono">Target Mint</dt>
          <dd className="text-slate-200 font-mono">
            {proposal.mint.slice(0, 6)}...{proposal.mint.slice(-6)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 font-mono">Reference Size</dt>
          <dd className="text-emerald-400 font-semibold">{proposal.solAmount} SOL</dd>
        </div>
        <div>
          <dt className="text-slate-500 font-mono">Est. Tokens</dt>
          <dd className="text-slate-200 font-mono">{proposal.estimatedTokens}</dd>
        </div>
        <div>
          <dt className="text-slate-500 font-mono">Max Slippage</dt>
          <dd className="text-slate-200 font-mono">{maxSlippageBps} bps</dd>
        </div>
      </dl>

      <div className="space-y-1.5 mb-4 text-xs">
        <div className="flex items-start gap-2 text-slate-300">
          <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <p>Restricted preview only. No Pump.fun transaction is created or signed in the web app yet.</p>
        </div>
        <div className="flex items-start gap-2 text-slate-300">
          <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <p>Live Pump.fun execution still needs fee guard, final revalidation, and receipt parity with desktop.</p>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
        <div className="text-[11px] text-slate-400">
          <span className="block font-medium text-slate-300">Engine: Pump.fun preview</span>
          <small className="text-slate-500 block leading-tight mt-0.5">
            {proposal.explanation}
          </small>
        </div>

        <button
          disabled={true}
          onClick={onExecuteOptionA}
          className="primaryButton shrink-0 px-4 py-2 text-xs font-semibold"
          title="Pump.fun web execution is not enabled yet."
        >
          {status === "preview_only" ? "Execution not enabled" : "Approve disabled"}
        </button>
      </footer>
    </div>
  );
}
