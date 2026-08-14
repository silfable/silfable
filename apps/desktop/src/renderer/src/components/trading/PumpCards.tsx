// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, ArrowUp, Bot, Brain, CirclePlus, Settings, ShieldCheck, Target } from 'lucide-react';
import { Button, Modal } from '../../ui';
import { shorten, cn } from '../../lib/utils';
import { StatusPill, Notice, Field, SetupCard, SetupActions, Brand, BrandMark, CornerFooter, RailSection, ProviderCard } from '../setup/SetupHelpers';
import { ACTIVITY_LEVELS, INTEGRATION_CATEGORIES, SETUP_STEPS, STORAGE_KEY } from '../types';
import type { BridgePreflightEvidence, BridgeProposal, BridgeReceipt, BridgeDestinationChain, EmergencyStopStatus, EvmBridgeContract, EvmBridgePreflight, EvmBridgeQuote, EvmBridgeReceipt, EvmChainKey, EvmPortfolioSnapshot, EvmSessionExecutionReceipt, EvmSwapPreflightEvidence, EvmSwapProposal, LimitOrderCancelSimulation, LimitOrderContractPreview, LimitOrderExecutionReceipt, LimitOrderSimulationPreview, LegacyPumpLaunchMetadataPackage, MissionContractPreview, MissionExecutionReceipt, MissionSimulationPreview, OpenRouterModelView, PortfolioSnapshot, PumpExecutionRecord, PumpFinalRevalidation, PumpLaunchDraft, PumpLaunchDraftInput, PumpLaunchMetadata, PumpLaunchPreflight, PumpLaunchFinalRevalidation, PumpLaunchExecutionRecord, PumpRiskSettings, PumpSimulationArtifact, PumpTokenIntelligence, PumpTradeContractPreview, RuntimeStatus, SessionRecord, TransactionSettings, WalletActivitySnapshot } from '@silfable/contracts';
import { BRIDGE_ARBITRUM_CHAIN_ID, BRIDGE_ARBITRUM_USDC_ADDRESS, BRIDGE_AVALANCHE_CHAIN_ID, BRIDGE_AVALANCHE_USDC_ADDRESS, BRIDGE_BASE_CHAIN_ID, BRIDGE_BASE_USDC_ADDRESS, BRIDGE_ETHEREUM_CHAIN_ID, BRIDGE_ETHEREUM_USDC_ADDRESS, BRIDGE_OPTIMISM_CHAIN_ID, BRIDGE_OPTIMISM_USDC_ADDRESS, BRIDGE_POLYGON_CHAIN_ID, BRIDGE_POLYGON_USDC_ADDRESS, BRIDGE_ROBINHOOD_CHAIN_ID, BRIDGE_ROBINHOOD_USDG_ADDRESS, BRIDGE_SOLANA_CHAIN_ID, BRIDGE_SOLANA_USDC_MINT } from '@silfable/contracts';

