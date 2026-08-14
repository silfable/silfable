// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, ArrowUp, Bot, Brain, CirclePlus, Settings, ShieldCheck, Target, ShieldAlert, Sparkles, Zap, KeyRound, KeySquare, ChevronRight, MessageSquare, History, List, X, Flame } from 'lucide-react';
import { Button, Modal, Input, Badge } from '../ui';
import { shorten, cn } from '../../lib/utils';
import { formatEvmTokenAmount, formatWeiToGweiOrEth, formatRuntimeTokens, formatPortfolioUsd, portfolioAssetUsd, formatPortfolioAmount, formatPumpMetric, formatPumpPercent, formatPumpBps, formatPumpRawAmount } from '../../lib/formatters';
import { StatusPill, Notice, Field, SetupCard, SetupActions, Brand, BrandMark, CornerFooter, RailSection, ProviderCard } from '../setup/SetupHelpers';
import { ACTIVITY_LEVELS, INTEGRATION_CATEGORIES, SETUP_STEPS, STORAGE_KEY } from '../types';
import type { BridgePreflightEvidence, BridgeProposal, BridgeReceipt, BridgeDestinationChain, EmergencyStopStatus, EvmBridgeContract, EvmBridgePreflight, EvmBridgeQuote, EvmBridgeReceipt, EvmChainKey, EvmPortfolioSnapshot, EvmSessionExecutionReceipt, EvmSwapPreflightEvidence, EvmSwapProposal, LimitOrderCancelSimulation, LimitOrderContractPreview, LimitOrderExecutionReceipt, LimitOrderSimulationPreview, LegacyPumpLaunchMetadataPackage, MissionContractPreview, MissionExecutionReceipt, MissionSimulationPreview, OpenRouterModelView, PortfolioSnapshot, PumpExecutionRecord, PumpFinalRevalidation, PumpLaunchDraft, PumpLaunchDraftInput, PumpLaunchMetadata, PumpLaunchPreflight, PumpLaunchFinalRevalidation, PumpLaunchExecutionRecord, PumpRiskSettings, PumpSimulationArtifact, PumpTokenIntelligence, PumpTradeContractPreview, RuntimeStatus, SessionRecord, TransactionSettings, WalletActivitySnapshot, SetupState, AgentSettings } from '@silfable/contracts';
import { BRIDGE_ARBITRUM_CHAIN_ID, BRIDGE_ARBITRUM_USDC_ADDRESS, BRIDGE_AVALANCHE_CHAIN_ID, BRIDGE_AVALANCHE_USDC_ADDRESS, BRIDGE_BASE_CHAIN_ID, BRIDGE_BASE_USDC_ADDRESS, BRIDGE_ETHEREUM_CHAIN_ID, BRIDGE_ETHEREUM_USDC_ADDRESS, BRIDGE_OPTIMISM_CHAIN_ID, BRIDGE_OPTIMISM_USDC_ADDRESS, BRIDGE_POLYGON_CHAIN_ID, BRIDGE_POLYGON_USDC_ADDRESS, BRIDGE_ROBINHOOD_CHAIN_ID, BRIDGE_ROBINHOOD_USDG_ADDRESS, BRIDGE_SOLANA_CHAIN_ID, BRIDGE_SOLANA_USDC_MINT } from '@silfable/contracts';
import { UnifiedPortfolioRail } from './UnifiedPortfolioRail';

