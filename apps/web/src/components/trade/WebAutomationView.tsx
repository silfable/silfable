"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Pause, Play, ShieldCheck, Trash2, Zap } from "lucide-react";

type Strategy = {
  id: string;
  sessionId: string;
  kind: "DCA" | "EXIT";
  status: string;
  inputSymbol: string;
  outputSymbol: string;
  amount: string;
  intervalSeconds?: number | null;
  maximumExecutions?: number | null;
  completedExecutions: number;
  takeProfitPriceUsd?: number | null;
  stopLossPriceUsd?: number | null;
  nextWakeAt?: number | null;
  expiresAt: number;
  lastError?: string | null;
  proposals: Array<{ id: string; reason: string; status: string; observedPriceUsd?: number | null; expiresAt: number }>;
};

type AutomationAction = "pause" | "resume" | "cancel" | "reject";

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function StrategyCard({ strategy, busy, onAction, onOpenSession }: {
  strategy: Strategy;
  busy: boolean;
  onAction: (action: AutomationAction, strategyId?: string, proposalId?: string) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const pending = strategy.proposals.find((proposal) => proposal.status === "AWAITING_APPROVAL" || proposal.status === "PREPARED");
  const prepared = pending?.status === "PREPARED";
  const maximum = strategy.maximumExecutions ?? 1;
  const progress = strategy.kind === "DCA" ? Math.min(100, Math.round((strategy.completedExecutions / maximum) * 100)) : 0;

  return (
    <article className="flex min-h-[310px] flex-col overflow-hidden rounded-[18px_46px_18px_18px] border border-[var(--line)] bg-[var(--atlas-plum)]">
      <header className="flex items-start justify-between gap-5 border-b border-[var(--line)] p-5">
        <div className="min-w-0">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--atlas-aqua)]">
            {strategy.kind === "DCA" ? "DCA schedule" : "Take profit / stop loss"}
          </span>
          <h2 className="mt-2 truncate text-xl font-semibold tracking-[-0.035em] text-[var(--paper)]">
            {strategy.amount} {strategy.inputSymbol} <span className="text-[var(--atlas-lilac)]">→</span> {strategy.outputSymbol}
          </h2>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--line)] px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--muted)]">
          {statusLabel(strategy.status)}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-5">
        {strategy.kind === "DCA" ? (
          <div className="rounded-[12px_28px_12px_12px] border border-[var(--line)] bg-[var(--atlas-night)] p-4">
            <div className="flex items-center justify-between gap-4 font-mono text-[9px] text-[var(--muted)]">
              <span>{strategy.completedExecutions} / {maximum} cycles</span>
              <span>Every {Math.max(1, Math.round((strategy.intervalSeconds ?? 0) / 60))} min</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[var(--atlas-lilac)] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px_28px_12px_12px] border border-[var(--line)] bg-[var(--line)]">
            <div className="bg-[var(--atlas-night)] p-4"><span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--muted)]">Take profit</span><strong className="mt-2 block text-lg text-[var(--paper)]">${strategy.takeProfitPriceUsd ?? "—"}</strong></div>
            <div className="bg-[var(--atlas-night)] p-4"><span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--muted)]">Stop loss</span><strong className="mt-2 block text-lg text-[var(--paper)]">${strategy.stopLossPriceUsd ?? "—"}</strong></div>
          </div>
        )}

        {strategy.lastError && !prepared && (
          <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-200">
            Route preparation: {strategy.lastError}
          </p>
        )}

        {pending && (
          <div className="rounded-[12px_28px_12px_12px] border border-[var(--atlas-aqua)]/30 bg-[var(--atlas-aqua)]/[0.055] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--atlas-aqua)]"><Zap className="size-4" /> {statusLabel(pending.reason)} triggered</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {prepared ? "A fresh route is ready in the source chat session." : strategy.lastError ? "Silfable will retry without opening your wallet." : "Silfable is preparing a fresh route."}
            </p>
            {pending.observedPriceUsd != null && <p className="mt-1 font-mono text-[9px] text-[var(--muted)]">Observed ${pending.observedPriceUsd.toFixed(6)}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => onAction("reject", undefined, pending.id)} className="rounded-full border border-[var(--line)] px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--muted)] hover:border-[var(--atlas-lilac)] hover:text-[var(--paper)]">Reject</button>
              {prepared && <button onClick={() => onOpenSession(strategy.sessionId)} className="rounded-full bg-[var(--atlas-coral)] px-5 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--atlas-night)]">Open review</button>}
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--atlas-night)]/55 px-5 py-4">
        <p className="flex items-center gap-2 text-xs text-[var(--muted)]"><Clock3 className="size-3.5 text-[var(--atlas-lilac)]" />{strategy.nextWakeAt ? `Next check ${new Date(strategy.nextWakeAt).toLocaleString()}` : `Expires ${new Date(strategy.expiresAt).toLocaleDateString()}`}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => onOpenSession(strategy.sessionId)} className="rounded-full border border-[var(--line)] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--atlas-aqua)] hover:border-[var(--atlas-aqua)]">Open session</button>
          {strategy.status === "ACTIVE" && <button disabled={busy} onClick={() => onAction("pause", strategy.id)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--muted)] hover:border-[var(--atlas-lilac)] hover:text-[var(--paper)]"><Pause className="size-3" /> Pause</button>}
          {strategy.status === "PAUSED" && <button disabled={busy} onClick={() => onAction("resume", strategy.id)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--atlas-lilac)] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--atlas-lilac)]"><Play className="size-3" /> Resume</button>}
          {!["COMPLETED", "EXPIRED"].includes(strategy.status) && <button disabled={busy} onClick={() => onAction("cancel", strategy.id)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--atlas-coral)]/40 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--atlas-coral)] hover:bg-[var(--atlas-coral)] hover:text-[var(--atlas-night)]"><Trash2 className="size-3" /> Remove</button>}
        </div>
      </footer>
    </article>
  );
}

