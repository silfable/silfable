// @ts-nocheck
import { useEffect, useState } from "react";
import { Play, Pause, XCircle, RefreshCw, Bot, Clock, Timer, Layers, MessageSquare } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Card, CardHeader, CardTitle, CardContent } from "./Card";
import { EmergencyStopPanel } from "../workspace/WorkspacePanels";

type Strategy = {
  id: string;
  sessionId?: string;
  kind: "DCA" | "EXIT";
  status: "ACTIVE" | "PAUSED" | "AWAITING_APPROVAL" | "EXPIRED" | "CANCELLED" | "EMERGENCY_STOPPED";
  inputMint: string;
  outputMint: string;
  nextWakeAt: string | null;
  pausedRemainingMs?: number | null;
  lastEvaluatedAt: string | null;
  createdAt: string;
  orderAmountRaw?: string;
  maximumTotalRaw?: string;
  intervalSeconds?: number;
  completedExecutions?: number;
  maximumExecutions?: number;
  amountRaw?: string;
  entryPriceUsd?: number;
  stopLossPriceUsd?: number | null;
  takeProfitPriceUsd?: number | null;
  trailingStopPercent?: number | null;
};

type Proposal = {
  id: string;
  strategyId: string;
  sessionId?: string;
  reason: "DCA_DUE" | "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING_STOP";
  observedPriceUsd: number | null;
  status: "AWAITING_APPROVAL" | "REJECTED" | "CONSUMED" | "EXPIRED";
  createdAt: string;
};

const KNOWN_TOKENS: Record<string, string> = {
  "So11111111111111111111111111111111111111112": "SOL",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
  "0x0000000000000000000000000000000000000000": "ETH",
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": "USDG",
};