export function PumpTradePreviewCard({
  preview,
  simulation,
  simulating,
  onSimulate,
}: {
  preview: PumpTradeContractPreview;
  simulation: PumpSimulationArtifact | null;
  simulating: boolean;
  onSimulate: () => void;
}) {
  const passed = preview.checks.filter((item) => item.status === "pass").length;
  return (
    <section className={`missionPreview ${preview.status === "blocked" ? "blocked" : "ready"}`}>
      <header>
        <div><span>Pump.fun trade proposal</span><strong>{preview.goal}</strong></div>
        <StatusPill tone={preview.status === "blocked" ? "danger" : "success"}>{preview.status}</StatusPill>
      </header>
      <dl>
        <div><dt>Side / venue</dt><dd>{preview.side} · {preview.venue}</dd></div>
        <div><dt>Input</dt><dd>{preview.inputAmount} raw</dd></div>
        <div><dt>Minimum output</dt><dd>{preview.minimumOutputAmount} raw</dd></div>
        <div><dt>Policy</dt><dd>{passed}/{preview.checks.length} passed</dd></div>
        <div><dt>Inspector manifest</dt><dd>{preview.inspectionBoundary ? `${preview.inspectionBoundary.instructionName ?? "Unavailable"} · ${preview.inspectionBoundary.accountCount} roles` : "Legacy proposal"}</dd></div>
        <div><dt>Transaction inspected</dt><dd>{preview.inspectionBoundary?.transactionInspected ? "Yes" : "No · builder locked"}</dd></div>
      </dl>
      <div className="missionChecks">
        {preview.checks.map((item) => (
          <div className={item.status} key={item.code}>
            <span>{item.status === "pass" ? "OK" : "BLOCK"}</span><p>{item.message}</p>
          </div>
        ))}
      </div>
      <footer>
        <div><span>Execution locked</span><small>Simulation is unsigned. A fresh final revalidation, master password, and exact manual confirmation are required before one broadcast attempt.</small></div>
        <button
          disabled={preview.status !== "ready-for-review" || preview.venue !== "bonding-curve-active" || simulating}
          onClick={onSimulate}
        >
          {simulating ? "Simulatingâ€¦" : simulation ? "Simulate again" : "Simulate unsigned"}
        </button>
      </footer>
    </section>
  );
}
export function PumpExecutionCard({
  execution,
  preview,
  simulation,
  verifying,
  onVerify,
}: {
  execution: PumpExecutionRecord;
  preview: PumpTradeContractPreview;
  simulation: PumpSimulationArtifact | null;
  verifying: boolean;
  onVerify: () => void;
}) {
  const receipt = execution.receipt;
  const expectedOutput = simulation?.quoteEvidence?.expectedOutputAmount ?? preview.minimumOutputAmount;
  const actualSlippageBps = receipt
    ? calculateActualSlippageBps(expectedOutput, receipt.actualOutputAmount)
    : null;
  const walletOutflowLamports = receipt && BigInt(receipt.walletLamportDelta) < 0n
    ? (-BigInt(receipt.walletLamportDelta)).toString()
    : "0";
  const tone = execution.status === "finalized"
    ? "success"
    : execution.status === "failed"
      ? "danger"
      : "warning";
  return (
    <section className={`missionPreview pumpExecutionCard ${execution.status === "finalized" ? "ready" : "blocked"}`}>
      <header>
        <div>
          <span>Pump.fun Mainnet execution</span>
          <strong>{execution.status === "finalized"
            ? "Finalized and independently reconciled"
            : execution.status === "failed"
              ? "Execution failed"
              : "Broadcast verification pending"}</strong>
        </div>
        <StatusPill tone={tone}>{execution.status}</StatusPill>
      </header>
      <dl>
        <div><dt>Side</dt><dd>{execution.side.toUpperCase()}</dd></div>
        <div><dt>Signature</dt><dd>{shorten(execution.signature)}</dd></div>
        <div><dt>Transaction digest</dt><dd>{execution.transactionDigest.slice(0, 16)}...</dd></div>
        <div><dt>Last valid block height</dt><dd>{execution.lastValidBlockHeight.toLocaleString()}</dd></div>
        {receipt && (
          <>
            <div><dt>Actual input</dt><dd>{receipt.actualInputAmount} raw</dd></div>
            <div><dt>Expected output</dt><dd>{expectedOutput} raw</dd></div>
            <div><dt>Actual output</dt><dd>{receipt.actualOutputAmount} raw</dd></div>
            <div><dt>Actual slippage</dt><dd>{actualSlippageBps === null ? "Unavailable" : `${actualSlippageBps} bps`}</dd></div>
            <div><dt>Network fee</dt><dd>{receipt.networkFeeLamports.toLocaleString()} lamports</dd></div>
            <div><dt>Account funding</dt><dd>{receipt.accountCreationFundingLamports.toLocaleString()} lamports</dd></div>
            <div><dt>Total wallet SOL outflow</dt><dd>{walletOutflowLamports} lamports</dd></div>
            <div><dt>Finalized slot</dt><dd>{receipt.slot.toLocaleString()}</dd></div>
          </>
        )}
      </dl>
      {execution.error && <p className="executionError">{execution.error}</p>}
      <footer>
        <div>
          <span>{execution.status === "finalized" ? "Finalized receipt persisted" : "No automatic rebroadcast"}</span>
          <small>
            {execution.status === "finalized"
              ? "Balance and position panels refresh from finalized Mainnet data."
              : "Silfable only checks the locally derived signature."}
          </small>
        </div>
        <div className="receiptActions">
          <button onClick={() => void window.silfable.copyTransactionSignature({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            signature: execution.signature,
          })}>Copy signature</button>
          <button onClick={() => void window.silfable.openTransactionInExplorer({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            signature: execution.signature,
          })}>Open explorer</button>
          {execution.status !== "finalized" && execution.status !== "failed" && (
            <button disabled={verifying} onClick={onVerify}>
              {verifying ? "Verifying..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
