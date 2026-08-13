// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, ArrowUp, Bot, Brain, CirclePlus, Settings, ShieldCheck, Target } from 'lucide-react';
import { Button, Modal } from '../../ui';
import { shorten, cn, cleanErrorMessage } from '../../lib/utils';
import { StatusPill, Notice, Field, SetupCard, SetupActions, Brand, BrandMark, CornerFooter, RailSection, ProviderCard } from '../setup/SetupHelpers';
import { ACTIVITY_LEVELS, INTEGRATION_CATEGORIES, SETUP_STEPS, STORAGE_KEY, SOLANA_ADDRESS_PATTERN, bridgeDestination } from '../types';
import type { BridgePreflightEvidence, BridgeProposal, BridgeReceipt, BridgeDestinationChain, EmergencyStopStatus, EvmBridgeContract, EvmBridgePreflight, EvmBridgeQuote, EvmBridgeReceipt, EvmChainKey, EvmPortfolioSnapshot, EvmSessionExecutionReceipt, EvmSwapPreflightEvidence, EvmSwapProposal, LimitOrderCancelSimulation, LimitOrderContractPreview, LimitOrderExecutionReceipt, LimitOrderSimulationPreview, LegacyPumpLaunchMetadataPackage, MissionContractPreview, MissionExecutionReceipt, MissionSimulationPreview, OpenRouterModelView, PortfolioSnapshot, PumpExecutionRecord, PumpFinalRevalidation, PumpLaunchDraft, PumpLaunchDraftInput, PumpLaunchMetadata, PumpLaunchPreflight, PumpLaunchFinalRevalidation, PumpLaunchExecutionRecord, PumpRiskSettings, PumpSimulationArtifact, PumpTokenIntelligence, PumpTradeContractPreview, RuntimeStatus, SessionRecord, TransactionSettings, WalletActivitySnapshot } from '@silfable/contracts';
import { BRIDGE_ARBITRUM_CHAIN_ID, BRIDGE_ARBITRUM_USDC_ADDRESS, BRIDGE_AVALANCHE_CHAIN_ID, BRIDGE_AVALANCHE_USDC_ADDRESS, BRIDGE_BASE_CHAIN_ID, BRIDGE_BASE_USDC_ADDRESS, BRIDGE_ETHEREUM_CHAIN_ID, BRIDGE_ETHEREUM_USDC_ADDRESS, BRIDGE_OPTIMISM_CHAIN_ID, BRIDGE_OPTIMISM_USDC_ADDRESS, BRIDGE_POLYGON_CHAIN_ID, BRIDGE_POLYGON_USDC_ADDRESS, BRIDGE_ROBINHOOD_CHAIN_ID, BRIDGE_ROBINHOOD_USDG_ADDRESS, BRIDGE_SOLANA_CHAIN_ID, BRIDGE_SOLANA_USDC_MINT } from '@silfable/contracts';
import { formatLamportsToSol, formatSolanaAmount, formatPumpAmount, formatEvmTokenAmount, formatWeiToGweiOrEth } from '../../lib/formatters';