export function AutomationPanel({
  sessionId,
  fullAccessSessionIds = [],
  onReloadSessions,
  onSelectSession,
}: {
  sessionId?: string;
  fullAccessSessionIds?: string[];
  onReloadSessions?: () => Promise<void>;
  onSelectSession?: (sessionId: string) => void;
}) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [filterMode, setFilterMode] = useState<"ALL" | "SESSION">("ALL");

  const fetchAutomationData = async () => {
    try {
      setLoading(true);
      if ((window as any).silfable?.listAutomationStrategies) {
        const res = await (window as any).silfable.listAutomationStrategies();
        setStrategies(res.strategies as Strategy[]);
        setProposals(res.proposals as Proposal[]);
      }
    } catch (err) {
      console.error("Failed to load automation strategies:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomationData();
    const interval = setInterval(fetchAutomationData, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleStatusChange = async (id: string, action: "PAUSE" | "RESUME" | "CANCEL" | "APPROVE_PROPOSAL" | "REJECT_PROPOSAL") => {
    try {
      setActionLoading(id);
      if ((window as any).silfable?.setAutomationStatus) {
        await (window as any).silfable.setAutomationStatus({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          id,
          sessionId,
          action,
        });
        await fetchAutomationData();
        if (action === "APPROVE_PROPOSAL" && onReloadSessions) {
          await onReloadSessions();
        }
      }
    } catch (err) {
      console.error(`Failed to ${action} strategy:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: Strategy["status"], fullAccess = false) => {
    if (fullAccess && status === "AWAITING_APPROVAL") {
      return <Badge variant="info">Processing</Badge>;
    }
    switch (status) {
      case "ACTIVE":
        return <Badge variant="success">Active</Badge>;
      case "PAUSED":
        return <Badge variant="warning">Paused</Badge>;
      case "AWAITING_APPROVAL":
        return <Badge variant="info">Awaiting Approval</Badge>;
      case "CANCELLED":
        return <Badge variant="danger">Cancelled</Badge>;
      case "EXPIRED":
        return <Badge variant="neutral">Expired</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const truncate = (str: string, length = 12) => {
    if (!str) return "";
    return str.length > length ? `${str.slice(0, 6)}...${str.slice(-4)}` : str;
  };

  const getSymbol = (mint: string) => {
    if (!mint) return "???";
    return KNOWN_TOKENS[mint] || truncate(mint, 8);
  };

  const formatPair = (inputMint: string, outputMint: string) => {
    return `${getSymbol(inputMint)} ➔ ${getSymbol(outputMint)}`;
  };

  const formatOrderAmount = (rawAmount?: string, inputMint?: string) => {
    if (!rawAmount) return "-";
    const num = Number(rawAmount);
    if (isNaN(num)) return rawAmount;
    if (inputMint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" || (!inputMint && num >= 1000)) {
      const formatted = (num / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
      return `${formatted} USDC`;
    }
    if (inputMint?.toLowerCase() === "0x5fc5360d0400a0fd4f2af552add042d716f1d168") return `${(num / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDG`;
    if (inputMint?.toLowerCase() === "0x0000000000000000000000000000000000000000") return `${(num / 1_000_000_000_000_000_000).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })} ETH`;
    return `${num.toLocaleString()} raw units`;
  };

  const formatCountdown = (nextWakeAt: string | null, status: Strategy["status"], pausedRemainingMs?: number | null) => {
    const diffMs = status === "PAUSED" && typeof pausedRemainingMs === "number"
      ? pausedRemainingMs
      : status === "ACTIVE" && nextWakeAt
        ? Date.parse(nextWakeAt) - currentTime
        : null;
    if (diffMs === null) return null;
    if (diffMs <= 0) return "Evaluating now...";
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    const value = hours > 0 ? `${hours}h ${pad(mins)}m ${pad(secs)}s` : `${pad(mins)}:${pad(secs)}`;
    return status === "PAUSED" ? `Paused · ${value}` : value;
  };

  const currentSessionStrategies = sessionId
    ? strategies.filter(s => s.sessionId === sessionId || !s.sessionId)
    : strategies;

  const displayStrategies = filterMode === "SESSION" && sessionId
    ? currentSessionStrategies
    : strategies;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Bot className="h-6 w-6 text-emerald-400" />
            Autonomous Capital Execution
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Background strategies (DCA, Take Profit, Stop Loss) executed autonomously by system workers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setFilterMode("ALL")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterMode === "ALL"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              All Sessions ({strategies.filter(s => s.status !== "CANCELLED").length})
            </button>
            {sessionId && (
              <button
                onClick={() => setFilterMode("SESSION")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  filterMode === "SESSION"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Current Session ({currentSessionStrategies.filter(s => s.status !== "CANCELLED").length})
              </button>
            )}
          </div>

          <EmergencyStopPanel compact onChanged={fetchAutomationData} />
          <Button variant="outline" size="sm" onClick={fetchAutomationData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-xs text-emerald-200/90 flex items-start gap-3">
        <Bot className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-emerald-300">How to Create Strategies:</span> Ask the AI Assistant in chat.
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Active Strategies ({displayStrategies.filter(s => s.status !== "CANCELLED").length})
          </h3>
        </div>

        {displayStrategies.filter(s => s.status !== "CANCELLED").length === 0 ? (
          <Card className="p-8 text-center border-dashed border-slate-800 bg-slate-900/30">
            <Clock className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">No Active Strategies</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayStrategies.filter(s => s.status !== "CANCELLED").map((strategy) => {
              const matchingProposal = proposals.find(p => p.strategyId === strategy.id && p.status === "AWAITING_APPROVAL");
              const isFullAccessStrategy = strategy.sessionId !== undefined && fullAccessSessionIds.includes(strategy.sessionId);
              const countdown = formatCountdown(strategy.nextWakeAt, strategy.status, strategy.pausedRemainingMs);
              return (
                <Card 
                  key={strategy.id} 
                  variant="elevated" 
                  className={`relative border-slate-800/80 bg-slate-900/60 transition-all ${strategy.sessionId && onSelectSession ? "cursor-pointer hover:border-emerald-500/50" : ""}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    if (strategy.sessionId && onSelectSession) {
                      onSelectSession(strategy.sessionId);
                    }
                  }}
                >
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        {strategy.kind}
                      </span>
                      <CardTitle className="text-sm font-bold text-slate-100 font-mono tracking-wide">
                        {formatPair(strategy.inputMint, strategy.outputMint)}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(strategy.status, isFullAccessStrategy)}
                      {strategy.sessionId && onSelectSession && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-[11px] text-emerald-400 hover:text-emerald-300"
                          onClick={() => onSelectSession(strategy.sessionId!)}
                        >
                          Session →
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-slate-300">
                    {strategy.kind === "DCA" && (
                      <>
                        <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                          <span className="text-slate-400">Progress:</span>
                          <span className="font-semibold text-slate-200">{strategy.completedExecutions ?? 0} / {strategy.maximumExecutions ?? "-"}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                          <span className="text-slate-400">Amount:</span>
                          <span className="font-mono text-emerald-300 font-semibold">{formatOrderAmount(strategy.orderAmountRaw, strategy.inputMint)}</span>
                        </div>
                        {countdown && (
                          <div className="flex justify-between pb-1.5 items-center">
                            <span className="text-slate-400 flex items-center gap-1">
                              <Timer className="h-3.5 w-3.5 text-emerald-400" /> Next:
                            </span>
                            <span className="font-mono text-emerald-300 font-bold bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30">{countdown}</span>
                          </div>
                        )}
                      </>
                    )}
                    {strategy.kind === "EXIT" && (
                      <>
                        <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                          <span className="text-slate-400">Entry Price:</span>
                          <span className="font-mono text-slate-200">${strategy.entryPriceUsd}</span>
                        </div>
                        {countdown && (
                          <div className="flex justify-between pb-1.5 items-center">
                            <span className="text-slate-400 flex items-center gap-1">
                              <Timer className="h-3.5 w-3.5 text-emerald-400" /> Next:
                            </span>
                            <span className="font-mono text-emerald-300 font-bold bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30">{countdown}</span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="pt-3 flex gap-2 justify-end items-center flex-wrap">
                      {matchingProposal && isFullAccessStrategy ? (
                        <span className="text-[11px] font-mono text-emerald-300">Full Access processing</span>
                      ) : matchingProposal ? (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium" disabled={actionLoading === matchingProposal.id} onClick={() => handleStatusChange(matchingProposal.id, "APPROVE_PROPOSAL")}>
                          <Play className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                      ) : strategy.status === "ACTIVE" ? (
                        <Button size="sm" variant="secondary" disabled={actionLoading === strategy.id} onClick={() => handleStatusChange(strategy.id, "PAUSE")}>
                          <Pause className="h-3.5 w-3.5 mr-1 text-amber-400" /> Pause
                        </Button>
                      ) : strategy.status === "PAUSED" ? (
                        <Button size="sm" variant="secondary" disabled={actionLoading === strategy.id} onClick={() => handleStatusChange(strategy.id, "RESUME")}>
                          <Play className="h-3.5 w-3.5 mr-1 text-emerald-400" /> Resume
                        </Button>
                      ) : null}
                      <Button size="sm" variant="destructive" disabled={actionLoading === strategy.id} onClick={() => handleStatusChange(strategy.id, "CANCEL")}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
