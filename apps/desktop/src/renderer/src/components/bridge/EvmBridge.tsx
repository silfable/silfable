// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, ArrowUp, Bot, Brain, CirclePlus, Settings, ShieldCheck, Target } from 'lucide-react';
import { Button, Modal } from '../../ui';
import { shorten, cn } from '../../lib/utils';
import { StatusPill, Notice, Field, SetupCard, SetupActions, Brand, BrandMark, CornerFooter, RailSection, ProviderCard } from '../setup/SetupHelpers';
import { ACTIVITY_LEVELS, INTEGRATION_CATEGORIES, SETUP_STEPS, STORAGE_KEY, SOLANA_ADDRESS_PATTERN, BRIDGE_DESTINATIONS, bridgeDestination, EVM_BRIDGE_ASSETS } from '../types';
import type { BridgePreflightEvidence, BridgeProposal, BridgeReceipt, BridgeDestinationChain, EmergencyStopStatus, EvmBridgeContract, EvmBridgePreflight, EvmBridgeQuote, EvmBridgeReceipt, EvmChainKey, EvmPortfolioSnapshot, EvmSessionExecutionReceipt, EvmSwapPreflightEvidence, EvmSwapProposal, LimitOrderCancelSimulation, LimitOrderContractPreview, LimitOrderExecutionReceipt, LimitOrderSimulationPreview, LegacyPumpLaunchMetadataPackage, MissionContractPreview, MissionExecutionReceipt, MissionSimulationPreview, OpenRouterModelView, PortfolioSnapshot, PumpExecutionRecord, PumpFinalRevalidation, PumpLaunchDraft, PumpLaunchDraftInput, PumpLaunchMetadata, PumpLaunchPreflight, PumpLaunchFinalRevalidation, PumpLaunchExecutionRecord, PumpRiskSettings, PumpSimulationArtifact, PumpTokenIntelligence, PumpTradeContractPreview, RuntimeStatus, SessionRecord, TransactionSettings, WalletActivitySnapshot } from '@silfable/contracts';
import { BRIDGE_ARBITRUM_CHAIN_ID, BRIDGE_ARBITRUM_USDC_ADDRESS, BRIDGE_AVALANCHE_CHAIN_ID, BRIDGE_AVALANCHE_USDC_ADDRESS, BRIDGE_BASE_CHAIN_ID, BRIDGE_BASE_USDC_ADDRESS, BRIDGE_ETHEREUM_CHAIN_ID, BRIDGE_ETHEREUM_USDC_ADDRESS, BRIDGE_OPTIMISM_CHAIN_ID, BRIDGE_OPTIMISM_USDC_ADDRESS, BRIDGE_POLYGON_CHAIN_ID, BRIDGE_POLYGON_USDC_ADDRESS, BRIDGE_ROBINHOOD_CHAIN_ID, BRIDGE_ROBINHOOD_USDG_ADDRESS, BRIDGE_SOLANA_CHAIN_ID, BRIDGE_SOLANA_USDC_MINT } from '@silfable/contracts';