export function SimulationApprovalModal({
  preview,
  onCancel,
  onConfirm,
}: {
  preview: MissionContractPreview;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="simulationApproval"
        role="dialog"
        aria-modal="true"
        aria-labelledby="simulation-approval-title"
      >
        <p className="kicker">Transaction preview</p>
        <h2 id="simulation-approval-title">Run a Mainnet simulation?</h2>
        <p>
          Silfable will refresh policy evidence, request an unsigned Jupiter
          transaction for this wallet, inspect its signer and program scope, and
          call Solana simulation.
        </p>
        <dl>
          <div>
            <dt>Wallet</dt>
            <dd>{shorten(preview.walletAddress)}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>{formatSolanaAmount(preview.inputAmount, preview.inputMint)}</dd>
          </div>
          <div>
            <dt>Slippage ceiling</dt>
            <dd>{preview.maxSlippageBps} bps</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>{new Date(preview.deadlineAt).toLocaleString()}</dd>
          </div>
        </dl>
        <Notice tone="warning" title="Simulation only">
          No private key is loaded, no signature is created, and no transaction
          is broadcast. The unsigned transaction remains in the main process.
        </Notice>
        <footer>
          <button onClick={onCancel}>Cancel</button>
          <button className="primaryButton" onClick={onConfirm}>
            Run simulation
          </button>
        </footer>
      </section>
    </div>
  );
}
export function EvmBridgeExecutionApprovalModal({
 preflight,
  quote,
  onCancel,
  onConfirm,
}: {
  preflight: EvmBridgePreflight;
  quote: EvmBridgeQuote;
  onCancel: () => void;
  onConfirm: (credentials: { masterPassword: string; confirmation: string }) => Promise<void>;
}) {
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const required = preflight.action === "approval" ? "APPROVE BRIDGE TOKEN" : "EXECUTE EVM BRIDGE MAINNET";
  const ready = masterPassword.length >= 8 && confirmation === required && acknowledged;
  async function submit(): Promise<void> {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try { await onConfirm({ masterPassword, confirmation }); }
    catch (cause) { setError(cleanErrorMessage(cause instanceof Error ? cause.message : "The EVM Bridge transaction was blocked.")); }
    finally { setBusy(false); }
  }
   return (
    <div className="modalBackdrop" role="presentation">
      <section className="simulationApproval executionApproval" role="dialog" aria-modal="true" aria-labelledby="evm-bridge-approval-title">
        <p className="kicker">Final EVM Bridge Mainnet authorization</p>
        <h2 id="evm-bridge-approval-title">{preflight.action === "approval" ? "Approve the exact bridge token scope?" : "Submit this exact cross-chain deposit?"}</h2>
        <p>{preflight.action === "approval" ? "This approval is a separate EVM transaction and does not move funds across chains. After confirmation, request a fresh quote for the deposit." : "This signs and broadcasts one source-chain deposit. Destination settlement remains asynchronous and must be reconciled independently."}</p>
        <dl>
          <div><dt>Source wallet</dt><dd>{preflight.walletAddress}</dd></div>
          <div><dt>Action</dt><dd>{preflight.action}</dd></div>
          <div><dt>USDC input</dt><dd>{(Number(quote.amountIn) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC</dd></div>
          <div><dt>Minimum destination</dt><dd>{(Number(quote.minimumDestinationAmount) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC</dd></div>
          <div><dt>Provider fee</dt><dd>${quote.totalFeeUsd.toFixed(4)}</dd></div>
          <div><dt>Maximum gas</dt><dd>{formatWeiToGweiOrEth(preflight.maximumNetworkFeeWei)}</dd></div>
          <div><dt>Digest</dt><dd>{preflight.transactionDigest.slice(0, 24)}…</dd></div>
          <div><dt>Expires</dt><dd>{new Date(preflight.expiresAt).toLocaleString()}</dd></div>
        </dl>
        <Notice tone="danger" title={preflight.action === "approval" ? "Real token approval" : "Irreversible source broadcast"}>
          Verify the source chain, wallet, recipient, amount, minimum output, and fee limits. Never retry an unknown broadcast without reconciling the stored hash.
        </Notice>
        <Field label="Master password"><input type="password" autoComplete="current-password" value={masterPassword} onChange={(event) => setMasterPassword(event.target.value)} /></Field>
        <Field label={`Type "${required}"`}><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></Field>
        <label className="riskCheck"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I authorize this exact EVM Mainnet action and understand its cross-chain risks.</span></label>
        {error && <p className="executionError">{cleanErrorMessage(error)}</p>}
        <footer><button disabled={busy} onClick={onCancel}>Cancel</button><button className="dangerButton" disabled={!ready || busy} onClick={() => void submit()}>{busy ? "Signing and submitting once…" : preflight.action === "approval" ? "Approve exact scope" : "Submit bridge deposit"}</button></footer>
           </section>
    </div>
  );
}
export function ExecutionApprovalModal({
  preview,
  simulation,
  onCancel,
  onConfirm,
}: {
  preview: MissionContractPreview;
  simulation: MissionSimulationPreview;
  onCancel: () => void;
  onConfirm: (credentials: {
    masterPassword: string;
    confirmation: string;
  }) => Promise<void>;
}) {
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready =
    masterPassword.length > 0 &&
    confirmation === "EXECUTE MAINNET" &&
    acknowledged;
  async function submit(): Promise<void> {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ masterPassword, confirmation });
    } catch (cause) {
      setError(
        cleanErrorMessage(
          cause instanceof Error
            ? cause.message
            : "Mainnet execution was not started."
        )
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modalBackdrop" role="presentation">
      <section
        className="simulationApproval executionApproval"
        role="dialog"
        aria-modal="true"
        aria-labelledby="execution-approval-title"
      >
        <p className="kicker">Final Mainnet authorization</p>
        <h2 id="execution-approval-title">This will use real funds</h2>
        <p>
          The exact transaction that passed simulation will be signed locally
          and submitted through Jupiter. This action cannot be undone after
          broadcast.
        </p>
        <dl>
          <div>
            <dt>Wallet</dt>
            <dd>{preview.walletAddress}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>{formatSolanaAmount(preview.inputAmount, preview.inputMint)}</dd>
          </div>
          <div>
            <dt>Input mint</dt>
            <dd>{preview.inputMint}</dd>
          </div>
          <div>
            <dt>Output mint</dt>
            <dd>{preview.outputMint}</dd>
          </div>
          <div>
            <dt>Expected output</dt>
            <dd>{simulation.expectedOutAmount ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Max slippage</dt>
            <dd>{preview.maxSlippageBps} bps</dd>
          </div>
          <div>
            <dt>Estimated fee</dt>
            <dd>{formatLamportsToSol(simulation.feeLamports)}</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>{new Date(preview.deadlineAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Approval expiry</dt>
            <dd>90 seconds after simulation</dd>
          </div>
        </dl>
        <Notice tone="warning" title="Irreversible Mainnet transaction">
          Confirm the wallet, amount, token mints, slippage, and deadline. If
          submission status becomes unknown, verify wallet activity before
          trying again.
        </Notice>
        <Field label="Master password">
          <input
            type="password"
            autoComplete="current-password"
            value={masterPassword}
            onChange={(event) => setMasterPassword(event.target.value)}
          />
        </Field>
        <Field label='Type "EXECUTE MAINNET"'>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </Field>
        <label className="riskCheck">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I authorize this exact simulated transaction to use real Mainnet
            funds.
          </span>
        </label>
        {error && <p className="executionError">{cleanErrorMessage(error)}</p>}
        <footer>
          <button disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="dangerButton"
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {busy ? "Signing and submitting…" : "Execute real transaction"}
          </button>
        </footer>
      </section>
    </div>
  );
}
export function PumpExecutionApprovalModal({
  preview,
  simulation,
  revalidation,
  onCancel,
  onConfirm,
}: {
  preview: PumpTradeContractPreview;
  simulation: PumpSimulationArtifact;
  revalidation: PumpFinalRevalidation;
  onCancel: () => void;
  onConfirm: (credentials: {
    masterPassword: string;
    confirmation: string;
  }) => Promise<void>;
}) {
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready =
    masterPassword.length > 0 &&
    confirmation === "EXECUTE PUMP MAINNET" &&
    acknowledged;

  async function submit(): Promise<void> {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ masterPassword, confirmation });
    } catch (cause) {
      setError(
        cleanErrorMessage(
          cause instanceof Error
            ? cause.message
            : "Pump trade execution was not started."
        )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalBackdrop" role="presentation">
      <section
        className="simulationApproval executionApproval"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pump-execution-approval-title"
      >
        <p className="kicker">Pump.fun Mainnet boundary</p>
        <h2 id="pump-execution-approval-title">Approve exact Pump trade</h2>
        <p>
          Review the exact wallet, mint, amount, fee evidence, and transaction
          digest. This approval is valid only for the freshly revalidated
          transaction shown below.
        </p>
        <dl>
          <div>
            <dt>Wallet</dt>
            <dd>{preview.walletAddress}</dd>
          </div>
          <div>
            <dt>Side</dt>
            <dd>{preview.side.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Token mint</dt>
            <dd>{preview.tokenMint}</dd>
          </div>
          <div>
            <dt>{preview.side === "buy" ? "SOL input" : "Token input"}</dt>
            <dd>{formatPumpAmount(preview.inputAmount, preview.side, preview.tokenMint)}</dd>
          </div>
          <div>
            <dt>{preview.side === "buy" ? "Minimum tokens" : "Minimum SOL"}</dt>
            <dd>{preview.side === "buy" ? `${(Number(preview.minimumOutputAmount) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} tokens` : formatLamportsToSol(preview.minimumOutputAmount)}</dd>
          </div>
          <div>
            <dt>Max slippage</dt>
            <dd>{preview.maxSlippageBps} bps</dd>
          </div>
          <div>
            <dt>Estimated network fee</dt>
            <dd>{formatLamportsToSol(simulation.networkFeeLamports)}</dd>
          </div>
          <div>
            <dt>Transaction digest</dt>
            <dd><code>{revalidation.finalTransactionDigest.slice(0, 16)}...</code></dd>
          </div>
        </dl>
        <Notice tone="warning" title="Irreversible Mainnet transaction">
          This signs locally and submits a real Mainnet transaction. Silfable
          persists the locally derived signature before the network call and
          never rebroadcasts an unknown result automatically.
        </Notice>
        <Field label="Master password">
          <input
            type="password"
            autoComplete="current-password"
            value={masterPassword}
            onChange={(event) => setMasterPassword(event.target.value)}
          />
        </Field>
        <Field label='Type "EXECUTE PUMP MAINNET"'>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </Field>
        <label className="riskCheck">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I authorize this exact restricted Pump.fun transaction and
            understand that it uses real Mainnet funds.
          </span>
        </label>
        {error && <p className="executionError">{cleanErrorMessage(error)}</p>}
        <footer>
          <button disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="dangerButton"
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {busy ? "Signing and submitting…" : "Execute Pump trade"}
          </button>
        </footer>
      </section>
    </div>
  );
}
export function SessionModal({
  prompt,
  wallets,
  evmWallets,
  onCancel,
  onCreate,
}: {
  prompt: string;
  wallets: WalletSummary[];
  evmWallets: WalletSummary[];
  onCancel: () => void;
  onCreate: (value: {
    title: string;
    mode: SessionMode;
    permission: Permission;
    workspace: SessionWorkspace;
    walletScope?: SessionWalletScope;
    walletAddress: string | null;
    prompt: string;
  }) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(
    prompt.slice(0, 64) || "New Mainnet session",
  );
  const [mode, setMode] = useState<SessionMode>("agent");
  const [permission, setPermission] = useState<Permission>("restricted");
  const [fullAccessBusy, setFullAccessBusy] = useState(false);
  const [fullAccessError, setFullAccessError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<SessionWorkspace>("general");
  const [walletScope, setWalletScope] = useState<SessionWalletScope>("solana");
  const [pumpObjective, setPumpObjective] = useState<PumpSessionConfig["objective"]>("monitor");
  const [pumpScope, setPumpScope] = useState<PumpSessionConfig["scope"]>("exact-mint");
  const [pumpMint, setPumpMint] = useState("");
  const [pumpWatchlistText, setPumpWatchlistText] = useState("");
  const [pumpAnalysisBuyLamports, setPumpAnalysisBuyLamports] = useState("1000000");
  const [walletAddress, setWalletAddress] = useState<string>(
    wallets.find((wallet) => wallet.primary)?.address ?? "",
  );
  const scopedWallets = walletScope === "evm" ? evmWallets : wallets;
  useEffect(() => {
    if (!scopedWallets.some((wallet) => wallet.address === walletAddress)) {
      setWalletAddress(
        scopedWallets.find((wallet) => wallet.primary)?.address ??
          scopedWallets[0]?.address ??
          "",
      );
    }
  }, [scopedWallets, walletAddress]);
  function selectWalletScope(scope: SessionWalletScope): void {
    setWalletScope(scope);
    setWorkspace("general");
    const nextWallets = scope === "evm" ? evmWallets : wallets;
    setWalletAddress(
      nextWallets.find((wallet) => wallet.primary)?.address ??
        nextWallets[0]?.address ??
        "",
    );
  }
   const pumpMintValid = SOLANA_ADDRESS_PATTERN.test(pumpMint.trim());
  const pumpWatchlistMints = [...new Set(pumpWatchlistText
    .split(/[\s,;]+/u)
    .map((mint) => mint.trim())
    .filter(Boolean))];
  const pumpWatchlistValid = pumpWatchlistMints.length >= 1
    && pumpWatchlistMints.length <= 10
    && pumpWatchlistMints.every((mint) => SOLANA_ADDRESS_PATTERN.test(mint));
  const pumpAnalysisAmountValid = /^[1-9]\d*$/u.test(pumpAnalysisBuyLamports)
    && BigInt(pumpAnalysisBuyLamports) >= 10_000n
    && BigInt(pumpAnalysisBuyLamports) <= 10_000_000_000n;
  const fullAccessReady = permission !== "full" || walletAddress.length > 0;
  async function create(): Promise<void> {
    if (!title.trim() || !fullAccessReady || fullAccessBusy) return;
    setFullAccessBusy(true);
    setFullAccessError(null);
    try {
      await onCreate({ title: title.trim(), mode, permission: workspace === "pump" ? "restricted" : permission, workspace: "general", walletScope, walletAddress: walletAddress || null, prompt });
    } catch (cause) {
      setFullAccessError(cleanErrorMessage(cause instanceof Error ? cause.message : "Full Access session could not be created."));
    } finally {
      setFullAccessBusy(false);
    }
  }
  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="sessionModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-session-title"
      >
        <header className="sessionModalHeader">
          <div>
            <p className="kicker">New session</p>
            <h2 id="new-session-title">Your goal. Your rules.</h2>
            <p>
              Define how the AI agent may reason, plan, and use your Mainnet
              context.
            </p>
          </div>
          <button
            className="modalClose"
            aria-label="Close new session"
            onClick={onCancel}
          >
            ×
          </button>
        </header>
        <div className="sessionModalBody">
          <section className="sessionConfigSection">
            <div className="sectionLegend">
              <span>01</span>
              <strong>Session name</strong>
              <small>Used in your session history.</small>
            </div>
            <div>
              <input
                aria-label="Session name"
                value={title}
                maxLength={80}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Give this session a short name"
              />
              <div className="fieldMeta">
                <span>
                  {prompt
                    ? "The submitted prompt will start this session."
                    : "You can start chatting after creation."}
                </span>
                <span>{title.length} / 80</span>
              </div>
            </div>
          </section>
          <section className="sessionConfigSection">
            <div className="sectionLegend">
              <span>02</span>
              <strong>Wallet network</strong>
              <small>The selected wallet determines the actions available inside this session.</small>
            </div>
            <div className="choiceGrid">
              <button
                className={walletScope === "solana" ? "active" : ""}
                onClick={() => selectWalletScope("solana")}
              >
                <span className="choiceNumber">01</span>
                <strong>Solana Mainnet wallet</strong>
                 <small>Available inside the session: Jupiter swap, Pump.fun Token Launch planning, Solana-to-EVM bridge planning, and research.</small>
              </button>
              <button
                className={
                  evmWallets.length === 0
                    ? "unavailableChoice"
                    : walletScope === "evm"
                      ? "active"
                      : ""
                }
                disabled={evmWallets.length === 0}
                onClick={() => selectWalletScope("evm")}
              >
                <span className="choiceNumber">02</span>
                <strong>Robinhood Chain EVM wallet</strong>
                <small>
                  {evmWallets.length === 0
                    ? "Configure an encrypted EVM wallet in Settings first."
                    : "Restricted Uniswap-routed swap review on Robinhood Chain. Every approval and execution remains behind deterministic checks and explicit final confirmation."}
                </small>
              </button>
            </div>
          </section>
          <section className="sessionConfigSection">
            <div className="sectionLegend">
              <span>03</span>
              <strong>Mode</strong>
              <small>Choose the agent lifecycle.</small>
            </div>
            <div className="choiceGrid">
              <button
                className={mode === "agent" ? "active" : ""}
                onClick={() => setMode("agent")}
              >
                <span className="choiceNumber">01</span>
                <strong>Agent</strong>
                <small>
                  Interactive conversation for analysis, planning, and one task
                  at a time.
                </small>
              </button>
              <button
                className={mode === "mission" ? "active" : ""}
                onClick={() => setMode("mission")}
              >
                <span className="choiceNumber">02</span>
                <strong>Mission</strong>
                <small>
                  Goal-driven workflow with explicit limits, checkpoints, and stop conditions.
                </small>
              </button>
            </div>
          </section>
          {workspace === "pump" && (
            <section className="sessionConfigSection pumpConfigSection">
              <div className="sectionLegend">
                <span>04</span>
                <strong>Pump.fun scope</strong>
                <small>Choose one exact mint or a read-only list of up to ten mints.</small>
              </div>
              <div className="pumpSessionFields">
                <div className="compactChoiceRow" aria-label="Pump.fun discovery scope">
                  <button className={pumpScope === "exact-mint" ? "active" : ""} type="button" onClick={() => setPumpScope("exact-mint")}>Specific token</button>
                  <button className={pumpScope === "watchlist" ? "active" : ""} type="button" onClick={() => { setPumpScope("watchlist"); setPumpObjective("monitor"); }}>Watchlist</button>
                  <button className={pumpScope === "discovery" ? "active" : ""} type="button" onClick={() => { setPumpScope("discovery"); setPumpObjective("monitor"); }}>Market scanner</button>
                </div>
                {pumpScope === "exact-mint" ? <label>
                  <span>Exact token mint</span>
                  <input
                    aria-label="Pump.fun token mint"
                    value={pumpMint}
                    maxLength={44}
                    onChange={(event) => setPumpMint(event.target.value.trim())}
                    placeholder="Enter the exact Solana mint address"
                  />
                  <small className={pumpMint.length > 0 && !pumpMintValid ? "fieldError" : ""}>
                    {pumpMint.length === 0
                      ? "Required. Symbols and token names are never used as execution identity."
                      : pumpMintValid
                        ? "Valid address format. On-chain Pump/PumpSwap ownership is verified during analysis."
                        : "Enter a valid 32–44 character Solana address."}
                  </small>
                </label> : pumpScope === "watchlist" ? <label>
                  <span>Watchlist exact mints · maximum 10</span>
                  <textarea
                    aria-label="Pump.fun watchlist mints"
                    value={pumpWatchlistText}
                    onChange={(event) => setPumpWatchlistText(event.target.value)}
                    placeholder="One exact Solana mint per line"
                    rows={5}
                  />
                  <small className={pumpWatchlistText.length > 0 && !pumpWatchlistValid ? "fieldError" : ""}>
                    {pumpWatchlistText.length === 0
                      ? "Read-only only. Adding a mint never authorizes a buy."
                      : pumpWatchlistValid
                        ? `${pumpWatchlistMints.length}/10 unique valid mint addresses.`
                        : "Enter 1–10 unique valid Solana mint addresses."}
                  </small>
                </label> : <div className="pumpDiscoveryNotice">
                  <strong>Manual finalized scan</strong>
                  <small>Scans up to 10 recent official Pump program signatures and verifies at most 5 exact candidates. This is incomplete read-only evidence, not a real-time launch feed.</small>
                </div>}
                <label>
                  <span>Reference buy size · lamports</span>
                  <input
                    aria-label="Pump.fun reference buy size in lamports"
                    inputMode="numeric"
                    value={pumpAnalysisBuyLamports}
                    onChange={(event) => setPumpAnalysisBuyLamports(event.target.value.replace(/\D/gu, ""))}
                    placeholder="1000000"
                  />
                  <small className={!pumpAnalysisAmountValid ? "fieldError" : ""}>
                    {pumpAnalysisAmountValid
                      ? `${(Number(pumpAnalysisBuyLamports) / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 9 })} SOL · analysis only`
                      : "Enter 10,000–10,000,000,000 lamports (0.00001–10 SOL)."}
                  </small>
                </label>
                <div className="compactChoiceRow" aria-label="Pump.fun objective">
                  <button
                    className={pumpObjective === "monitor" ? "active" : ""}
                    type="button"
                    onClick={() => setPumpObjective("monitor")}
                  >
                    Monitor only
                  </button>
                  <button
                    className={pumpObjective === "trade-proposal" ? "active" : ""}
                    type="button"
                    disabled={pumpScope !== "exact-mint"}
                    onClick={() => setPumpObjective("trade-proposal")}
                  >
                    Trade proposal
                  </button>
                </div>
                <div className="pumpBoundaryNote">
                  <strong>Proposal only</strong>
                  <span>Manual restricted signing for a verified Pump active curve or canonical PumpSwap pool is available after final approval; unattended execution remains unavailable.</span>
                </div>
              </div>
            </section>
          )}
          <section className="sessionConfigSection">
            <div className="sectionLegend">
              <span>{workspace === "pump" ? "05" : "04"}</span>
              <strong>Permission</strong>
              <small>Controls mutating operations.</small>
            </div>
            <div className="choiceGrid">
              <button
                className={permission === "restricted" ? "active" : ""}
                onClick={() => setPermission("restricted")}
              >
                <span className="choiceNumber">01</span>
                <strong>Restricted</strong>
                <small>
                  Every future transaction requires deterministic checks and
                  your approval.
                </small>
              </button>
              <button
                className={permission === "full" ? "active" : ""}
                disabled={workspace === "pump" || !walletAddress}
                onClick={() => setPermission("full")}
              >
                <span className="choiceNumber">02 · Guarded MVP</span>
                <strong>Full access</strong>
                <small>Uses the vault authentication completed when the app was unlocked. Bounded local jobs can run without repeating the password; deterministic safety checks remain mandatory.</small>
              </button>
            </div>
          </section>
          <section className="sessionConfigSection">
            <div className="sectionLegend">
              <span>{workspace === "pump" ? "06" : "05"}</span>
              <strong>Wallet</strong>
              <small>Locked for this session after it is created.</small>
            </div>
            <div className="walletSelectBlock">
              <label htmlFor="session-wallet">
                {walletScope === "evm"
                  ? "Robinhood Chain EVM wallet"
                  : "Solana Mainnet wallet"}
              </label>
              <select
                id="session-wallet"
                value={walletAddress}
                onChange={(event) => setWalletAddress(event.target.value)}
              >
                <option value="">No wallet · chat only</option>
                {scopedWallets.map((wallet) => (
                  <option key={wallet.address} value={wallet.address}>
                    {wallet.primary ? "Primary · " : ""}
                    {shorten(wallet.address)}
                  </option>
                ))}
              </select>
              {permission === "full" && <strong className="fullAccessState">Mainnet · Full Access</strong>}
              <small>
                {scopedWallets.length === 0
                  ? `No ${walletScope === "evm" ? "EVM" : "Solana"} wallet is configured. Add one in Settings → Wallets.`
                  : `${scopedWallets.length} encrypted ${walletScope === "evm" ? "EVM" : "Solana"} wallet${scopedWallets.length === 1 ? "" : "s"} available on this device.`}
              </small>
            </div>
          </section>
        </div>
        <footer>
       <div className="sessionLockNote">
            <span>●</span>
            <div>
              <strong>{permission === "full" ? "Mainnet · Full Access" : "Mainnet · Restricted"}</strong>
              <small>
                {workspace === "pump"
                  ? "Pump.fun analysis and proposals never authorize a transaction."
                  : permission === "full"
                    ? "The unlocked local vault may execute bounded jobs while the desktop process remains running."
                    : "No transaction is authorized by creating a session."}
              </small>
            </div>
          </div>
          {fullAccessError && <p className="executionError">{fullAccessError}</p>}
          <div className="modalActions">
            <button onClick={onCancel}>Cancel</button>
            <button
              className="primaryButton"
              disabled={!title.trim() || !fullAccessReady || fullAccessBusy}
              onClick={() => void create()}
            >
              {fullAccessBusy ? "Creating session…" : "Create session"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function LimitOrderSimulationApprovalModal({
  preview,
  onCancel,
  onConfirm,
}: {
  preview: LimitOrderContractPreview;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="simulationApproval"
        role="dialog"
        aria-modal="true"
        aria-labelledby="limit-simulation-title"
      >
        <p className="kicker">Jupiter Trigger V2</p>
        <h2 id="limit-simulation-title">
          Register vault and simulate deposit?
        </h2>
        <p>
          Silfable will sign Jupiter's authentication message locally, retrieve
          or register the selected wallet's custodial Trigger vault, inspect the
          unsigned deposit transaction, and simulate it on Solana Mainnet.
        </p>
        <dl>
          <div>
            <dt>Wallet</dt>
            <dd>{shorten(preview.walletAddress)}</dd>
          </div>
          <div>
            <dt>Deposit amount</dt>
            <dd>{formatSolanaAmount(preview.inputAmount, preview.inputMint)}</dd>
          </div>
          <div>
            <dt>Trigger</dt>
            <dd>
              {preview.triggerCondition} ${preview.triggerPriceUsd}
            </dd>
          </div>
          <div>
            <dt>Expiry</dt>
            <dd>{new Date(preview.expiresAt).toLocaleString()}</dd>
          </div>
        </dl>
        <Notice tone="warning" title="No funds move in this step">
          Vault registration creates external Jupiter account state. The deposit
          remains unsigned and is never broadcast during simulation.
        </Notice>
        <footer>
          <button onClick={onCancel}>Cancel</button>
          <button className="primaryButton" onClick={onConfirm}>
            Register &amp; simulate
          </button>
        </footer>
      </section>
    </div>
  );
}
export function LimitOrderCancelSimulationModal({
  orderId,
  onCancel,
  onConfirm,
}: {
  orderId: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modalBackdrop" role="presentation">
      <section className="simulationApproval" role="dialog" aria-modal="true">
        <p className="kicker">Cancel limit order</p>
        <h2>Simulate vault withdrawal?</h2>
        <p>
          The current order state will be refreshed, then the unsigned
          withdrawal will be inspected and simulated. No signature or broadcast
          occurs yet.
        </p>
        <dl>
          <div>
            <dt>Order</dt>
            <dd>{orderId}</dd>
          </div>
          <div>
            <dt>Approval expiry</dt>
            <dd>90 seconds</dd>
          </div>
        </dl>
        <Notice tone="warning" title="Simulation only">
          Funds remain in the Trigger vault until you separately authorize
          withdrawal.
        </Notice>
        <footer>
          <button onClick={onCancel}>Cancel</button>
          <button className="primaryButton" onClick={onConfirm}>
            Simulate withdrawal
          </button>
        </footer>
      </section>
    </div>
  );
}
export function LimitOrderFinalModal({
  kind,
  preview,
  orderId,
  onCancel,
  onConfirm,
}: {
  kind: "create" | "cancel";
  preview?: LimitOrderContractPreview;
  orderId?: string;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const required =
    kind === "create" ? "CREATE LIMIT ORDER" : "CANCEL LIMIT ORDER";
  const ready = password.length > 0 && phrase === required && acknowledged;
  async function submit(): Promise<void> {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(password);
    } catch (cause) {
      setError(
        cleanErrorMessage(
          cause instanceof Error
            ? cause.message
            : "Mainnet request failed safely."
        )
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modalBackdrop" role="presentation">
      <section
        className="simulationApproval executionApproval"
        role="dialog"
        aria-modal="true"
      >
        <p className="kicker">Final Mainnet authorization</p>
        <h2>
          {kind === "create"
            ? "Deposit real funds into the Trigger vault"
            : "Withdraw remaining funds and cancel"}
        </h2>
        <p>
          {kind === "create"
            ? "The exact deposit transaction that passed simulation will be signed locally and submitted with the limit-order parameters."
            : "The exact withdrawal transaction that passed simulation will be signed locally and submitted."}
        </p>
        <dl>
          {preview && (
            <>
              <div>
                <dt>Wallet</dt>
                <dd>{shorten(preview.walletAddress)}</dd>
              </div>
              <div>
                <dt>Deposit amount</dt>
                <dd>{formatSolanaAmount(preview.inputAmount, preview.inputMint)}</dd>
              </div>
              <div>
                <dt>Trigger</dt>
                <dd>
                  {preview.triggerCondition} ${preview.triggerPriceUsd}
                </dd>
              </div>
            </>
          )}
          {orderId && (
            <div>
              <dt>Order</dt>
              <dd>{orderId}</dd>
            </div>
          )}
        </dl>
        <Notice tone="danger" title="Real Mainnet funds">
          If the result is unknown, inspect the receipt and active-order state
          before retrying.
        </Notice>
        <Field label="Master password">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label={`Type ${required}`}>
          <input
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
          />
        </Field>
        <label className="ackRow">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I understand this signs and broadcasts a real Mainnet transaction.
          </span>
        </label>
        {error && (
          <Notice tone="danger" title="Request blocked">
            {cleanErrorMessage(error)}
          </Notice>
        )}
        <footer>
          <button disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="primaryButton"
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {busy
              ? "Submitting…"
              : kind === "create"
                ? "Create order"
                : "Cancel & withdraw"}
          </button>
        </footer>
      </section>
    </div>
  );
}
export function EvmExecutionApprovalModal({
  action,
  proposal,
  preflight,
  onCancel,
  onConfirm,
}: {
  action: "approval" | "swap";
  proposal: EvmSwapProposal;
  preflight: EvmSwapPreflightEvidence;
  onCancel: () => void;
  onConfirm: (credentials: {
    masterPassword: string;
    confirmation: string;
  }) => Promise<void>;
}) {
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expectedConfirmation = action === "approval"
    ? "APPROVE EVM MAINNET"
    : "EXECUTE EVM MAINNET SWAP";
  const isPasswordEntered = masterPassword.trim().length > 0;
  const isConfirmationMatched = confirmation.trim().toUpperCase() === expectedConfirmation.toUpperCase();
  const ready = isPasswordEntered && isConfirmationMatched && acknowledged;
  async function submit(): Promise<void> {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ masterPassword, confirmation: expectedConfirmation });
    } catch (cause) {
      setError(
        cleanErrorMessage(
          cause instanceof Error
            ? cause.message
            : `The EVM ${action} was not submitted.`
        )
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modalBackdrop" role="presentation">
      <section
        className="simulationApproval executionApproval"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evm-execution-approval-title"
      >
        <p className="kicker">Final EVM Mainnet authorization</p>
        <h2 id="evm-execution-approval-title">
          {action === "approval" ? "Approve this exact token amount" : "Execute this exact EVM swap"}
        </h2>
        <p>
          {action === "approval"
            ? "This is a separate ERC-20 approval transaction. A confirmed approval does not execute the swap; a fresh trade review is required afterward."
             : `The exact ${proposal.quote.provider === "uniswap" ? "Uniswap" : "KyberSwap"} transaction will be signed locally and submitted once. An unknown broadcast must be reconciled before any retry.`}
        </p>
        <dl>
          <div><dt>Wallet</dt><dd>{shorten(proposal.walletAddress)}</dd></div>
          <div><dt>Pair</dt><dd>{proposal.quote.sellTokenSymbol} → {proposal.quote.buyTokenSymbol}</dd></div>
          <div><dt>Sell amount</dt><dd>{formatEvmTokenAmount(proposal.quote.sellAmount, proposal.quote.sellTokenSymbol)}</dd></div>
          <div><dt>Expected output</dt><dd>{formatEvmTokenAmount(preflight.expectedBuyAmount, proposal.quote.buyTokenSymbol)}</dd></div>
          <div><dt>Minimum output</dt><dd>{formatEvmTokenAmount(preflight.minimumBuyAmount, proposal.quote.buyTokenSymbol)}</dd></div>
          <div><dt>Maximum gas</dt><dd>{formatWeiToGweiOrEth(preflight.maxGasCostWei)}</dd></div>
          <div><dt>Preflight expiry</dt><dd>{new Date(preflight.expiresAt).toLocaleTimeString()}</dd></div>
        </dl>
        <Notice tone="warning" title="Irreversible Mainnet transaction">
          Verify the wallet, exact token contracts, amount, minimum output,
          and gas ceiling before continuing.
        </Notice>
        <Field label="Master password">
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Enter your master password"
            value={masterPassword}
            onChange={(event) => setMasterPassword(event.target.value)}
          />
        </Field>
        <Field label={`Type "${expectedConfirmation}"`}>
          <input
            placeholder={`Type: ${expectedConfirmation}`}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </Field>
        <label className="riskCheck">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>I authorize this exact EVM Mainnet transaction and understand its risks.</span>
        </label>
        {error && <p className="executionError">{cleanErrorMessage(error)}</p>}
        <footer>
          <button disabled={busy} onClick={onCancel}>Cancel</button>
          <button
            className="dangerButton"
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {busy
              ? "Signing and submitting…"
              : action === "approval"
                ? "Approve exact amount"
                : "Execute real swap"}
          </button>
        </footer>
      </section>
    </div>
  );
}
export function BridgeExecutionApprovalModal({
  proposal,
  preflight,
  onCancel,
  onConfirm,
}: {
  proposal: BridgeProposal;
  preflight: BridgePreflightEvidence;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}) {
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destination = bridgeDestination(proposal.contract.destinationChainId);
  const controlledAcceptance = isControlledBridgeAcceptance(proposal);
  const confirmationPhrase = controlledAcceptance
    ? CONTROLLED_BRIDGE_ACCEPTANCE_CONFIRMATION
    : destination.confirmation;
  const ready = masterPassword.length > 0 && confirmation === confirmationPhrase && acknowledged;
  async function submit(): Promise<void> {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try { await onConfirm(masterPassword); }
    catch (cause) { setError(cleanErrorMessage(cause instanceof Error ? cause.message : "Bridge execution was not started.")); }
    finally { setBusy(false); }
  }
   return (
    <div className="modalBackdrop" role="presentation">
      <section className="simulationApproval executionApproval" role="dialog" aria-modal="true" aria-labelledby="bridge-approval-title">
        <p className="kicker">{controlledAcceptance ? "Controlled Bridge Acceptance" : "Final cross-chain Mainnet authorization"}</p>
        <h2 id="bridge-approval-title">{controlledAcceptance ? "Run the 1 USDC Robinhood acceptance test?" : `Bridge real USDC to ${destination.label}?`}</h2>
          <p>The exact {proposal.quote.provider === "relay" ? "Relay" : "deBridge"} source transaction that passed simulation will be signed locally and submitted once. Settlement on {destination.label} is asynchronous.</p>
        <dl>
          <div><dt>Source</dt><dd>Solana USDC</dd></div>
            <div><dt>Destination</dt><dd>{destination.label} {destination.symbol}</dd></div>
          <div><dt>Source wallet</dt><dd>{proposal.contract.sourceWallet}</dd></div>
          <div><dt>{destination.label} recipient</dt><dd>{proposal.contract.destinationRecipient}</dd></div>
          <div><dt>USDC source amount</dt><dd>{(Number(proposal.contract.amountIn) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC</dd></div>
          <div><dt>Minimum destination</dt><dd>{(Number(proposal.contract.minimumDestinationAmount) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC</dd></div>
          <div><dt>Provider order</dt><dd>{shorten(proposal.quote.orderId)}</dd></div>
          <div><dt>Solana network fee</dt><dd>{formatLamportsToSol(preflight.sourceNetworkFeeLamports)}</dd></div>
          <div><dt>Approval expiry</dt><dd>{new Date(preflight.expiresAt).toLocaleString()}</dd></div>
        </dl>
        <Notice tone="danger" title={controlledAcceptance ? "Canary only: this does not unlock production bridge execution" : "One-attempt irreversible source broadcast"}>
          A timeout or unknown response must be reconciled by the stored signature and provider order. Never submit this route again automatically.
        </Notice>
        <Field label="Master password"><input type="password" autoComplete="current-password" value={masterPassword} onChange={(event) => setMasterPassword(event.target.value)} /></Field>
           <Field label={`Type "${confirmationPhrase}"`}><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></Field>
        <label className="riskCheck"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I authorize this exact source transaction and its cross-chain settlement risks.</span></label>
        {error && <p className="executionError">{cleanErrorMessage(error)}</p>}
        <footer><button disabled={busy} onClick={onCancel}>Cancel</button><button className="dangerButton" disabled={!ready || busy} onClick={() => void submit()}>{busy ? "Signing and submitting once…" : controlledAcceptance ? "Broadcast controlled acceptance" : "Bridge real USDC"}</button></footer>
      </section>
    </div>
  );
}