export function EmergencyStopPanel({
  onChanged,
  compact = false,
}: {
  onChanged?: () => void | Promise<void>;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<EmergencyStopStatus | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    window.silfable.getEmergencyStop()
      .then((response) => setStatus(response.status))
      .catch(() => setMessage("Emergency-stop status could not be loaded."));
  }, []);

  async function engage(): Promise<void> {
    if (!acknowledged || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await window.silfable.engageEmergencyStop({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        reason,
        acknowledgedImmediateHalt: true,
      });
      setStatus(response.status);
      setAcknowledged(false);
      setMessage("Emergency stop engaged. New execution and final revalidation requests are blocked.");
      await onChanged?.();
    } catch (error) {
      setMessage(friendlyError(error, "Emergency stop could not be engaged."));
    } finally {
      setBusy(false);
    }
  }

  async function release(): Promise<void> {
    if (!acknowledged || password.length === 0 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await window.silfable.releaseEmergencyStop({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        masterPassword: password,
        acknowledgedResumeRisk: true,
      });
      setStatus(response.status);
      setPassword("");
      setAcknowledged(false);
      setMessage("Emergency stop released. Monitoring remains stopped until explicitly restarted.");
      await onChanged?.();
    } catch (error) {
      setMessage(friendlyError(error, "Emergency stop could not be released."));
    } finally {
      setBusy(false);
    }
  }

  const engaged = status?.engaged === true;
  const content = (
    <section className={`emergencyStopPanel ${engaged ? "engaged" : ""}`}>
      <div>
        <strong>Global emergency stop</strong>
        <StatusPill tone={engaged ? "danger" : "success"}>
          {status === null ? "Loading" : engaged ? "Engaged" : "Ready"}
        </StatusPill>
      </div>
      <p>
        Immediately clears prepared Pump transactions, stops local strategy monitoring,
        and blocks final revalidation and every supported execution handler. Pending
        signatures remain reconciliation-only and are never rebroadcast.
      </p>
      {engaged ? (
        <>
          <small>
            Engaged {status.engagedAt ? new Date(status.engagedAt).toLocaleString() : ""}
            {status.reason ? ` · ${status.reason}` : ""}
          </small>
          <Field label="Master password to release">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </Field>
        </>
      ) : (
        <Field label="Reason (optional)">
          <input
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Manual safety halt"
          />
        </Field>
      )}
      <label className="checkRow">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        <span>
          {engaged
            ? "I understand that releasing this gate allows new manually approved execution requests."
            : "I understand that this immediately invalidates prepared transactions and stops monitoring."}
        </span>
      </label>
      <button
        type="button"
        className={engaged ? "secondaryButton" : "dangerButton"}
        disabled={!acknowledged || busy || (engaged && password.length === 0)}
        onClick={() => void (engaged ? release() : engage())}
      >
        {busy ? "Working…" : engaged ? "Release emergency stop" : "Engage emergency stop"}
      </button>
      {message && <p className="inlineMessage">{message}</p>}
    </section>
  );

  if (!compact) return content;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
          engaged
            ? "border-red-400/50 bg-red-500/15 text-red-200 hover:bg-red-500/25"
            : "border-red-500/35 bg-red-500/10 text-red-200 hover:border-red-400/60 hover:bg-red-500/20"
        }`}
      >
        <ShieldAlert className="size-3.5" />
        {engaged ? "Emergency stop active" : "Emergency stop"}
      </button>
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={engaged ? "Emergency stop active" : "Engage emergency stop"}
        subtitle="This control is global to the local desktop runtime."
        maxWidth="720px"
      >
        {content}
      </Modal>
    </>
  );
}
export function MissionsView({
  items,
  onOpen,
}: {
  items: Array<{
    sessionId: string;
    sessionTitle: string;
    preview: MissionContractPreview;
  }>;
  onOpen: (sessionId: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "ready" | "blocked" | "expired">("all");
  const effectiveStatus = (preview: MissionContractPreview): "ready" | "blocked" | "expired" => Date.parse(preview.deadlineAt) <= Date.now() ? "expired" : preview.status === "blocked" ? "blocked" : "ready";
  const readyCount = items.filter((item) => effectiveStatus(item.preview) === "ready").length;
  const blockedCount = items.filter((item) => effectiveStatus(item.preview) === "blocked").length;
  const expiredCount = items.length - readyCount - blockedCount;
  const visibleItems = items
    .filter((item) => filter === "all" || effectiveStatus(item.preview) === filter)
    .sort((left, right) => Date.parse(right.preview.createdAt) - Date.parse(left.preview.createdAt));
  const short = (value: string) => value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-6)}` : value;
  const deadlineLabel = (value: string) => {
    const deadline = Date.parse(value);
    if (!Number.isFinite(deadline)) return "Unknown";
    if (deadline <= Date.now()) return "Expired";
    const minutes = Math.max(1, Math.round((deadline - Date.now()) / 60_000));
    return minutes < 60 ? `${minutes}m remaining` : minutes < 1_440 ? `${Math.round(minutes / 60)}h remaining` : `${Math.round(minutes / 1_440)}d remaining`;
  };
  if (items.length === 0)
    return (
      <UtilityView
        eyebrow="Missions"
        title="No mission contracts yet."
        copy="Create a Mission session and provide exact token mints, raw amount, slippage limit, deadline, and stop conditions."
      />
    );
  return (
    <div className="missionsView">
      <header className="missionsHeader">
        <div><p className="kicker">Mission atlas</p><h1>Review routes before execution.</h1><p>Inspect quote evidence, policy limits, and blocked checks. Opening a mission never executes it; simulation and approval remain separate.</p></div>
        <dl className="missionSummary"><div><dt>Total</dt><dd>{items.length}</dd></div><div><dt>Ready</dt><dd>{readyCount}</dd></div><div><dt>Blocked</dt><dd>{blockedCount}</dd></div><div><dt>Expired</dt><dd>{expiredCount}</dd></div></dl>
      </header>
      <div className="missionToolbar" aria-label="Filter mission previews">
        {(["all", "ready", "blocked", "expired"] as const).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? `All · ${items.length}` : value === "ready" ? `Ready · ${readyCount}` : value === "blocked" ? `Blocked · ${blockedCount}` : `Expired · ${expiredCount}`}</button>)}
      </div>
      <div className="missionLedger">
        {visibleItems.map((item, index) => {
          const preview = item.preview;
          const status = effectiveStatus(preview);
          const failedCheck = preview.checks.find((check) => check.status === "fail");
          const passedChecks = preview.checks.filter((check) => check.status === "pass").length;
          return <button key={preview.id} className={`missionLedgerRow ${status === "blocked" ? "isBlocked" : status === "expired" ? "isExpired" : "isReady"}`} onClick={() => onOpen(item.sessionId)}>
            <span className="missionIndex">{String(index + 1).padStart(2, "0")}</span>
            <div className="missionRoute">
              <span>{status === "blocked" ? "Blocked route" : status === "expired" ? "Expired route" : "Ready for review"}</span>
              <strong>{short(preview.inputMint)} <ChevronRight aria-hidden="true" /> {short(preview.outputMint)}</strong>
              <small>{preview.goal.replace(/\b[1-9A-HJ-NP-Za-km-z]{24,44}\b/gu, (value) => short(value))}</small>
            </div>
            <dl className="missionFacts">
              <div><dt>Raw input</dt><dd>{preview.inputAmount}</dd></div>
              <div><dt>Slippage</dt><dd>{preview.maxSlippageBps} bps</dd></div>
              <div><dt>Deadline</dt><dd>{deadlineLabel(preview.deadlineAt)}</dd></div>
              <div><dt>Checks</dt><dd>{passedChecks}/{preview.checks.length} pass</dd></div>
            </dl>
            <div className="missionEvidence">
              <span>{preview.quote ? `${preview.quote.router} · quote ${short(preview.quote.outAmount)}` : "Quote unavailable"}</span>
              <small>{failedCheck?.message ?? `${preview.stopConditions.length} stop condition${preview.stopConditions.length === 1 ? "" : "s"} · ${item.sessionTitle}`}</small>
            </div>
            <span className="missionOpen">Open <ChevronRight aria-hidden="true" /></span>
          </button>;
        })}
      </div>
    </div>
  );
}
export function RightRail({
  session,
  runtime,
  model,
  contextLimit,
  outputLimit,
  wallets,
  evmWallets,
  refreshToken,
  onAnalyzePump,
  onScanPump,
  onReloadSessions,
}: {
  session: SessionItem | null;
  runtime: RuntimeStatus | null;
  model: string;
  contextLimit: number;
  outputLimit: number;
  wallets: WalletSummary[];
  evmWallets: WalletSummary[];
  refreshToken: number;
  onAnalyzePump?: ((mint: string) => void) | undefined;
  onScanPump?: (() => void) | undefined;
  onReloadSessions?: (() => Promise<void>) | undefined;
}) {
  const isEvmSession = session?.walletScope === "evm";
  const visibleWallet =
    session?.walletAddress ??
    (session ? null : wallets.find((wallet) => wallet.primary)?.address) ??
    null;
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [activity, setActivity] = useState<WalletActivitySnapshot | null>(null);
  const [activityState, setActivityState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [activePositions, setActivePositions] = useState<any[]>([]);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [tpPercent, setTpPercent] = useState("");
  const [slPercent, setSlPercent] = useState("");

  const [automationStrategies, setAutomationStrategies] = useState<any[]>([]);
  const [automationProposals, setAutomationProposals] = useState<any[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const automationSnapshotRef = useRef<string | null>(null);

  const fetchAutomation = useCallback(async () => {
    try {
      if ((window as any).silfable?.listAutomationStrategies) {
        const res = await (window as any).silfable.listAutomationStrategies();
        const strategies = res.strategies || [];
        const proposals = res.proposals || [];
        const snapshot = JSON.stringify({ strategies, proposals });
        const changed = automationSnapshotRef.current !== null && automationSnapshotRef.current !== snapshot;
        automationSnapshotRef.current = snapshot;
        setAutomationStrategies(strategies);
        setAutomationProposals(proposals);
        // Main-process Full Access execution updates the encrypted conversation.
        // Reload only when automation state actually changes so the confirmed
        // receipt/card appears without polling the entire session continuously.
        if (changed && onReloadSessions) await onReloadSessions();
      }
    } catch (err) {
      console.error("Failed to load automation in RightRail:", err);
    }
  }, [onReloadSessions]);

  useEffect(() => {
    fetchAutomation();
    const interval = setInterval(fetchAutomation, 4000);
    return () => clearInterval(interval);
  }, [fetchAutomation]);

  const handleApproveProposal = async (proposalId: string) => {
    // Full Access proposals are consumed by the local dispatcher.  Do not let a
    // stale renderer instance invoke the legacy manual-approval IPC path.
    if (session?.permission === "full") {
      return;
    }

    try {
      setActionLoadingId(proposalId);
      if ((window as any).silfable?.setAutomationStatus) {
        await (window as any).silfable.setAutomationStatus({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          id: proposalId,
          sessionId: session?.id,
          action: "APPROVE_PROPOSAL",
        });
        await fetchAutomation();
        if (onReloadSessions) {
          await onReloadSessions();
        }
      }
    } catch (err) {
      console.error("Failed to approve proposal:", err);
    } finally {
      setActionLoadingId(null);
    }
  };
  
  const pumpConfig = session?.workspace === "pump" ? session.pumpConfig : undefined;
  const activePosition = activePositions.find(p => p.mintAddress === pumpConfig?.tokenMint);
  // The automation store is process-wide, while this rail represents exactly
  // one selected session. Never leak an automation (or its approval state)
  // from another wallet/session into the active rail.
  const visibleAutomationStrategies = automationStrategies.filter((strategy) => {
    if (!session) return false;
    return (
      strategy.sessionId === session.id ||
      automationProposals.some(
        (proposal) => proposal.strategyId === strategy.id && proposal.sessionId === session.id,
      )
    );
  });
  const lastTurnInputTokens = session?.usage.input ?? 0;
  const safeContextLimit = Math.max(contextLimit, 1);
  const contextPercent = Math.min(100, Math.round((lastTurnInputTokens / safeContextLimit) * 100));

  useEffect(() => {
    if (runtime?.keystore !== "unlocked") return;
    let active = true;
    const fetchPositions = async () => {
      try {
        const result = await window.silfable.getActivePositions();
        if (active) setActivePositions(result.positions);
      } catch (err) {
        console.error("Failed to fetch active positions", err);
      }
    };
    fetchPositions();
    const interval = setInterval(fetchPositions, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [runtime?.keystore]);


  const minimumPortfolioSlot = useMemo(() => session?.messages.reduce((highest, message) => {
    const receipt = message.missionExecution;
    return receipt?.status === "confirmed" && receipt.chainSlot !== null && receipt.chainSlot !== undefined
      ? Math.max(highest, receipt.chainSlot)
      : highest;
  }, 0) ?? 0, [session]);
  useEffect(() => {
    let active = true;
    if (!visibleWallet || isEvmSession || !pumpConfig) {
      setPortfolio(null);
      return () => {
        active = false;
      };
    }
     void (async () => {
      try {
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const response = await window.silfable.getPortfolio({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            address: visibleWallet,
          });
          if (!active) return;
          if (response.snapshot.slot >= minimumPortfolioSlot) {
            setPortfolio((current) => current?.address === response.snapshot.address && current.slot > response.snapshot.slot ? current : response.snapshot);
            return;
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 750));
        }
      } catch { /* Pump position evidence remains unavailable until the next refresh. */ }
    })();
    return () => {
      active = false;
    };
  }, [visibleWallet, isEvmSession, pumpConfig, refreshToken, minimumPortfolioSlot]);
  useEffect(() => {
    let active = true;
    setActivity(null);
    if (!session || !visibleWallet || isEvmSession) {
      setActivityState("idle");
      return () => {
        active = false;
      };
    }
    setActivityState("loading");
    window.silfable
      .getWalletActivity({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        address: visibleWallet,
        limit: 10,
      })
      .then((response) => {
        if (active) {
          setActivity(response.activity);
          setActivityState("ready");
        }
      })
      .catch(() => {
        if (active) setActivityState("error");
      });
    return () => {
      active = false;
    };
  }, [session?.id, visibleWallet, isEvmSession, refreshToken]);
  function copyAddress(address: string): void {
    void copyWalletAddress(address).then(() => {
      setCopiedAddress(address);
      window.setTimeout(
        () =>
          setCopiedAddress((current) => (current === address ? null : current)),
        1600,
      );
    });
  }
  const latestPumpPreview = session?.messages
    .slice()
    .reverse()
    .find((message) => message.pumpTradePreview)?.pumpTradePreview;
  const latestPumpIntelligence: PumpTokenIntelligence | undefined = session?.messages
    .slice()
    .reverse()
    .find((message) => message.pumpTokenIntelligence && pumpConfig?.scope === "exact-mint" && message.pumpTokenIntelligence.mint === pumpConfig.tokenMint)?.pumpTokenIntelligence;
  const latestPumpDiscovery = session?.messages
    .slice()
    .reverse()
    .find((message) => message.pumpDiscoverySnapshot)?.pumpDiscoverySnapshot;
  const pumpWatchlistEvidence = new Map<string, PumpTokenIntelligence>();
 for (const message of session?.messages.slice().reverse() ?? []) {
    const evidence = message.pumpTokenIntelligence;
    if (evidence && pumpConfig?.watchlistMints?.includes(evidence.mint) && !pumpWatchlistEvidence.has(evidence.mint)) {
      pumpWatchlistEvidence.set(evidence.mint, evidence);
    }
  }
  const pumpAsset = pumpConfig?.tokenMint
    ? portfolio?.assets.find((asset) => asset.mint === pumpConfig.tokenMint)
    : undefined;
  return (
    <aside className="rightRail">
      <div className="rightTop">
        <span>MAINNET</span>
        <strong>{runtime?.networkHealth ?? "unknown"}</strong>
      </div>
      {pumpConfig && (
        <>
          <RailSection title={pumpConfig.scope === "discovery" ? "Market scanner" : latestPumpPreview ? "Trade preview" : "Token intelligence"}>
            <div className="pumpRailStatus">
              <span>PUMP.FUN</span>
              <strong>{pumpConfig.lifecycle.replace("-", " ")}</strong>
            </div>
            <span className="totalLabel">{pumpConfig.scope === "watchlist" ? "Read-only watchlist" : pumpConfig.scope === "discovery" ? "Recent finalized candidates" : "Exact token mint"}</span>
            <div className="pumpMintLine">
              <strong>{pumpConfig.tokenMint ? shorten(pumpConfig.tokenMint) : pumpConfig.scope === "discovery" ? `${latestPumpDiscovery?.candidates.length ?? 0} verified candidates` : `${pumpConfig.watchlistMints?.length ?? 0} tracked mints`}</strong>
              {pumpConfig.tokenMint && (
                <button onClick={() => copyAddress(pumpConfig.tokenMint!)}>
                  {copiedAddress === pumpConfig.tokenMint ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            {pumpConfig.scope === "discovery" && (
              <div className="pumpWatchlistRail">
                <button className="railRetry" onClick={() => onScanPump?.()}>Scan finalized activity</button>
                {latestPumpDiscovery?.candidates.map((candidate) => {
                  const eligibility = candidate.intelligence.researchEligibility;
                  return (
                    <div key={candidate.mint} className="pumpWatchlistItem">
                      <div>
                        <strong>{shorten(candidate.mint)}</strong>
                        <span className={eligibility?.rankingAllowed ? "safe" : "risk"}>{eligibility?.rankingAllowed ? "Ranking eligible" : "Blocked"}</span>
                          </div>
                      <small>{candidate.intelligence.venue} · slot {candidate.intelligence.slot.toLocaleString()}</small>
                      <small>{candidate.signals.map((signal) => signal.replaceAll("-", " ")).join(" · ")}</small>
                      {eligibility && (
                        <details className="pumpEligibilityDetails">
                          <summary>{eligibility.checks.filter((check) => check.passed).length}/10 deterministic checks</summary>
                          <ul>{eligibility.checks.filter((check) => !check.passed).map((check) => <li key={check.id}>{check.message}</li>)}</ul>
                        </details>
                      )}
                      <div><button onClick={() => copyAddress(candidate.mint)}>{copiedAddress === candidate.mint ? "Copied" : "Copy mint"}</button></div>
                    </div>
                  );
                })}
                {latestPumpDiscovery && latestPumpDiscovery.candidates.length === 0 && <p>No independently verified candidates were found in this bounded scan.</p>}
                <p>{latestPumpDiscovery?.disclosure ?? "Manual scan only. No persistent monitoring, ranking, proposal, signature, or broadcast is started."}</p>
              </div>
            )}
             {pumpConfig.scope === "watchlist" && (
              <div className="pumpWatchlistRail">
                {pumpConfig.watchlistMints?.map((mint) => {
                  const evidence = pumpWatchlistEvidence.get(mint);
                  const eligibility = evidence?.researchEligibility;
                  const stale = eligibility !== undefined
                    && Date.now() - Date.parse(eligibility.evaluatedAt) > eligibility.thresholds.maxEvidenceAgeMs;
                  const blocked = eligibility !== undefined && (eligibility.status === "blocked" || stale);
                  const eligibilityLabel = stale
                    ? "Stale - refresh"
                    : eligibility?.status === "eligible"
                      ? "Ranking eligible"
                      : eligibility?.status === "blocked"
                        ? "Research blocked"
                        : "Awaiting eligibility";
                  return (
                    <div key={mint} className="pumpWatchlistItem">
                      <div>
                        <strong>{shorten(mint)}</strong>
                        <span className={evidence ? (blocked ? "risk" : "safe") : ""}>
                          {evidence ? eligibilityLabel : "Awaiting analysis"}
                        </span>
                      </div>
                      <small>{evidence ? `${evidence.venue} · slot ${evidence.slot.toLocaleString()}` : "No finalized evidence saved"}</small>
                      {eligibility && (
                        <details className="pumpEligibilityDetails">
                          <summary>{eligibility.checks.filter((check) => check.passed).length}/10 deterministic checks</summary>
                          <ul>{eligibility.checks.filter((check) => !check.passed).map((check) => <li key={check.id}>{check.message}</li>)}</ul>
                        </details>
                      )}
                      <div>
                        <button onClick={() => copyAddress(mint)}>{copiedAddress === mint ? "Copied" : "Copy"}</button>
                        <button onClick={() => onAnalyzePump?.(mint)}>{evidence ? "Refresh" : "Analyze"}</button>
                      </div>
                    </div>
                  );
                })}
                  <p>Watchlist analysis is read-only. Research eligibility does not authorize a trade proposal, signature, or broadcast.</p>
              </div>
            )}
            <dl className="pumpFacts">
              <div><dt>Scope</dt><dd>{pumpConfig.scope}</dd></div>
              <div><dt>Objective</dt><dd>{pumpConfig.objective.replace("-", " ")}</dd></div>
              <div><dt>Venue</dt><dd>{latestPumpPreview?.venue ?? latestPumpIntelligence?.venue ?? "Awaiting analysis"}</dd></div>
              <div><dt>Status</dt><dd>{latestPumpPreview?.status ?? (latestPumpIntelligence?.accountVerified || latestPumpIntelligence?.pumpSwapPoolVerified ? "Verified read-only" : "Monitor ready")}</dd></div>
            </dl>
            {latestPumpIntelligence && (
              <div className="pumpIntelligence">
                {latestPumpIntelligence.researchEligibility && (
                  <div className={`pumpResearchGate ${latestPumpIntelligence.researchEligibility.status}`}>
                    <div><span>RESEARCH ELIGIBILITY</span><strong>{latestPumpIntelligence.researchEligibility.status}</strong></div>
                    <small>{latestPumpIntelligence.researchEligibility.checks.filter((check) => check.passed).length}/10 checks passed; AI ranking {latestPumpIntelligence.researchEligibility.rankingAllowed ? "allowed" : "blocked"}; execution locked</small>
                    {latestPumpIntelligence.researchEligibility.status === "blocked" && (
                      <ul>{latestPumpIntelligence.researchEligibility.checks.filter((check) => !check.passed).map((check) => <li key={check.id}>{check.message}</li>)}</ul>
                    )}
                  </div>
                )}
                <div className="pumpMetricGrid">
                  <div><span>Spot estimate</span><strong>{formatPumpMetric(latestPumpIntelligence.metrics.spotPriceQuotePerToken, latestPumpIntelligence.metrics.quoteSymbol)}</strong></div>
                  <div><span>Est. market cap</span><strong>{formatPumpMetric(latestPumpIntelligence.metrics.estimatedMarketCapQuote, latestPumpIntelligence.metrics.quoteSymbol)}</strong></div>
                  <div><span>Curve progress</span><strong>{formatPumpPercent(latestPumpIntelligence.metrics.curveProgressPercent)}</strong></div>
                  <div><span>Quote reserves</span><strong>{formatPumpMetric(latestPumpIntelligence.metrics.quoteReservesUi, latestPumpIntelligence.metrics.quoteSymbol)}</strong></div>
                  <div><span>Reference buy impact</span><strong>{formatPumpBps(latestPumpIntelligence.metrics.referenceBuyPriceImpactBps)}</strong></div>
                  <div><span>Top 10 accounts</span><strong>{formatPumpPercent(latestPumpIntelligence.top10ConcentrationPercent)}</strong></div>
                </div>
                <div className="pumpPathEvidence">
                  <div className="pumpPathHeader">
                    <strong>Reference round-trip · {latestPumpIntelligence.metrics.referencePath.venue}</strong>
                    <span>RESERVE ONLY</span>
                  </div>
                  <dl>
                    <div><dt>Buy input</dt><dd>{formatPumpRawAmount(latestPumpIntelligence.metrics.referencePath.buyInputQuoteAmount, 9, "SOL")}</dd></div>
                    <div><dt>Buy output</dt><dd>{formatPumpRawAmount(latestPumpIntelligence.metrics.referencePath.buyOutputTokenAmount, latestPumpIntelligence.decimals, "token")}</dd></div>
                    <div><dt>Buy impact</dt><dd>{formatPumpBps(latestPumpIntelligence.metrics.referencePath.buyPriceImpactBps)}</dd></div>
                    <div><dt>Sell-back input</dt><dd>{formatPumpRawAmount(latestPumpIntelligence.metrics.referencePath.sellInputTokenAmount, latestPumpIntelligence.decimals, "token")}</dd></div>
                    <div><dt>Sell-back output</dt><dd>{formatPumpRawAmount(latestPumpIntelligence.metrics.referencePath.sellOutputQuoteAmount, 9, "SOL")}</dd></div>
                    <div><dt>Sell impact</dt><dd>{formatPumpBps(latestPumpIntelligence.metrics.referencePath.sellPriceImpactBps)}</dd></div>
                    <div><dt>Round-trip loss</dt><dd>{formatPumpBps(latestPumpIntelligence.metrics.referencePath.roundTripLossBps)}</dd></div>
                    <div><dt>Network fee</dt><dd>Needs simulation</dd></div>
                    <div><dt>Rent/account funding</dt><dd>Needs simulation</dd></div>
                  </dl>
                  <p>{latestPumpIntelligence.metrics.referencePath.disclosure}</p>
                </div>
                <div className="pumpRiskRows">
                  <div><span>Mint authority</span><strong className={latestPumpIntelligence.mintAuthority === null ? "safe" : "risk"}>{latestPumpIntelligence.mintAuthority === null ? "Disabled" : "Enabled"}</strong></div>
                  <div><span>Freeze authority</span><strong className={latestPumpIntelligence.freezeAuthority === null ? "safe" : "risk"}>{latestPumpIntelligence.freezeAuthority === null ? "Disabled" : "Enabled"}</strong></div>
                  <div><span>Base fee config</span><strong>{latestPumpIntelligence.metrics.baseProtocolFeeBps === null ? "Unavailable" : `${latestPumpIntelligence.metrics.baseProtocolFeeBps} + ${latestPumpIntelligence.metrics.baseCreatorFeeBps ?? 0} bps`}</strong></div>
                </div>
                <small className="pumpEvidenceTime">Finalized slot {latestPumpIntelligence.slot.toLocaleString()} · {new Date(latestPumpIntelligence.verifiedAt).toLocaleTimeString()}</small>
                <p className="pumpEvidenceNote">{latestPumpIntelligence.metrics.priceImpactNote}</p>
                <p className="pumpEvidenceNote">{latestPumpIntelligence.metrics.feeNote}</p>
                  {latestPumpIntelligence.warnings.length > 0 && (
                  <details className="pumpWarnings">
                    <summary>{latestPumpIntelligence.warnings.length} evidence warnings</summary>
                    <ul>{latestPumpIntelligence.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                  </details>
                )}
              </div>
            )}
            {latestPumpPreview ? (
              <div className="pumpPreviewSummary">
                <div><span>Side</span><strong>{latestPumpPreview.side}</strong></div>
                <div><span>Input</span><strong>{latestPumpPreview.inputAmount}</strong></div>
                <div><span>Minimum output</span><strong>{latestPumpPreview.minimumOutputAmount}</strong></div>
                <div><span>Policy</span><strong>{latestPumpPreview.checks.filter((check) => check.status === "pass").length}/{latestPumpPreview.checks.length}</strong></div>
                <div><span>Inspector</span><strong>{latestPumpPreview.inspectionBoundary?.instructionName ?? "Unavailable"}</strong></div>
                <div><span>Transaction</span><strong>{latestPumpPreview.inspectionBoundary?.transactionInspected ? "Inspected" : "Not built"}</strong></div>
              </div>
            ) : pumpConfig.scope === "exact-mint" && !latestPumpIntelligence ? (
              <div className="pumpAnalyzePrompt">
                <p>Run a verified read-only analysis to save reserve, authority, concentration, price, market-cap, and curve evidence here.</p>
                <button className="railRetry" onClick={() => pumpConfig.tokenMint && onAnalyzePump?.(pumpConfig.tokenMint)}>Analyze exact mint</button>
              </div>
            ) : null}
            {pumpConfig.scope === "exact-mint" && latestPumpIntelligence && (
              <button className="railRetry pumpRefreshAnalysis" onClick={() => pumpConfig.tokenMint && onAnalyzePump?.(pumpConfig.tokenMint)}>Refresh finalized evidence</button>
            )}
          </RailSection>
          {pumpConfig.scope === "exact-mint" ? (
            <RailSection title="Position">
              <span className="totalLabel">Selected wallet exposure</span>
              <strong className="portfolioTotal">{pumpAsset?.uiAmount ?? "0"}</strong>
              <small>{pumpAsset ? `Token units at finalized slot ${portfolio?.slot.toLocaleString()}` : "No finalized balance for this mint was found in the selected wallet."}</small>
              
               <div className="pumpControlGrid" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="number" 
                    placeholder="Take-Profit %" 
                    value={tpPercent}
                    onChange={(e) => setTpPercent(e.target.value)}
                    style={{ flex: 1, padding: '4px', background: 'var(--input-bg)', color: 'var(--input-fg)', border: '1px solid var(--border)' }}
                  />
                  <input 
                    type="number" 
                    placeholder="Stop-Loss %" 
                    value={slPercent}
                    onChange={(e) => setSlPercent(e.target.value)}
                    style={{ flex: 1, padding: '4px', background: 'var(--input-bg)', color: 'var(--input-fg)', border: '1px solid var(--border)' }}
                  />
                </div>
                {activePosition ? (
                  <button className="dangerOutline" onClick={() => window.silfable.closePosition(activePosition.id)}>
                    Cancel Automation (Active)
                  </button>
                ) : (
                  <button 
                    disabled={!pumpAsset || Number(pumpAsset.uiAmount) <= 0 || pumpAsset.usdPrice === null}
                    onClick={() => {
                      if (pumpAsset && pumpConfig?.tokenMint && pumpAsset.usdPrice !== null) {
                        const entryPriceUsd = pumpAsset.usdPrice;
                        window.silfable.upsertPosition({
                          id: crypto.randomUUID(),
                          mintAddress: pumpConfig.tokenMint,
                          amount: pumpAsset.amount,
                          entryPrice: entryPriceUsd,
                          takeProfitPrice: tpPercent ? entryPriceUsd * (1 + Number(tpPercent) / 100) : undefined,
                          stopLossPrice: slPercent ? entryPriceUsd * (1 - Number(slPercent) / 100) : undefined
                        });
                        setTpPercent("");
                        setSlPercent("");
                      }
                    }}
                  >
                    Save Exit Proposal Monitor
                  </button>
                )}
              </div>
              <p className="pumpUnavailable" style={{ marginTop: '0.5rem' }}>
                Monitoring runs locally while the vault is unlocked. A trigger creates a proposal; it does not sign or broadcast automatically.
              </p>
              
              {visibleWallet && (
                <div className="walletLine selected">
                  <span>SESSION WALLET</span>
                  <strong>{shorten(visibleWallet)}</strong>
                  <Button variant="ghost" size="sm" onClick={() => copyAddress(visibleWallet)}>
                    {copiedAddress === visibleWallet ? "Copied" : "Copy"}
                  </Button>
                </div>
              )}
            </RailSection>
          ) : pumpConfig.scope === "watchlist" ? (
            <RailSection title="Watchlist boundary">
              <dl className="pumpFacts">
                <div><dt>Configured</dt><dd>{pumpConfig.watchlistMints?.length ?? 0}/10</dd></div>
                <div><dt>Analyzed</dt><dd>{pumpWatchlistEvidence.size}</dd></div>
                <div><dt>Trade tools</dt><dd>Unavailable</dd></div>
                <div><dt>Network</dt><dd>Mainnet read-only</dd></div>
              </dl>
              <p className="pumpUnavailable">Select Analyze on a mint to refresh finalized evidence. Moving a candidate into an exact-mint proposal session must remain an explicit user action.</p>
            </RailSection>
          ) : (
            <RailSection title="Scanner boundary">
              <dl className="pumpFacts">
                <div><dt>Signatures</dt><dd>{latestPumpDiscovery?.scannedSignatures ?? 0}/10</dd></div>
                <div><dt>Observed mints</dt><dd>{latestPumpDiscovery?.observedMints ?? 0}</dd></div>
                <div><dt>Decoded events</dt><dd>{latestPumpDiscovery?.decodedEvents ?? 0}</dd></div>
                <div><dt>Verified candidates</dt><dd>{latestPumpDiscovery?.candidates.length ?? 0}/5</dd></div>
                <div><dt>Execution</dt><dd>Locked</dd></div>
              </dl>
              <p className="pumpUnavailable">This manual RPC scan is deliberately incomplete. A production real-time indexer, schedules, automatic watchlist mutation, and autonomous buys remain unavailable.</p>
            </RailSection>
          )}
        </>
      )}
      {!pumpConfig && (
        <UnifiedPortfolioRail
          session={session}
          runtime={runtime}
          solanaWallets={wallets}
          evmWallets={evmWallets}
          refreshToken={refreshToken}
          copiedAddress={copiedAddress}
          onCopyAddress={copyAddress}
        />
      )}
      {session && !isEvmSession && (
        <RailSection title="Recent activity">
          {activityState === "loading" ? (
            <p>Reading finalized wallet signatures…</p>
          ) : activityState === "error" ? (
            <p>Recent activity could not be verified from Mainnet RPC.</p>
          ) : activity?.entries.length ? (
            <div className="activityList">
              {activity.entries.slice(0, 6).map((entry) => (
                <div key={entry.signature}>
                  <span className={entry.status}>{entry.status}</span>
                  <div>
                    <strong>{shorten(entry.signature)}</strong>
                    <small>
                      {entry.blockTime
                        ? new Date(entry.blockTime).toLocaleString()
                        : `Slot ${entry.slot.toLocaleString()}`}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No finalized activity found for this wallet.</p>
          )}
        </RailSection>
      )}
      {session && (
        <RailSection title="Runtime & cost">
          <div className="runtimeModel">
            <div className="runtimeContext" title="Input tokens reported by the provider for the most recent AI request.">
              <div>
                <span>Context · last turn</span>
                <strong>{formatRuntimeTokens(lastTurnInputTokens)} / {formatRuntimeTokens(safeContextLimit)} · {contextPercent}%</strong>
              </div>
              <div className="runtimeContextTrack" aria-label={`Last-turn context usage: ${contextPercent}%`}>
                <span style={{ width: `${contextPercent}%` }} />
              </div>
              <small>Output cap: {formatRuntimeTokens(outputLimit)} tokens</small>
            </div>
            ◈ {model || "OpenRouter not configured"}
          </div>
          <dl>
            <div>
              <dt>Input</dt>
              <dd>{session?.usage.input ?? 0}</dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>{session?.usage.output ?? 0}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{session?.usage.total ?? 0}</dd>
            </div>
            <div>
              <dt>Cost</dt>
               <dd>
                {session?.usage.cost === null || session?.usage.cost === undefined
                  ? "—"
                  : `$${session.usage.cost.toFixed(6)}`}
              </dd>
            </div>
          </dl>
        </RailSection>
      )}
      {visibleAutomationStrategies.filter((s) => s.status !== "CANCELLED" && s.status !== "EXPIRED").length > 0 && (
        <RailSection title="Active Automation">
          <div className="activeAutomationsRail space-y-2 text-xs">
            {visibleAutomationStrategies
              .filter((s) => s.status !== "CANCELLED" && s.status !== "EXPIRED")
              .map((strat) => {
                const matchingProp = automationProposals.find(
                  (p) => p.strategyId === strat.id && p.status === "AWAITING_APPROVAL",
                );
                // Older persisted strategies did not always include sessionId.
                // A pending proposal is nevertheless scoped to the active
                // session, so use either identifier before exposing a manual
                // approval control.
                const isFullAccessStrategy = session?.permission === "full";
                const nextWake = strat.nextWakeAt ? Date.parse(strat.nextWakeAt) - Date.now() : null;
                const countdown =
                  nextWake && nextWake > 0
                    ? `${Math.floor(nextWake / 60000)}m ${Math.floor((nextWake % 60000) / 1000)}s`
                    : "Queued for local evaluation";
                const automationStatus = isFullAccessStrategy && strat.status === "AWAITING_APPROVAL"
                  ? "PROCESSING"
                  : strat.status;

                const formatOrderAmount = (rawAmount?: string, inputMint?: string) => {
                  if (!rawAmount) return "-";
                  const num = Number(rawAmount);
                  if (isNaN(num)) return rawAmount;
                  if (inputMint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" || (!inputMint && num >= 1000)) {
                    const formatted = (num / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
                    return `${formatted} USDC`;
                  }
                  if (inputMint?.toLowerCase() === "0x5fc5360d0400a0fd4f2af552add042d716f1d168") {
                    return `${(num / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDG`;
                  }
                  if (inputMint?.toLowerCase() === "0x0000000000000000000000000000000000000000") {
                    return `${(num / 1_000_000_000_000_000_000).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })} ETH`;
                  }
                  return `${num.toLocaleString()} raw units`;
                };

                const KNOWN: Record<string, string> = {
                  "So11111111111111111111111111111111111111112": "SOL",
                  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
                  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
                  "0x0000000000000000000000000000000000000000": "ETH",
                  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": "USDG",
                };

                const inSym = KNOWN[strat.inputMint] || shorten(strat.inputMint);
                const outSym = KNOWN[strat.outputMint] || shorten(strat.outputMint);

                return (
                  <div key={strat.id} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-emerald-300">
                      <span>{strat.kind} · {inSym} ➔ {outSym}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${isFullAccessStrategy ? "bg-emerald-500/20 text-emerald-300" : strat.status === "ACTIVE" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                        {isFullAccessStrategy && (matchingProp || strat.status === "AWAITING_APPROVAL") ? "PROCESSING" : automationStatus}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Progress: {strat.completedExecutions ?? 0}/{strat.maximumExecutions ?? "-"}</span>
                      <span className="font-mono text-emerald-300 font-medium">{formatOrderAmount(strat.orderAmountRaw, strat.inputMint)}</span>
                    </div>
                    {strat.status === "ACTIVE" && strat.nextWakeAt && (
                      <div className="flex justify-between text-[11px] text-emerald-400 font-mono">
                        <span>⏱ Next run:</span>
                        <span>{countdown}</span>
                      </div>
                    )}
                    {matchingProp && isFullAccessStrategy ? (
                      <div className="w-full mt-2 py-1.5 px-2 rounded border border-emerald-500/30 bg-emerald-950/40 text-center font-mono text-[10px] text-emerald-300">
                        Full Access processing
                      </div>
                    ) : matchingProp && (
                      <button
                        className="w-full mt-2 py-1.5 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm"
                        disabled={actionLoadingId === matchingProp.id}
                        onClick={() => handleApproveProposal(matchingProp.id)}
                      >
                        Approve Swap ({formatOrderAmount(matchingProp.inputAmountRaw, matchingProp.inputMint)})
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </RailSection>
      )}
      {session && (
        <RailSection title="Session">
          <dl className="sessionFacts">
            <div>
              <dt>Workspace</dt>
              <dd>{session.workspace === "pump" ? "Pump.fun" : "General"}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{session.mode}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>{session.permission}</dd>
            </div>
            <div>
              <dt>Wallet</dt>
              <dd>{visibleWallet ? shorten(visibleWallet) : "Chat only"}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>
                {new Date(session.startedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
            <div>
               <dt>Execution</dt>
              <dd>Locked</dd>
            </div>
          </dl>
        </RailSection>
      )}
    </aside>
  );
}
export function PortfolioAssetRow({ symbol, amount, usdValue }: { symbol: string; amount: string; usdValue: number | null }) {
  return (
    <div className="portfolioAssetRow">
      <span>{symbol}</span>
      <strong>{formatPortfolioAmount(amount)}</strong>
      <div>
        <em>{formatPortfolioUsd(usdValue)}</em>
      </div>
    </div>
  );
}
export function UtilityView({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="utilityView">
      <p className="kicker">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{copy}</p>
      {action}
    </div>
  );
}
export function Composer({
  value,
  setValue,
  onSubmit,
  disabled = false,
  placeholder,
}: {
  value: string;
  setValue: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeComposer = (element: HTMLTextAreaElement): void => {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  };

  useEffect(() => {
    if (textareaRef.current) resizeComposer(textareaRef.current);
  }, [value]);

  return (
  <div className={`composer ${disabled ? "disabled" : ""}`}>
      <textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value);
          resizeComposer(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (!disabled && event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        rows={1}
      />
      <Button
        className="composerSubmit"
        size="sm"
        icon={<ArrowUp className="size-4" />}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        onClick={onSubmit}
      >
        <span className="sr-only">Send</span>
      </Button>
    </div>
  );
}