export function EvmBridgeWorkspace({
  sessionId,
  sourceChainKey,
  sourceWallet,
}: {
  sessionId: string;
  sourceChainKey: EvmBridgeChainKey;
  sourceWallet: string;
}) {
  const source = EVM_BRIDGE_ASSETS[sourceChainKey];
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState<EvmBridgeDestinationSelection>("solana");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1.00");
  const [minimum, setMinimum] = useState("0.90");
  const [maximumTotalFeeUsd, setMaximumTotalFeeUsd] = useState("3.00");
  const [maximumNetworkFeeWei, setMaximumNetworkFeeWei] = useState("10000000000000000");
  const [prepared, setPrepared] = useState<{ quote: EvmBridgeQuote; preflight: EvmBridgePreflight } | null>(null);
  const [receipt, setReceipt] = useState<EvmBridgeReceipt | null>(null);
  const [approval, setApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void window.silfable.listEvmBridgeReceipts().then((response) => {
      if (!live) return;
      const latest = response.receipts
        .filter((item) => item.sourceWallet.toLowerCase() === sourceWallet.toLowerCase())
        .sort((a, b) => Date.parse(b.reconciledAt) - Date.parse(a.reconciledAt))[0] ?? null;
      setReceipt(latest);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [sourceWallet]);

 function toRaw(value: string): string | null {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(value)) return null;
    const [whole = "0", fraction = ""] = value.split(".");
    const raw = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
    return raw > 0n ? raw.toString() : null;
  }

  async function prepare(): Promise<void> {
    const amountIn = toRaw(amount);
    const minimumDestinationAmount = toRaw(minimum);
    const maximumFee = Number(maximumTotalFeeUsd);
    if (amountIn === null || minimumDestinationAmount === null || BigInt(minimumDestinationAmount) > BigInt(amountIn)) {
      setError("Enter valid six-decimal stablecoin amounts; the minimum output cannot exceed the source amount.");
      return;
    }
    if (!/^\d+$/u.test(maximumNetworkFeeWei) || BigInt(maximumNetworkFeeWei) === 0n) {
      setError("Maximum source network fee must be a positive raw wei amount.");
      return;
    }
    if (!Number.isFinite(maximumFee) || maximumFee <= 0 || maximumFee > 1_000) {
      setError("Maximum provider fee must be between $0 and $1,000.");
      return;
    }
    const recipientValid = destination === "solana"
      ? SOLANA_ADDRESS_PATTERN.test(recipient)
      : /^0x[a-fA-F0-9]{40}$/u.test(recipient);
    if (!recipientValid) {
      setError(destination === "solana" ? "Enter the exact destination Solana address." : "Enter the exact destination EVM address.");
      return;
    }
    const now = new Date();
    const destinationAsset = destination === "solana" ? null : EVM_BRIDGE_ASSETS[destination];
    const contract: EvmBridgeContract = {
      id: crypto.randomUUID(), provider: "relay",
      sourceChainId: source.chainId as EvmBridgeContract["sourceChainId"],
      sourceChainKey, sourceAssetAddress: source.address, sourceAssetSymbol: source.symbol,
      sourceAssetDecimals: 6, sourceWallet,
      destination: destination === "solana"
       ? {
            kind: "solana", chainId: BRIDGE_SOLANA_CHAIN_ID, chainKey: "solana",
            assetAddress: BRIDGE_SOLANA_USDC_MINT, assetSymbol: "USDC", assetDecimals: 6,
            recipient,
          }
        : {
            kind: "evm", chainId: destinationAsset!.chainId as Extract<EvmBridgeContract["destination"], { kind: "evm" }>["chainId"],
            chainKey: destination, assetAddress: destinationAsset!.address,
            assetSymbol: destinationAsset!.symbol, assetDecimals: 6, recipient,
          },
      amountIn, minimumDestinationAmount, maximumNetworkFeeWei,
      maximumTotalFeeUsd: maximumFee, slippageBps: 50,
      deadline: new Date(now.getTime() + 20 * 60_000).toISOString(),
      timeoutSeconds: 3_600, refundPolicy: "relay-origin-refund", createdAt: now.toISOString(),
    };
    setBusy(true);
    setError(null);
    setPrepared(null);
    try {
      const result = await window.silfable.prepareEvmBridge({
        schemaVersion: 1, requestId: crypto.randomUUID(), sessionId, contract,
        acknowledgedSimulationOnly: true,
      });
      setPrepared({ quote: result.quote, preflight: result.preflight });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The EVM bridge review was blocked safely.");
    } finally {
      setBusy(false);
    }
  }

   async function execute(credentials: { masterPassword: string; confirmation: string }): Promise<void> {
    if (prepared === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.silfable.executeEvmBridge({
        schemaVersion: 1, requestId: crypto.randomUUID(), sessionId,
        preflightId: prepared.preflight.id, action: prepared.preflight.action,
        masterPassword: credentials.masterPassword,
        confirmation: credentials.confirmation as "APPROVE BRIDGE TOKEN" | "EXECUTE EVM BRIDGE MAINNET",
        acknowledgedIrreversible: true,
      });
      setReceipt(result.receipt);
      setPrepared(null);
      setApproval(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The EVM bridge source transaction was not submitted.");
    } finally {
      setBusy(false);
    }
  }

  async function reconcile(): Promise<void> {
    if (receipt === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.silfable.reconcileEvmBridge({
        schemaVersion: 1, requestId: crypto.randomUUID(), receiptId: receipt.id,
      });
      setReceipt(result.receipt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cross-chain settlement could not be verified yet.");
    } finally {
      setBusy(false);
    }
  }

  return null;
}

/** Read-only bridge evidence card used by the chat-first workspace flow. */
export function EvmBridgeProposalCard({
  preparation,
  receipts = [],
  fullAccess,
  dispatching,
  onDispatch,
}: {
  preparation: { quote: EvmBridgeQuote; preflight: EvmBridgePreflight; contract?: EvmBridgeContract };
  receipts?: EvmBridgeReceipt[];
  fullAccess: boolean;
  dispatching: boolean;
  onDispatch: () => void;
}) {
  const { quote, preflight, contract } = preparation;
  const terminal = receipts.some((receipt) => receipt.status === "destination-confirmed" || receipt.status === "source-reverted" || receipt.status === "destination-failed" || receipt.status === "refunded");
  const action = preflight.action === "approval" ? "Exact USDG approval" : "Relay bridge deposit";
  const format = (raw: string | undefined, symbol: string) => raw === undefined ? "Unavailable" : `${(Number(raw) / 1_000_000).toFixed(6)} ${symbol}`;
  return (
    <section className="bridgeProposalCard">
      <header>
        <div><span className="kicker">Robinhood · Relay · bridge proposal</span><h3>USDG → Solana USDC</h3></div>
        <StatusPill tone={terminal ? "success" : "warning"}>{receipts.at(-1)?.status ?? "preflighted"}</StatusPill>
      </header>
      <dl className="bridgeEvidenceGrid">
        <div><dt>Source wallet</dt><dd>{contract ? shorten(contract.sourceWallet) : "Robinhood session"}</dd></div>
        <div><dt>Solana recipient</dt><dd>{contract ? shorten(contract.destination.recipient) : "Pinned in preflight"}</dd></div>
        <div><dt>Source amount</dt><dd>{format(contract?.amountIn, "USDG")}</dd></div>
        <div><dt>Expected receive</dt><dd>{format(quote.estimatedDestinationAmount, "USDC")}</dd></div>
        <div><dt>Minimum receive</dt><dd>{format(quote.minimumDestinationAmount, "USDC")}</dd></div>
        <div><dt>Provider impact</dt><dd>{quote.totalFeeUsd === undefined ? "Verified by Relay" : `$${Number(quote.totalFeeUsd).toFixed(4)}`}</dd></div>
        <div><dt>Current source step</dt><dd>{action}</dd></div>
        <div><dt>Quote expiry</dt><dd>{quote.quoteExpiresAt ? new Date(quote.quoteExpiresAt).toLocaleTimeString() : "Short-lived"}</dd></div>
      </dl>
      <p className="bridgeSafetyCopy">Exact source chain, token, recipient, amount, fee cap, and minimum receive are pinned before any local signature. Solana settlement is independently verified.</p>
      {receipts.length > 0 && <div className="bridgeReceiptPanel">
        <strong>Bridge activity</strong>
        {receipts.map((receipt) => <span key={receipt.id ?? receipt.transactionHash}>{receipt.action ?? "bridge"}: {receipt.status ?? "pending"} · {receipt.transactionHash ? shorten(receipt.transactionHash) : "no hash"}</span>)}
      </div>}
      <footer>
        {!terminal && (
          <button className="dangerButton" disabled={dispatching} onClick={onDispatch}>
            {dispatching ? "Dispatching local bridge steps…" : fullAccess ? "Dispatch Full Access bridge" : "Review EVM bridge"}
          </button>
        )}
      </footer>
    </section>
  );
}
export function BridgeProposalCard({
  proposal,
  preflight,
  receipt,
  reconciling,
  onExecute,
  onReconcile,
}: {
  proposal: BridgeProposal;
  preflight: BridgePreflightEvidence;
  receipt: BridgeReceipt | null;
  reconciling: boolean;
  onExecute: () => void;
  onReconcile?: () => void;
}) {
  const formatAsset = (raw: string, symbol: "USDC" | "USDG") => `${(Number(raw) / 1_000_000).toFixed(6)} ${symbol}`;
  const destination = bridgeDestination(proposal.contract.destinationChainId);
  const providerLabel = proposal.quote.provider === "relay" ? "Relay" : "deBridge DLN";
  const terminal = receipt?.state === "destination-confirmed" || receipt?.state === "refunded" || receipt?.state === "source-failed" || receipt?.state === "destination-failed";
  return (
    <section className="bridgeProposalCard">
      <header><div><span className="kicker">Bridge contract · {providerLabel}</span><h3>Solana USDC → {destination.label} {destination.symbol}</h3></div><StatusPill tone={receipt?.state === "destination-confirmed" ? "success" : "warning"}>{receipt?.state ?? "simulated"}</StatusPill></header>
      <dl className="bridgeEvidenceGrid">
        <div><dt>Source wallet</dt><dd>{shorten(proposal.contract.sourceWallet)}</dd></div>
        <div><dt>{destination.label} recipient</dt><dd>{shorten(proposal.contract.destinationRecipient)}</dd></div>
        <div><dt>Source amount</dt><dd>{formatAsset(proposal.contract.amountIn, "USDC")}</dd></div>
        <div><dt>Expected on {destination.label}</dt><dd>{formatAsset(proposal.quote.estimatedDestinationAmount, destination.symbol)}</dd></div>
        <div><dt>Minimum on {destination.label}</dt><dd>{formatAsset(proposal.contract.minimumDestinationAmount, destination.symbol)}</dd></div>
        <div><dt>Total provider fee</dt><dd>${proposal.quote.fee.totalFeeUsd.toFixed(4)}</dd></div>
        <div><dt>Solana network fee</dt><dd>{preflight.sourceNetworkFeeLamports.toLocaleString()} lamports</dd></div>
        <div><dt>Quote expiry</dt><dd>{new Date(preflight.expiresAt).toLocaleTimeString()}</dd></div>
      </dl>
      <p className="bridgeSafetyCopy">Order <code>{proposal.quote.orderId}</code> · {preflight.programIds.length} allowlisted Solana programs · unsigned simulation passed.</p>
      {receipt && <div className="bridgeReceiptPanel">
        <strong>Encrypted cross-chain receipt</strong>
        <span>Source signature: {shorten(receipt.sourceSignature)}</span>
        <span>Provider: {receipt.providerStatus ?? "pending"}</span>
        <span>Destination tx: {receipt.destinationTransactionHash ? shorten(receipt.destinationTransactionHash) : receipt.state === "relay-fulfilled-unverified" ? "not supplied by provider" : "pending"}</span>
        <span>Actual destination: {receipt.actualDestinationAmount === null ? "pending" : formatAsset(receipt.actualDestinationAmount, destination.symbol)}</span>
        {receipt.lastError && <span className="executionError">{receipt.lastError}</span>}
        <div className="receiptActions" style={{ marginTop: "8px" }}>
          <button onClick={() => void window.silfable.copyTransactionSignature({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            signature: receipt.sourceSignature,
          })}>Copy signature</button>
          <button onClick={() => void window.silfable.openTransactionInExplorer({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            signature: receipt.sourceSignature,
          })}>Open Solana Explorer</button>
        </div>
      </div>}
      <footer>
        {!receipt && <button className="dangerButton" onClick={onExecute}>Final Mainnet approval</button>}
        {receipt && !terminal && onReconcile && <button disabled={reconciling} onClick={onReconcile}>{reconciling ? `Checking source, relay & ${destination.label}…` : "Reconcile cross-chain status"}</button>}
      </footer>
    </section>
  );
}
