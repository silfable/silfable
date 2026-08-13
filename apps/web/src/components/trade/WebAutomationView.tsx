"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, MessageSquareText, Pause, Play, ShieldCheck, Trash2, Zap } from "lucide-react";

type Strategy = {
  id: string; sessionId: string; kind: "DCA" | "EXIT"; status: string;
  inputSymbol: string; outputSymbol: string; amount: string;
  intervalSeconds?: number | null; maximumExecutions?: number | null; completedExecutions: number;
  takeProfitPriceUsd?: number | null; stopLossPriceUsd?: number | null;
  nextWakeAt?: number | null; expiresAt: number; lastError?: string | null;
  proposals: Array<{ id: string; reason: string; status: string; observedPriceUsd?: number | null; expiresAt: number }>;
};

export function WebAutomationView({ walletAddress, jupiterApiKey, uniswapApiKey, workspace = "solana", onOpenSession }: {
  walletAddress: string | null;
  jupiterApiKey?: string;
  uniswapApiKey?: string;
  workspace?: "solana" | "evm";
  onOpenSession: (sessionId: string) => void;
}) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!walletAddress) return;
    const evm = workspace === "evm";
    const response = await fetch(`${evm ? "/api/evm/automation" : "/api/automation"}?walletAddress=${encodeURIComponent(walletAddress)}`, { headers: evm ? (uniswapApiKey ? { "x-uniswap-api-key": uniswapApiKey } : {}) : (jupiterApiKey ? { "x-jupiter-api-key": jupiterApiKey } : {}) });
    const result = await response.json();
    if (response.ok) setStrategies(result.strategies ?? []);
  }, [jupiterApiKey, uniswapApiKey, walletAddress, workspace]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 20_000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [load]);

  async function act(action: "pause" | "resume" | "cancel" | "reject", strategyId?: string, proposalId?: string) {
    if (!walletAddress) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(workspace === "evm" ? "/api/evm/automation" : "/api/automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(workspace === "evm" ? (uniswapApiKey ? { "x-uniswap-api-key": uniswapApiKey } : {}) : (jupiterApiKey ? { "x-jupiter-api-key": jupiterApiKey } : {})) },
        body: JSON.stringify({ walletAddress, strategyId, proposalId, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : JSON.stringify(result.error));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Automation action failed."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto h-full max-w-[1000px] overflow-y-auto px-8 py-10">
    <header className="mb-7 flex items-start justify-between gap-6">
      <div><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300">{workspace === "evm" ? "Robinhood automation" : "Solana automation"}</p><h1 className="mt-2 text-4xl font-semibold text-white">Monitor & propose</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Strategies are created by the AI tool in the active wallet-bound session. This web runtime detects schedules and conditions, then delivers a fresh proposal for wallet review.</p></div>
      <span className="rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-amber-200">Wallet approval required</span>
    </header>

    {error && <p className="mb-4 rounded-lg border border-rose-400/25 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#7ba2ff]">Strategies</h2><button onClick={() => void load()} className="text-xs text-cyan-300">Refresh</button></div>
      {strategies.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">No {workspace === "evm" ? "Robinhood" : "Solana"} automation strategies yet.</div> : strategies.map((strategy) => {
        const pending = strategy.proposals.find((proposal) => proposal.status === "AWAITING_APPROVAL" || proposal.status === "PREPARED");
        return <article key={strategy.id} className="rounded-xl border border-white/10 bg-[#0d1428] p-4"><div className="flex items-start justify-between gap-4"><div><span className="font-mono text-[9px] uppercase tracking-wider text-cyan-300">{strategy.kind === "DCA" ? "DCA schedule" : "Take profit / stop loss"}</span><h3 className="mt-1 font-semibold text-white">{strategy.amount} {strategy.inputSymbol} → {strategy.outputSymbol}</h3><p className="mt-1 text-xs text-slate-500">{strategy.kind === "DCA" ? `${strategy.completedExecutions}/${strategy.maximumExecutions} cycles · every ${Math.round((strategy.intervalSeconds ?? 0) / 60)} min` : `TP ${strategy.takeProfitPriceUsd ?? "—"} · SL ${strategy.stopLossPriceUsd ?? "—"}`}</p></div><span className="rounded border border-white/10 px-2 py-1 font-mono text-[9px] text-slate-300">{strategy.status.replaceAll("_", " ")}</span></div>
          {strategy.lastError && <p className="mt-3 text-xs text-amber-300">Price monitor: {strategy.lastError}</p>}
          {pending && <div className="mt-4 flex items-center justify-between rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-3"><div><p className="flex items-center gap-2 text-sm text-cyan-100"><Zap className="size-4" /> {pending.reason.replaceAll("_", " ")} triggered</p><small className="text-slate-400">The review card is delivered automatically to the source chat session.</small>{pending.observedPriceUsd != null && <small className="block text-slate-400">Observed ${pending.observedPriceUsd.toFixed(6)}</small>}</div><div className="flex gap-2"><button disabled={busy} onClick={() => void act("reject", undefined, pending.id)} className="rounded border border-white/10 px-3 py-2 text-xs text-slate-300">Reject</button><button onClick={() => onOpenSession(strategy.sessionId)} className="primaryButton px-4 py-2 text-xs">Open review</button></div></div>}
          <footer className="mt-4 flex items-center justify-between border-t border-white/10 pt-3"><p className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="size-3.5" />{strategy.nextWakeAt ? `Next check ${new Date(strategy.nextWakeAt).toLocaleString()}` : `Expires ${new Date(strategy.expiresAt).toLocaleDateString()}`}</p><div className="flex items-center gap-3"><button onClick={() => onOpenSession(strategy.sessionId)} title="Open session"><MessageSquareText className="size-4 text-cyan-300" /></button>{strategy.status === "ACTIVE" && <button disabled={busy} onClick={() => void act("pause", strategy.id)} title="Pause"><Pause className="size-4 text-slate-400" /></button>}{strategy.status === "PAUSED" && <button disabled={busy} onClick={() => void act("resume", strategy.id)} title="Resume"><Play className="size-4 text-cyan-300" /></button>}{["ACTIVE", "PAUSED", "AWAITING_APPROVAL"].includes(strategy.status) && <button disabled={busy} onClick={() => void act("cancel", strategy.id)} title="Cancel"><Trash2 className="size-4 text-rose-300" /></button>}</div></footer>
        </article>;
      })}
    </section>
    <p className="mt-6 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="size-4 text-cyan-300" /> A trigger creates a proposal only. {workspace === "evm" ? "MetaMask or Rabby" : "Phantom or Solflare"} must still sign and broadcast every swap.</p>
  </div>;
}