export function WebAutomationView({ walletAddress, jupiterApiKey, uniswapApiKey, workspace = "solana", onOpenSession, onChanged }: {
  walletAddress: string | null;
  jupiterApiKey?: string;
  uniswapApiKey?: string;
  workspace?: "solana" | "evm";
  onOpenSession: (sessionId: string) => void;
  onChanged?: () => void;
}) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visibleStrategies = useMemo(() => strategies.filter((strategy) => strategy.status !== "CANCELLED"), [strategies]);

  const load = useCallback(async () => {
    if (!walletAddress) return;
    const evm = workspace === "evm";
    try {
      const response = await fetch(`${evm ? "/api/evm/automation" : "/api/automation"}?walletAddress=${encodeURIComponent(walletAddress)}`, { headers: evm ? (uniswapApiKey ? { "x-uniswap-api-key": uniswapApiKey } : {}) : (jupiterApiKey ? { "x-jupiter-api-key": jupiterApiKey } : {}) });
      const result = await response.json() as { strategies?: Strategy[]; error?: unknown };
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Automation strategies could not be loaded.");
      setStrategies(result.strategies ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Automation strategies could not be loaded.");
    }
  }, [jupiterApiKey, uniswapApiKey, walletAddress, workspace]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 20_000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [load]);

  async function act(action: AutomationAction, strategyId?: string, proposalId?: string) {
    if (!walletAddress) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(workspace === "evm" ? "/api/evm/automation" : "/api/automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(workspace === "evm" ? (uniswapApiKey ? { "x-uniswap-api-key": uniswapApiKey } : {}) : (jupiterApiKey ? { "x-jupiter-api-key": jupiterApiKey } : {})) },
        body: JSON.stringify({ walletAddress, strategyId, proposalId, action }),
      });
      const result = await response.json() as { error?: unknown };
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : JSON.stringify(result.error));
      if (action === "cancel" && strategyId) setStrategies((current) => current.filter((strategy) => strategy.id !== strategyId));
      else await load();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Automation action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto h-full max-w-[1320px] overflow-y-auto px-6 py-8 lg:px-10 lg:py-10">
      <header className="mb-8 grid gap-6 border-b border-[var(--line)] pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--atlas-aqua)]">{workspace === "evm" ? "Robinhood automation" : "Solana automation"}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] text-[var(--paper)] lg:text-5xl">Monitor & propose</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">Schedules and market conditions become bounded proposals. Every resulting transaction remains separate and requires wallet approval.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-amber-200">Wallet approval required</span>
          <button onClick={() => void load()} className="rounded-full border border-[var(--atlas-lilac)]/45 px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--atlas-lilac)] hover:bg-[var(--atlas-lilac)]/10">Refresh routes</button>
        </div>
      </header>

      {error && <p className="mb-5 rounded-[12px_28px_12px_12px] border border-[var(--atlas-coral)]/35 bg-[var(--atlas-coral)]/[0.07] p-4 text-sm text-[var(--atlas-coral)]">{error}</p>}

      {visibleStrategies.length === 0 ? (
        <div className="grid min-h-64 place-items-center rounded-[20px_58px_20px_20px] border border-dashed border-[var(--line)] bg-[var(--atlas-plum)]/45 p-8 text-center">
          <div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--atlas-lilac)]">No active routes</p><p className="mt-3 text-sm text-[var(--muted)]">Create a DCA or TP/SL strategy from a wallet-bound chat session.</p></div>
        </div>
      ) : (
        <section className="grid items-start gap-4 xl:grid-cols-2">
          {visibleStrategies.map((strategy) => <StrategyCard key={strategy.id} strategy={strategy} busy={busy} onAction={(action, strategyId, proposalId) => void act(action, strategyId, proposalId)} onOpenSession={onOpenSession} />)}
        </section>
      )}

      <p className="mt-7 flex items-center gap-2 border-t border-[var(--line)] pt-5 text-xs text-[var(--muted)]"><ShieldCheck className="size-4 text-[var(--atlas-aqua)]" /> Monitoring can prepare a proposal, but {workspace === "evm" ? "MetaMask or Rabby" : "Phantom or Solflare"} must approve every swap.</p>
    </div>
  );
}
