// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, ArrowUp, Bot, Brain, CirclePlus, Settings, ShieldCheck, Target, ShieldAlert, Sparkles, Zap, KeyRound, KeySquare, ChevronRight, MessageSquare, History, List, X, Flame } from 'lucide-react';
import { Button, Modal, Input, Badge } from '../ui';
import { shorten, cn } from '../../lib/utils';
import { formatEvmTokenAmount, formatWeiToGweiOrEth, formatRuntimeTokens, formatPortfolioUsd, portfolioAssetUsd, formatPortfolioAmount, formatPumpMetric, formatPumpPercent, formatPumpBps, formatPumpRawAmount, formatLamportsToSol } from '../../lib/formatters';
import { StatusPill, Notice, Field, SetupCard, SetupActions, Brand, BrandMark, CornerFooter, RailSection, ProviderCard } from '../setup/SetupHelpers';
import { ACTIVITY_LEVELS, INTEGRATION_CATEGORIES, SETUP_STEPS, STORAGE_KEY } from '../types';
import type { BridgePreflightEvidence, BridgeProposal, BridgeReceipt, BridgeDestinationChain, EmergencyStopStatus, EvmBridgeContract, EvmBridgePreflight, EvmBridgeQuote, EvmBridgeReceipt, EvmChainKey, EvmPortfolioSnapshot, EvmSessionExecutionReceipt, EvmSwapPreflightEvidence, EvmSwapProposal, LimitOrderCancelSimulation, LimitOrderContractPreview, LimitOrderExecutionReceipt, LimitOrderSimulationPreview, LegacyPumpLaunchMetadataPackage, MissionContractPreview, MissionExecutionReceipt, MissionSimulationPreview, OpenRouterModelView, PortfolioSnapshot, PumpExecutionRecord, PumpFinalRevalidation, PumpLaunchDraft, PumpLaunchDraftInput, PumpLaunchMetadata, PumpLaunchPreflight, PumpLaunchFinalRevalidation, PumpLaunchExecutionRecord, PumpRiskSettings, PumpSimulationArtifact, PumpTokenIntelligence, PumpTradeContractPreview, RuntimeStatus, SessionRecord, TransactionSettings, WalletActivitySnapshot, SetupState, AgentSettings } from '@silfable/contracts';
import { BRIDGE_ARBITRUM_CHAIN_ID, BRIDGE_ARBITRUM_USDC_ADDRESS, BRIDGE_AVALANCHE_CHAIN_ID, BRIDGE_AVALANCHE_USDC_ADDRESS, BRIDGE_BASE_CHAIN_ID, BRIDGE_BASE_USDC_ADDRESS, BRIDGE_ETHEREUM_CHAIN_ID, BRIDGE_ETHEREUM_USDC_ADDRESS, BRIDGE_OPTIMISM_CHAIN_ID, BRIDGE_OPTIMISM_USDC_ADDRESS, BRIDGE_POLYGON_CHAIN_ID, BRIDGE_POLYGON_USDC_ADDRESS, BRIDGE_ROBINHOOD_CHAIN_ID, BRIDGE_ROBINHOOD_USDG_ADDRESS, BRIDGE_SOLANA_CHAIN_ID, BRIDGE_SOLANA_USDC_MINT } from '@silfable/contracts';

export function EvmSwapProposalCard({
  proposal,
  preflight,
  receipts,
  preparing,
  executing,
  executionEnabled,
  executionMissing,
  fullAccess,
  onPrepare,
  onExecute,
}: {
  proposal: EvmSwapProposal;
  preflight: EvmSwapPreflightEvidence | null;
  receipts: EvmSessionExecutionReceipt[];
  preparing: boolean;
  executing: boolean;
  executionEnabled: boolean;
  executionMissing: string[];
  fullAccess?: boolean;
  onPrepare: () => void;
  onExecute: () => void;
}) {
  const latestReceipt = receipts.at(-1) ?? null;
  const swapConfirmed = receipts.some(
    (receipt) => receipt.kind === "swap" && receipt.status === "confirmed",
  );
  const approvalConfirmed = receipts.some(
    (receipt) => receipt.kind === "approval" && receipt.status === "confirmed",
  );
  async function openEvmExplorer(receipt: EvmSessionExecutionReceipt): Promise<void> {
    const chainKey = receipt.chainKey ?? proposal.chainKey;
    if (!chainKey) throw new Error("This EVM receipt has no locked chain scope.");
    await window.silfable.openTransactionInExplorer({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      chainKey,
      transactionHash: receipt.transactionHash,
    });
  }
  return (
    <section className={`missionPreview swapRouteCard evmSwapCard ${proposal.quote.liquidityAvailable ? "ready" : "blocked"}`}>
      <header>
        <div>
          <span>ROBINHOOD CHAIN · {proposal.quote.provider ?? "chain router"} · QUOTE ONLY</span>
          <strong>
            {proposal.quote.sellTokenSymbol} → {proposal.quote.buyTokenSymbol}
          </strong>
        </div>
        <StatusPill tone={swapConfirmed || proposal.quote.liquidityAvailable ? "success" : "warning"}>
          {swapConfirmed
            ? "Swap confirmed"
            : approvalConfirmed
              ? "Approval confirmed"
              : proposal.quote.liquidityAvailable
                ? "Liquidity found"
                : "Blocked"}
        </StatusPill>
      </header>
      <dl className="swapRouteMetrics">
        <div><dt>Input</dt><dd>{formatEvmTokenAmount(proposal.quote.sellAmount, proposal.quote.sellTokenSymbol)}</dd></div>
        <div><dt>Expected output</dt><dd>{formatEvmTokenAmount(proposal.quote.buyAmount, proposal.quote.buyTokenSymbol)}</dd></div>
        <div><dt>Minimum output</dt><dd>{formatEvmTokenAmount(proposal.quote.minBuyAmount, proposal.quote.buyTokenSymbol)}</dd></div>
        <div><dt>Maximum slippage</dt><dd>{proposal.slippageBps} bps</dd></div>
      </dl>
      <dl className="swapRouteDetails">
        <div><dt>Route</dt><dd>{proposal.quote.provider === "uniswap" ? "Uniswap Classic" : "KyberSwap"} · Robinhood</dd></div>
        <div><dt>Wallet</dt><dd>{shorten(proposal.walletAddress)}</dd></div>
        <div><dt>Sell Contract</dt><dd>{shorten(proposal.quote.sellToken)}</dd></div>
        <div><dt>Buy Contract</dt><dd>{shorten(proposal.quote.buyToken)}</dd></div>
      </dl>
      {preflight && (
        <dl>
          <div><dt>Current Allowance</dt><dd>{formatEvmTokenAmount(preflight.currentAllowance, proposal.quote.sellTokenSymbol)}</dd></div>
          <div><dt>Approval Status</dt><dd>{preflight.allowanceRequired ? "Required" : "Not required"}</dd></div>
          <div><dt>Gas Limit</dt><dd>{Number(preflight.gasLimit).toLocaleString()} units</dd></div>
          <div><dt>Maximum Gas Fee</dt><dd>{formatWeiToGweiOrEth(preflight.maxGasCostWei)}</dd></div>
          <div><dt>Firm Minimum Buy</dt><dd>{formatEvmTokenAmount(preflight.minimumBuyAmount, proposal.quote.buyTokenSymbol)}</dd></div>
          <div><dt>Quote Expiry</dt><dd>{new Date(preflight.expiresAt).toLocaleTimeString()}</dd></div>
        </dl>
      )}
      {receipts.length > 0 && (
        <div className="activityList">
          {receipts.map((receipt) => {
            const explorerTxUrl = `https://robinhoodchain.blockscout.com/tx/${receipt.transactionHash}`;
            return (
              <div key={receipt.id} className="swapReceiptRow">
                <div className="swapReceiptIdentity">
                  <span className={`swapReceiptStatus ${receipt.status}`}>
                    {receipt.status}
                  </span>
                  <div>
                    <strong>{receipt.kind} · {shorten(receipt.transactionHash)}</strong>
                    <small>{new Date(receipt.reconciledAt).toLocaleTimeString()}</small>
                  </div>
                </div>
                <a
                  href={explorerTxUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    void openEvmExplorer(receipt);
                  }}
                  className="swapExplorerLink"
                >
                  Open explorer
                </a>
              </div>
            );
          })}
        </div>
      )}
      {!executionEnabled && (
        <Notice tone="info" title="EVM release gate remains locked">
          {executionMissing.length > 0
            ? `Missing evidence: ${executionMissing.join(", ")}.`
            : "Independent EVM release evidence has not been recorded."}
        </Notice>
      )}
      {latestReceipt?.status === "unknown" && (
        <Notice tone="warning" title="Broadcast status unknown">
          Reconcile this transaction from Settings before preparing another action.
        </Notice>
      )}
     <footer>
        <span>
          {swapConfirmed
            ? "Swap confirmed"
            : approvalConfirmed && !preflight
              ? "Approval confirmed · swap not submitted · fresh review required"
              : fullAccess
                ? preparing || executing
                  ? "Full Access is preparing and executing locally"
                  : "Full Access execution is local-only"
                : "No signing authority granted"}
        </span>
        {!fullAccess && !swapConfirmed && latestReceipt?.status !== "unknown" && !preflight && (
          <button
            className="primaryButton"
            disabled={preparing || !proposal.quote.liquidityAvailable}
            onClick={onPrepare}
          >
            {preparing
              ? "Preparing…"
              : approvalConfirmed
                ? "Review route again"
                : "Review route"}
          </button>
        )}
        {!fullAccess && !swapConfirmed && preflight && (
          <button
            className="dangerButton"
            disabled={executing || !executionEnabled}
            onClick={onExecute}
          >
            {executing
              ? "Submitting…"
              : preflight.allowanceRequired
                ? "Review in wallet"
                : "Review in wallet"}
          </button>
        )}
      </footer>
    </section>
  );
}

/** Non-executable review artifact for adding one exact ERC-20 contract to a
 * Full Access Robinhood session. Confirmation stays in the chat so the main
 * process can bind the typed phrase to its short-lived pending review. */
export function FullAccessEvmAssetReviewCard({
  review,
  onAuthorize,
}: {
  review: { id: string; address: string; symbol: string; decimals: number; verifiedAt: string; expiresAt: string };
  onAuthorize: () => Promise<void>;
}) {
  const confirmation = `AUTHORIZE FULL ACCESS ASSET ${review.id}`;
  const [authorizing, setAuthorizing] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  async function authorize(): Promise<void> {
    try {
      setAuthorizing(true);
      await onAuthorize();
      setAuthorized(true);
    } catch (error) {
      console.warn("Unable to authorize Full Access asset", error);
    } finally {
      setAuthorizing(false);
    }
  }

  return (
    <section className="missionPreview ready">
      <header>
        <div>
          <span>ROBINHOOD · FULL ACCESS · ASSET REVIEW</span>
          <strong>{review.symbol} contract authorization</strong>
        </div>
        <StatusPill tone="warning">Review required</StatusPill>
      </header>
      <dl className="launchDraftSummary">
        <div><dt>Contract</dt><dd className="font-mono text-[11px]">{review.address}</dd></div>
        <div><dt>Token metadata</dt><dd>{review.symbol} · {review.decimals} decimals</dd></div>
        <div><dt>Verified</dt><dd>{new Date(review.verifiedAt).toLocaleTimeString()}</dd></div>
        <div><dt>Review expiry</dt><dd>{new Date(review.expiresAt).toLocaleTimeString()}</dd></div>
      </dl>
      <Notice tone="warning" title="Contract verification is limited">
        Deployed bytecode and ERC-20 metadata were verified on Robinhood Chain. This does not verify liquidity, token safety, issuer, or market risk.
      </Notice>
      <footer>
        <span>{authorized ? "Token authorized for this session." : "Allow this exact token for this session only."}</span>
        <button className="primaryButton" disabled={authorizing || authorized} onClick={() => void authorize()}>
          {authorized ? "Authorized" : authorizing ? "Authorizing…" : "Authorize token"}
        </button>
      </footer>
      <p className="px-4 pb-4 font-mono text-[10px] text-muted-foreground">Explicit local authorization · session-scoped</p>
    </section>
  );
}
export function LimitOrderPreviewCard({
  preview,
  simulation,
  execution,
  cancelSimulation,
  cancelReceipt,
  simulating,
  executing,
  cancelling,
  verifyingExecution,
  verifyingCancel,
  onSimulate,
  onExecute,
  onCancel,
  onExecuteCancel,
  onVerifyExecution,
  onVerifyCancel,
}: {
  preview: LimitOrderContractPreview;
  simulation: LimitOrderSimulationPreview | null;
  execution: LimitOrderExecutionReceipt | null;
  cancelSimulation: LimitOrderCancelSimulation | null;
  cancelReceipt:
    SessionRecord["messages"][number]["limitOrderCancelReceipt"] | null;
  simulating: boolean;
  executing: boolean;
  cancelling: boolean;
  verifyingExecution: boolean;
  verifyingCancel: boolean;
  onSimulate: () => void;
  onExecute: () => void;
  onCancel: () => void;
  onExecuteCancel: () => void;
  onVerifyExecution: () => void;
  onVerifyCancel: () => void;
}) {
  const passed = preview.checks.filter(
    (check) => check.status === "pass",
  ).length;
  return (
    <section
      className={`missionPreview ${preview.status === "blocked" ? "blocked" : "ready"}`}
    >
      <header>
        <div>
          <span>Jupiter limit-order contract</span>
          <strong>{preview.goal}</strong>
        </div>
        <StatusPill tone={preview.status === "blocked" ? "danger" : "success"}>
          {preview.status}
        </StatusPill>
      </header>
      <dl>
        <div>
          <dt>Deposit</dt>
          <dd>{preview.inputAmount} raw</dd>
        </div>
        <div>
          <dt>Estimated value</dt>
          <dd>
            {preview.estimatedInputValueUsd === null
              ? "Unavailable"
              : `$${preview.estimatedInputValueUsd.toFixed(2)}`}
          </dd>
        </div>
        <div>
          <dt>Trigger</dt>
          <dd>
            {preview.triggerCondition} ${preview.triggerPriceUsd}
          </dd>
        </div>
        <div>
          <dt>Policy</dt>
          <dd>
            {passed}/{preview.checks.length} passed
          </dd>
        </div>
      </dl>
      <div className="missionChecks">
        {preview.checks.map((check) => (
          <div className={check.status} key={check.code}>
            <span>{check.status === "pass" ? "OK" : "BLOCK"}</span>
            <p>{check.message}</p>
          </div>
        ))}
      </div>
      {simulation && (
        <div className={`simulationResult ${simulation.status}`}>
          <strong>Vault deposit simulation {simulation.status}</strong>
          <small>
            {simulation.error ??
              `${simulation.programIds.length} programs · ${simulation.unitsConsumed ?? 0} compute units`}
          </small>
          <dl>
            <div>
              <dt>Network fee</dt>
              <dd>
                {simulation.feeLamports === null
                  ? "—"
                  : `${simulation.feeLamports.toLocaleString()} lamports`}
                {simulation.feeSol ? ` · ${simulation.feeSol} SOL` : ""}
                {simulation.feeUsd === null || simulation.feeUsd === undefined
                  ? ""
                  : ` · $${simulation.feeUsd.toFixed(4)}`}
              </dd>
            </div>
            <div>
              <dt>Fee percent</dt>
              <dd>
                {simulation.feePercent === null || simulation.feePercent === undefined
                  ? "—"
                  : `${simulation.feePercent.toFixed(2)}%`}
              </dd>
            </div>
            <div>
              <dt>Account funding</dt>
              <dd>
                {simulation.accountFundingLamports === null ||
                simulation.accountFundingLamports === undefined
                  ? "—"
                  : `${simulation.accountFundingLamports.toLocaleString()} lamports`}
              </dd>
            </div>
            <div>
              <dt>Estimated wallet outflow</dt>
              <dd>{simulation.estimatedWalletOutflowLamports ?? "—"} lamports</dd>
            </div>
            <div>
              <dt>Fee risk</dt>
              <dd>{simulation.feeRisk ?? "unavailable"}</dd>
            </div>
          </dl>
          {simulation.estimatedWalletOutflowLamports && (
            <p>
              Estimated SOL balance impact before signing:{" "}
              {simulation.estimatedWalletOutflowLamports} lamports. Token input/deposit is
              shown separately from network fee and account funding.
            </p>
          )}
          {simulation.feeGuardMessage && <p>{simulation.feeGuardMessage}</p>}
        </div>
      )}
      {execution && (
        <div
          className={`simulationResult ${execution.status === "active" ? "passed" : "failed"}`}
        >
          <strong>Order {execution.status}</strong>
          <small>
            {execution.orderId ??
              execution.error ??
              "Deposit broadcast status is awaiting verification."}
          </small>
          <dl>
            <div>
              <dt>Deposit amount</dt>
              <dd>{execution.inputAmount ?? preview.inputAmount} raw</dd>
            </div>
            <div>
              <dt>Network fee</dt>
              <dd>
                {execution.networkFeeLamports === null ||
                execution.networkFeeLamports === undefined
                  ? "—"
                  : `${execution.networkFeeLamports.toLocaleString()} lamports`}
                {execution.feeSol ? ` · ${execution.feeSol} SOL` : ""}
                {execution.feeUsd === null || execution.feeUsd === undefined
                  ? ""
                  : ` · $${execution.feeUsd.toFixed(4)}`}
              </dd>
            </div>
            <div>
              <dt>Fee percent</dt>
              <dd>
                {execution.feePercent === null || execution.feePercent === undefined
                  ? "—"
                  : `${execution.feePercent.toFixed(2)}%`}
              </dd>
            </div>
            <div>
              <dt>Fee risk</dt>
              <dd>{execution.feeRisk ?? "unavailable"}</dd>
            </div>
            <div>
              <dt>On-chain status</dt>
              <dd>{execution.chainVerification}</dd>
            </div>
            <div>
              <dt>Verified slot</dt>
              <dd>{execution.chainSlot?.toLocaleString() ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Last verified</dt>
              <dd>
                {execution.verifiedAt
                  ? new Date(execution.verifiedAt).toLocaleString()
                  : "Not verified yet"}
              </dd>
            </div>
          </dl>
          {execution.depositSignature && (
            <p>
              Signature: <code>{shorten(execution.depositSignature)}</code>
            </p>
          )}
          {execution.error && <p className="executionError">{execution.error}</p>}
          {execution.feeGuardMessage && <p>{execution.feeGuardMessage}</p>}
          {execution.depositSignature && (
            <div className="receiptActions">
              <button
                onClick={() =>
                  void window.silfable.copyTransactionSignature({
                    schemaVersion: 1,
                    requestId: crypto.randomUUID(),
                    signature: execution.depositSignature!,
                  })
                }
              >
                Copy signature
              </button>
              <button
                onClick={() =>
                  void window.silfable.openTransactionInExplorer({
                    schemaVersion: 1,
                    requestId: crypto.randomUUID(),
                    signature: execution.depositSignature!,
                  })
                }
              >
                Open explorer
              </button>
              {execution.status === "unknown" && (
                <button disabled={verifyingExecution} onClick={onVerifyExecution}>
                  {verifyingExecution ? "Verifying..." : "Verify on-chain"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {cancelSimulation && (
        <div className={`simulationResult ${cancelSimulation.status}`}>
          <strong>Withdrawal simulation {cancelSimulation.status}</strong>
          <small>
            {cancelSimulation.error ??
              `${cancelSimulation.programIds.length} programs inspected`}
          </small>
        </div>
      )}
      {cancelReceipt && (
        <div
          className={`simulationResult ${cancelReceipt.status === "cancelled" ? "passed" : "failed"}`}
        >
          <strong>Order {cancelReceipt.status}</strong>
          <small>
            {cancelReceipt.error ??
              (cancelReceipt.status === "cancelled"
                ? "Vault withdrawal is confirmed."
                : "Withdrawal status is awaiting verification.")}
          </small>
          <dl>
            <div>
              <dt>On-chain status</dt>
              <dd>{cancelReceipt.chainVerification}</dd>
            </div>
            <div>
              <dt>Verified slot</dt>
              <dd>
                {cancelReceipt.chainSlot?.toLocaleString() ?? "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Last verified</dt>
              <dd>
                {cancelReceipt.verifiedAt
                  ? new Date(cancelReceipt.verifiedAt).toLocaleString()
                  : "Not verified yet"}
              </dd>
            </div>
          </dl>
          {cancelReceipt.withdrawalSignature && (
            <>
              <p>
                Signature:{" "}
                <code>{shorten(cancelReceipt.withdrawalSignature)}</code>
              </p>
              <div className="receiptActions">
                <button
                  onClick={() =>
                    void window.silfable.copyTransactionSignature({
                      schemaVersion: 1,
                      requestId: crypto.randomUUID(),
                      signature: cancelReceipt.withdrawalSignature!,
                    })
                  }
                >
                  Copy signature
                </button>
                <button
                  onClick={() =>
                    void window.silfable.openTransactionInExplorer({
                      schemaVersion: 1,
                      requestId: crypto.randomUUID(),
                      signature: cancelReceipt.withdrawalSignature!,
                    })
                  }
                >
                  Open explorer
                </button>
                {cancelReceipt.status === "unknown" && (
                  <button disabled={verifyingCancel} onClick={onVerifyCancel}>
                    {verifyingCancel ? "Verifying..." : "Verify on-chain"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      <footer>
        <div>
          <span>
            {cancelReceipt
              ? `Cancellation ${cancelReceipt.status}`
              : execution
                ? `Order ${execution.status}`
                : simulation?.status === "passed"
                  ? "Final authorization required"
                  : "Execution locked"}
          </span>
          <small>
            {cancelReceipt?.status === "unknown" ||
            execution?.status === "unknown"
              ? "Verification only reads the known signature and never rebroadcasts."
              : simulation?.status === "passed"
                ? "The exact simulated deposit can be authorized with your password."
                : "Vault registration may occur during simulation; no funds are signed or deposited."}
          </small>
        </div>
        {cancelReceipt ? null : cancelSimulation?.status === "passed" ? (
          <button disabled={cancelling} onClick={onExecuteCancel}>
            {cancelling ? "Withdrawing…" : "Authorize withdrawal"}
          </button>
        ) : execution?.status === "active" && execution.orderId ? (
          <button disabled={cancelling} onClick={onCancel}>
            {cancelling ? "Preparing…" : "Review cancellation"}
          </button>
        ) : simulation?.status === "passed" && !execution ? (
          <button disabled={executing} onClick={onExecute}>
            {executing ? "Submitting…" : "Create limit order"}
          </button>
        ) : (
          <button
            disabled={preview.status !== "ready-for-review" || simulating}
            onClick={onSimulate}
          >
            {simulating ? "Simulating…" : "Review vault simulation"}
          </button>
        )}
      </footer>
    </section>
  );
}
export function PumpSimulationCard({
  simulation,
  execution,
  revalidating,
  executing,
  onFinalRevalidate,
  onRequestExecution,
}: {
  simulation: PumpSimulationArtifact;
  execution: PumpExecutionRecord | null;
  revalidating: boolean;
  executing: boolean;
  onFinalRevalidate?: (() => void) | undefined;
  onRequestExecution?: (() => void) | undefined;
}) {
  const statusTone =
    simulation.status === "passed"
      ? "success"
      : simulation.status === "blocked"
        ? "warning"
        : "danger";
  const feeTone =
    simulation.feeRisk === "reasonable"
      ? "success"
      : simulation.feeRisk === "high"
        ? "warning"
        : simulation.feeRisk === "extreme"
          ? "danger"
          : "neutral";

  return (
    <section
      className={`missionPreview pumpSimulationCard ${
        simulation.status === "passed" ? "ready" : "blocked"
      }`}
    >
      <header>
        <div>
          <span>Pump.fun simulation evidence</span>
          <strong>Unsigned transaction simulation</strong>
        </div>
        <StatusPill tone={statusTone}>{simulation.status}</StatusPill>
      </header>
      <dl>
        {simulation.riskEvidence && (
          <>
            <div>
              <dt>Proposed Pump spend</dt>
              <dd>{simulation.riskEvidence.proposedSpendLamports} lamports</dd>
            </div>
            <div>
              <dt>Finalized wallet balance</dt>
              <dd>{simulation.riskEvidence.walletBalanceLamports} lamports</dd>
            </div>
            <div>
              <dt>Projected balance</dt>
              <dd>{simulation.riskEvidence.projectedWalletBalanceLamports} lamports</dd>
            </div>
            <div>
              <dt>Required SOL reserve</dt>
              <dd>{simulation.riskEvidence.reserveFloorLamports} lamports</dd>
            </div>
          </>
        )}
        {simulation.quoteEvidence && (
          <>
            <div>
              <dt>Fresh expected output</dt>
              <dd>{simulation.quoteEvidence.expectedOutputAmount} raw</dd>
            </div>
            <div>
              <dt>Effective minimum output</dt>
              <dd>{simulation.quoteEvidence.minimumOutputAmount} raw</dd>
            </div>
            <div>
              <dt>Quote slippage</dt>
              <dd>{simulation.quoteEvidence.maxSlippageBps} bps</dd>
            </div>
            <div>
              <dt>Finalized quote slot</dt>
              <dd>{simulation.quoteEvidence.stateSlot.toLocaleString()}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Simulation slot</dt>
          <dd>{simulation.simulationSlot.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Compute units</dt>
          <dd>{simulation.unitsConsumed?.toLocaleString() ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Network fee</dt>
          <dd>
            {simulation.networkFeeLamports === null
              ? "Unavailable"
              : `${simulation.networkFeeLamports.toLocaleString()} lamports`}
          </dd>
        </div>
        <div>
          <dt>Account funding</dt>
          <dd>
            {simulation.rentLamports === null
              ? "Unavailable"
              : `${simulation.rentLamports.toLocaleString()} lamports`}
          </dd>
        </div>
        <div>
          <dt>Network fee ratio</dt>
          <dd>
            {simulation.networkFeePercent === null
              ? "Unavailable"
              : `${simulation.networkFeePercent.toFixed(4)}%`}
          </dd>
        </div>
        <div>
          <dt>Total known fee</dt>
          <dd>
            {simulation.totalKnownFeeLamports === null
              ? "Unavailable"
              : `${simulation.totalKnownFeeLamports} lamports`}
          </dd>
        </div>
        <div>
          <dt>Invoked programs</dt>
          <dd>{simulation.invokedPrograms.length}</dd>
        </div>
        <div>
          <dt>Fee guard</dt>
          <dd>
            <StatusPill tone={feeTone}>{simulation.feeRisk}</StatusPill>
          </dd>
        </div>
      </dl>
      {simulation.error && (
        <div className={`simulationResult ${simulation.status}`}>
          <div>
            <strong>Simulation {simulation.status}</strong>
            <span>{new Date(simulation.simulatedAt).toLocaleString()}</span>
          </div>
          <p>{simulation.error}</p>
        </div>
      )}
      {simulation.riskEvidence && (
        <details className="pumpSimulationEvidence">
          <summary>
            Inspect global risk checks ({simulation.riskEvidence.checks.filter((check) => check.passed).length}/8 passed)
          </summary>
          <div>
            <p>
              Usage source: {simulation.riskEvidence.usageSource === "no-execution-baseline"
                ? "zero baseline — no finalized Pump receipt exists yet"
                : "persisted confirmed receipts"}
            </p>
            <ul>
              {simulation.riskEvidence.checks.map((check) => (
                <li key={check.id}>
                  <strong>{check.passed ? "PASS" : "BLOCK"} · {check.id}</strong> — {check.message}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
      {simulation.eligibilityEvidence && (
        <details className="pumpSimulationEvidence" open>
          <summary>
            Pump eligibility: {simulation.eligibilityEvidence.status} ({simulation.eligibilityEvidence.checks.filter((check) => check.passed).length}/14 passed)
          </summary>
          <div>
            <p>
              AI ranking: {simulation.eligibilityEvidence.rankingAllowed ? "allowed" : "blocked"} · execution: locked
            </p>
            <ul>
              {simulation.eligibilityEvidence.checks.map((check) => (
                <li key={check.id}>
                  <strong>{check.passed ? "PASS" : "BLOCK"} · {check.id}</strong> — {check.message}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
      {simulation.executionReadiness && (
        <details className="pumpSimulationEvidence" open>
          <summary>
            Final approval readiness: {simulation.executionReadiness.status} ({simulation.executionReadiness.checks.filter((check) => check.passed).length}/10 passed)
          </summary>
          <div>
            <p>
              Execution remains locked. A fresh final simulation, master password, and exact confirmation <code>{simulation.executionReadiness.requiredConfirmation}</code> are still required.
            </p>
            <ul>
              {simulation.executionReadiness.checks.map((check) => (
                <li key={check.id}>
                  <strong>{check.passed ? "PASS" : "BLOCK"} · {check.id}</strong> — {check.message}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
      {simulation.finalRevalidation && (
        <details className="pumpSimulationEvidence" open>
          <summary>
            Final pre-sign revalidation: {simulation.finalRevalidation.status} ({simulation.finalRevalidation.checks.filter((check) => check.passed).length}/12 passed)
          </summary>
          <div>
            <p>
              Fresh state slot {simulation.finalRevalidation.finalStateSlot.toLocaleString()} and simulation slot {simulation.finalRevalidation.finalSimulationSlot.toLocaleString()} are bound to transaction digest <code>{simulation.finalRevalidation.finalTransactionDigest.slice(0, 16)}...</code>.
            </p>
            <p>Signing remains locked until the master password and exact confirmation <code>{simulation.finalRevalidation.requiredConfirmation}</code> are entered in the final approval dialog.</p>
            <ul>
              {simulation.finalRevalidation.checks.map((check) => (
                <li key={check.id}>
                  <strong>{check.passed ? "PASS" : "BLOCK"} Â· {check.id}</strong> â€” {check.message}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
      <details className="pumpSimulationEvidence">
        <summary>
          Inspect audited evidence ({simulation.invokedPrograms.length} programs, {simulation.logs.length} logs)
        </summary>
        <div>
          <strong>Invoked programs</strong>
          {simulation.invokedPrograms.length > 0 ? (
            <ul>
              {simulation.invokedPrograms.map((program) => (
                <li key={program}>{program}</li>
              ))}
            </ul>
          ) : (
            <p>No invoked program evidence was returned.</p>
          )}
          <strong>Bounded simulation logs</strong>
          {simulation.logs.length > 0 ? (
            <pre>{simulation.logs.join("\n")}</pre>
          ) : (
            <p>No simulation logs were returned.</p>
          )}
        </div>
      </details>
      <footer>
        <div>
          <span>No signature · no broadcast</span>
          <small>
            Encrypted session evidence only. A passing simulation never authorizes execution.
          </small>
        </div>
        {simulation.finalRevalidation?.status === "ready-for-password" ? (
          <button
            className="dangerButton"
            disabled={execution !== null || executing || onRequestExecution === undefined}
            onClick={onRequestExecution}
          >
            {executing ? "Submitting..." : execution ? "Execution recorded" : "Review & execute"}
          </button>
        ) : (
          <button
            disabled={onFinalRevalidate === undefined || revalidating || simulation.executionReadiness?.status !== "ready-for-final-approval"}
            onClick={onFinalRevalidate}
          >
            {revalidating ? "Revalidating..." : simulation.finalRevalidation ? "Revalidated" : "Final revalidation"}
          </button>
        )}
      </footer>
    </section>
  );
}
export function PumpLaunchDraftForm({
  creatorWallet,
  onCreate,
}: {
  creatorWallet: string;
  onCreate: (input: PumpLaunchDraftInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [telegramUrl, setTelegramUrl] = useState("");
  const [quoteAsset, setQuoteAsset] = useState<PumpLaunchDraft["quoteAsset"]>("SOL");
  const [initialPurchase, setInitialPurchase] = useState("0");
  const [outflow, setOutflow] = useState("0.01");
  const [priorityFee, setPriorityFee] = useState("0.0001");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const submit = async (): Promise<void> => {
    if (!name.trim() || !symbol.trim() || !imageFile || !acknowledged) return;
    setSubmitting(true);
    setError(null);
    try {
      if (typeof window.silfable.publishManagedPumpLaunchMetadata !== "function") {
        throw new Error("Pinata upload was added to the desktop preload. Fully quit and reopen Silfable before uploading a token image.");
      }
      const imageBase64 = await fileToBase64(imageFile);
      const published = await window.silfable.publishManagedPumpLaunchMetadata({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        creatorWallet,
        name: name.trim(),
        symbol: symbol.trim(),
        description: description.trim(),
        websiteUrl: websiteUrl.trim() || null,
        xUrl: xUrl.trim() || null,
        telegramUrl: telegramUrl.trim() || null,
        imageBase64,
        imageContentType: imageFile.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      });
      await onCreate({
        creatorWallet,
        metadata: {
          name: name.trim(),
          symbol: symbol.trim(),
          description: description.trim(),
          imageUri: published.imageGatewayUrl || published.imageUri || "",
          metadataUri: published.metadataGatewayUrl || published.metadataUri,
          websiteUrl: websiteUrl.trim() || null,
          xUrl: xUrl.trim() || null,
          telegramUrl: telegramUrl.trim() || null,
        },
        quoteAsset,
        initialPurchaseAmount: decimalToRaw(initialPurchase, quoteAsset === "SOL" ? 9 : 6, "Initial purchase"),
        maxCreatorOutflowLamports: decimalToRaw(outflow, 9, "Maximum creator outflow"),
        maxPriorityFeeLamports: decimalToRaw(priorityFee, 9, "Maximum priority fee"),
        deadlineAt: deadline,
        acknowledgedIrreversiblePublication: true,
      });
      setOpen(false);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The launch draft could not be saved.";
      setError(/No handler registered for ['"]pump:launch-managed-metadata-publish['"]/u.test(message)
        ? "The desktop main process is still using an older build. Quit Silfable from the tray or stop the desktop dev command, then start the app again. Reloading the window is not enough."
        : message);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <>
      <button className="launchDraftToggle" onClick={() => setOpen(true)}>
        Launch Token Draft
      </button>
      <Modal
        isOpen={open}
        onClose={() => { if (!submitting) setOpen(false); }}
        title="Prepare a Pump.fun token draft"
        subtitle="Define metadata and local safety limits before creating a review-only draft."
        maxWidth="900px"
        className="launchDraftModal"
      >
        <section className="launchDraftForm launchDraftModalForm">
          <div className="launchDraftModalStatus">
            <span>ROUTE CHAPTER / TOKEN LAUNCH</span>
            <StatusPill tone="warning">No execution</StatusPill>
          </div>
          <p>Saving this form creates a local draft only. Metadata upload, signing, and Mainnet broadcast remain separate review steps.</p>
          <div className="launchDraftGrid">
            <label>Name<input value={name} maxLength={32} onChange={(event) => setName(event.target.value)} autoFocus /></label>
            <label>Symbol<input value={symbol} maxLength={10} onChange={(event) => setSymbol(event.target.value.toUpperCase())} /></label>
            <label className="wide launchImagePicker">Token image · Pinata
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} />
              <span>{imageFile ? `${imageFile.name} · ${(imageFile.size / 1024).toFixed(1)} KB` : "Choose PNG, JPG, GIF, or WebP · maximum 10 MB"}</span>
            </label>
            <label className="wide">Description<textarea value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></label>
            <label>Website (optional)<input value={websiteUrl} placeholder="https://..." onChange={(event) => setWebsiteUrl(event.target.value)} /></label>
            <label>X profile (optional)<input value={xUrl} placeholder="https://x.com/..." onChange={(event) => setXUrl(event.target.value)} /></label>
            <label className="wide">Telegram (optional)<input value={telegramUrl} placeholder="https://t.me/..." onChange={(event) => setTelegramUrl(event.target.value)} /></label>
            <label>Quote asset<select value={quoteAsset} onChange={(event) => setQuoteAsset(event.target.value as PumpLaunchDraft["quoteAsset"])}><option value="SOL">SOL</option><option value="USDC">USDC</option></select></label>
            <label>Initial purchase ({quoteAsset})<input inputMode="decimal" value={initialPurchase} placeholder="0" onChange={(event) => setInitialPurchase(sanitizeDecimal(event.target.value))} /><small>Optional amount purchased with the launch.</small></label>
            <label>Maximum creator outflow (SOL)<input inputMode="decimal" value={outflow} placeholder="0.01" onChange={(event) => setOutflow(sanitizeDecimal(event.target.value))} /><small>Total SOL spending ceiling for this launch.</small></label>
            <label>Maximum priority fee (SOL)<input inputMode="decimal" value={priorityFee} placeholder="0.0001" onChange={(event) => setPriorityFee(sanitizeDecimal(event.target.value))} /><small>Included inside the creator outflow ceiling.</small></label>
          </div>
          <label className="launchDraftAcknowledgement"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> I understand this draft is not a launch and any future publication would be irreversible.</label>
          {error && <p className="launchDraftError">{error}</p>}
          <footer><button disabled={submitting} onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={submitting || !name.trim() || !symbol.trim() || !imageFile || !acknowledged} onClick={() => void submit()}>{submitting ? "Saving..." : "Save"}</button></footer>
        </section>
      </Modal>
    </>
  );
}

function fileToBase64(file: File): Promise<string> {
  if (file.size < 8 || file.size > 10 * 1024 * 1024) throw new Error("Token image must be between 8 bytes and 10 MB.");
  if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG, GIF, or WebP image.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected token image could not be read."));
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result.split(",")[1] : null;
      if (!value) reject(new Error("The selected token image is invalid."));
      else resolve(value);
    };
    reader.readAsDataURL(file);
  });
}

function sanitizeDecimal(value: string): string {
  const normalized = value.replace(",", ".").replace(/[^\d.]/gu, "");
  const [whole = "", ...fractions] = normalized.split(".");
  return fractions.length === 0 ? whole : `${whole}.${fractions.join("")}`;
}

function decimalToRaw(value: string, decimals: number, label: string): string {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/u.test(normalized)) throw new Error(`${label} must be a valid nonnegative amount.`);
  const [whole = "0", fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) throw new Error(`${label} supports at most ${decimals} decimal places.`);
  const raw = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/u, "");
  return raw || "0";
}
export function PumpLaunchDraftCard({
  draft,
  metadataPackage,
  preflight,
  revalidation,
  execution,
  onPreflight,
  onFinalRevalidate,
  onExecute,
  onVerify,
}: {
  draft: PumpLaunchDraft;
  metadataPackage: LegacyPumpLaunchMetadataPackage | PumpLaunchMetadata | undefined;
  preflight: PumpLaunchPreflight | undefined;
  revalidation: PumpLaunchFinalRevalidation | undefined;
  execution: PumpLaunchExecutionRecord | undefined;
  onPreflight: (draft: PumpLaunchDraft) => Promise<void>;
  onFinalRevalidate: (draft: PumpLaunchDraft, preflight: PumpLaunchPreflight) => Promise<void>;
  onExecute: (
    draft: PumpLaunchDraft,
    preflight: PumpLaunchPreflight,
    revalidation: PumpLaunchFinalRevalidation,
    credentials: { masterPassword: string },
  ) => Promise<void>;
  onVerify: (draft: PumpLaunchDraft, execution: PumpLaunchExecutionRecord) => Promise<void>;
}) {
  const [simulating, setSimulating] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalRequested, setApprovalRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (approvalRequested && revalidation?.status === "ready-for-password") {
      setApprovalOpen(true);
      setApprovalRequested(false);
    }
  }, [approvalRequested, revalidation?.status]);
  const simulate = async (): Promise<void> => {
    setSimulating(true);
    setError(null);
    try {
      await onPreflight(draft);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Token Launch preflight failed safely.");
    } finally {
      setSimulating(false);
    }
  };
  const finalRevalidate = async (): Promise<void> => {
    if (preflight === undefined) return;
    setRevalidating(true);
    setError(null);
    try {
      await onFinalRevalidate(draft, preflight);
      setApprovalRequested(true);
    } catch (reason) {
      setApprovalRequested(false);
      setError(reason instanceof Error ? reason.message : "Final Token Launch revalidation failed safely.");
    } finally {
      setRevalidating(false);
    }
  };
  const execute = async (): Promise<void> => {
    if (preflight === undefined || revalidation === undefined) return;
    setExecuting(true);
    setError(null);
    try {
      await onExecute(draft, preflight, revalidation, { masterPassword });
      setApprovalOpen(false);
      setMasterPassword("");
      setConfirmation("");
      setAcknowledged(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Token Launch execution failed safely.");
    } finally {
      setExecuting(false);
    }
  };
   const verify = async (): Promise<void> => {
    if (execution === undefined) return;
    setVerifying(true);
    setError(null);
    try {
      await onVerify(draft, execution);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Token Launch verification is temporarily unavailable.");
    } finally {
      setVerifying(false);
    }
  };
  const metadataReady = metadataPackage !== undefined || Boolean(draft.metadata.metadataUri);
  return (
    <section className="launchDraftCard">
      <header><div><span>Token launch draft</span><strong>{draft.metadata.name} (${draft.metadata.symbol})</strong></div><StatusPill tone={execution?.status === "finalized" ? "success" : execution?.status === "failed" ? "danger" : preflight ? "success" : "warning"}>{execution?.status ?? (preflight ? "Preflight passed" : "Draft only")}</StatusPill></header>
      <dl>
        <div><dt>Creator</dt><dd>{shorten(draft.creatorWallet)}</dd></div>
        <div><dt>Pairing</dt><dd>{draft.quoteAsset}</dd></div>
        <div><dt>Initial purchase</dt><dd>{formatLamportsToSol(draft.initialPurchaseAmount)}</dd></div>
        <div><dt>Metadata JSON</dt><dd>{metadataPackage ? "Published" : draft.metadata.metadataUri ? "Provided" : "Not published"}</dd></div>
        <div><dt>Maximum wallet outflow</dt><dd>{formatLamportsToSol(draft.maxCreatorOutflowLamports)}</dd></div>
        <div><dt>Maximum priority fee</dt><dd>{formatLamportsToSol(draft.maxPriorityFeeLamports)}</dd></div>
      </dl>
      <p className="launchDraftNote">{metadataPackage ? `Metadata URI: ${(metadataPackage as any).uri || (metadataPackage as any).metadataUri || draft.metadata.metadataUri}` : draft.metadata.metadataUri ? "Hosted metadata is ready for unsigned validation." : "Supply a hosted metadata URL before preparing the launch."} No transaction, signing, or broadcast has occurred.</p>
      {metadataReady && (
        <div className="launchDraftActions">
          <button className="launchDraftHandoff launchDraftPrimaryAction" disabled={simulating} onClick={() => void simulate()}>
            {simulating ? "Running preflight..." : preflight ? "Refresh preflight" : "Retry preflight"}
          </button>
        </div>
      )}
      {preflight && (
        <div className="launchPreflightReview">
          <strong>Unsigned create_v2 review</strong>
          <dl>
            <div><dt>Mint</dt><dd>{shorten(preflight.mintAddress)}</dd></div>
            <div><dt>Simulation slot</dt><dd>{preflight.simulationSlot.toLocaleString()}</dd></div>
            <div><dt>Compute</dt><dd>{preflight.computeUnitsConsumed?.toLocaleString() ?? "Unavailable"} CU</dd></div>
            <div><dt>Network fee</dt><dd>{formatLamportsToSol(preflight.networkFeeLamports)}</dd></div>
            <div><dt>Priority fee</dt><dd>{formatLamportsToSol(preflight.priorityFeeLamports)}</dd></div>
            <div><dt>Account funding</dt><dd>{formatLamportsToSol(preflight.rentLamports)}</dd></div>
            <div><dt>Estimated wallet outflow</dt><dd>{formatLamportsToSol(preflight.totalEstimatedOutflowLamports)}</dd></div>
            <div><dt>Expires</dt><dd>{new Date(preflight.expiresAt).toLocaleTimeString()}</dd></div>
          </dl>
          <p>Digest: {preflight.transactionDigest.slice(0, 16)}… · {preflight.checks.length}/{preflight.checks.length} checks passed. The non-extractable mint signer exists only in volatile main-process memory and is discarded on expiry or lock.</p>
        </div>
      )}
      {preflight && execution === undefined && (
        <div className="launchDraftActions">
          <button className="launchDraftHandoff launchDraftPrimaryAction" disabled={revalidating} onClick={() => void finalRevalidate()}>
            {revalidating ? "Checking final route..." : revalidation ? "Refresh final checks" : "Run final checks"}
          </button>
        </div>
      )}
      {revalidation?.status === "blocked" && execution === undefined && (
        <div className="launchDraftError">
          Final approval is blocked. Run a new unsigned preflight before trying again.
        </div>
      )}
      {revalidation?.status === "ready-for-password" && execution === undefined && (
        <div className="launchFinalReady">
          <div><strong>Final checks passed</strong><span>{revalidation.checks.filter((check) => check.passed).length}/{revalidation.checks.length} checks · approval required</span></div>
          <button className="launchDraftHandoff" onClick={() => setApprovalOpen(true)}>Review &amp; launch</button>
        </div>
      )}
      {execution && (
        <div className="launchPreflightReview">
          <strong>Encrypted Token Launch receipt</strong>
          <dl>
            <div><dt>Status</dt><dd>{execution.status}</dd></div>
            <div><dt>Mint</dt><dd>{shorten(execution.mintAddress)}</dd></div>
            <div><dt>Network fee estimate</dt><dd>{formatLamportsToSol(execution.networkFeeLamports)}</dd></div>
            <div><dt>Account funding estimate</dt><dd>{formatLamportsToSol(execution.rentLamports)}</dd></div>
            <div><dt>Actual network fee</dt><dd>{execution.actualNetworkFeeLamports === null ? "Pending" : formatLamportsToSol(execution.actualNetworkFeeLamports)}</dd></div>
            <div><dt>Actual account funding</dt><dd>{execution.actualAccountFundingLamports === null ? "Pending" : formatLamportsToSol(execution.actualAccountFundingLamports)}</dd></div>
            <div><dt>Actual wallet outflow</dt><dd>{execution.actualWalletOutflowLamports === null ? "Pending" : formatLamportsToSol(execution.actualWalletOutflowLamports)}</dd></div>
            <div><dt>Finalized slot</dt><dd>{execution.finalizedSlot?.toLocaleString() ?? "Pending"}</dd></div>
          </dl>
          <p>Signature: {shorten(execution.signature)}. {execution.error ?? "No RPC error is recorded."}</p>
          {execution.status !== "finalized" && execution.status !== "failed" && (
            <button className="launchDraftHandoff" disabled={verifying} onClick={() => void verify()}>
              {verifying ? "Checking on-chain..." : "Verify on-chain"}
            </button>
          )}
        </div>
      )}
      {error && <p className="launchDraftError">{error}</p>}
      <Modal
        isOpen={approvalOpen && revalidation?.status === "ready-for-password" && execution === undefined}
        onClose={() => { if (!executing) setApprovalOpen(false); }}
        title="Confirm token launch"
        subtitle="Review the exact Mainnet action before releasing the local signer."
        maxWidth="680px"
        className="launchApprovalModal"
      >
        {preflight && revalidation?.status === "ready-for-password" && (
          <section className="launchApprovalContent">
            <div className="launchApprovalRoute"><span>Pump.fun · Solana Mainnet</span><StatusPill tone="warning">Irreversible</StatusPill></div>
            <dl>
              <div><dt>Token</dt><dd>{draft.metadata.name} (${draft.metadata.symbol})</dd></div>
              <div><dt>Creator</dt><dd>{shorten(draft.creatorWallet)}</dd></div>
              <div><dt>Initial purchase</dt><dd>{formatLamportsToSol(draft.initialPurchaseAmount)}</dd></div>
              <div><dt>Estimated wallet outflow</dt><dd>{formatLamportsToSol(preflight.totalEstimatedOutflowLamports)}</dd></div>
              <div><dt>Mint</dt><dd>{shorten(preflight.mintAddress)}</dd></div>
              <div><dt>Checks</dt><dd>{revalidation.checks.filter((check) => check.passed).length}/{revalidation.checks.length} passed</dd></div>
            </dl>
            <Notice tone="danger" title="Permanent Mainnet action">This creates a real token mint and submits one Mainnet broadcast attempt. It cannot be undone.</Notice>
            <Field label="Master password"><input type="password" autoComplete="current-password" value={masterPassword} onChange={(event) => setMasterPassword(event.target.value)} autoFocus /></Field>
            <Field label='Type "LAUNCH TOKEN MAINNET"'><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></Field>
            <label className="launchDraftAcknowledgement"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I authorize one local signing operation and one Mainnet broadcast attempt for this exact launch.</span></label>
            {error && <p className="launchDraftError">{error}</p>}
            <footer><button disabled={executing} onClick={() => setApprovalOpen(false)}>Cancel</button><button className="launchApprovalSubmit" disabled={executing || !masterPassword || confirmation !== "LAUNCH TOKEN MAINNET" || !acknowledged} onClick={() => void execute()}>{executing ? "Signing & submitting..." : "Launch token"}</button></footer>
          </section>
        )}
      </Modal>
    </section>
  );
}
export function MissionPreviewCard({
  preview,
  simulation,
  execution,
  simulating,
  executing,
  verifying,
  fullAccess,
  onSimulate,
  onExecute,
  onVerify,
}: {
  preview: MissionContractPreview;
  simulation: MissionSimulationPreview | null;
  execution: MissionExecutionReceipt | null;
  simulating: boolean;
  executing: boolean;
  verifying: boolean;
  fullAccess: boolean;
  onSimulate: () => void;
  onExecute: () => void;
  onVerify: () => void;
}) {
  const passed = preview.checks.filter(
    (check) => check.status === "pass",
  ).length;
  return (
    <section
      className={`missionPreview swapRouteCard solanaSwapCard ${preview.status === "blocked" ? "blocked" : "ready"}`}
    >
      <header>
        <div>
          <span>SOLANA · JUPITER · QUOTE ONLY</span>
          <strong>{shorten(preview.inputMint)} → {shorten(preview.outputMint)}</strong>
          <small>{preview.goal}</small>
        </div>
        <StatusPill tone={preview.status === "blocked" ? "danger" : "success"}>
          {preview.status}
        </StatusPill>
      </header>
      <dl className="swapRouteMetrics">
        <div>
          <dt>Input</dt>
          <dd>{preview.inputAmount} raw</dd>
        </div>
        <div>
          <dt>Expected output</dt>
          <dd>{preview.quote?.outAmount ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Minimum output</dt>
          <dd>{preview.quote ? ((BigInt(preview.quote.outAmount) * BigInt(10_000 - preview.maxSlippageBps)) / 10_000n).toString() : "Unavailable"}</dd>
        </div>
        <div>
          <dt>Maximum slippage</dt>
          <dd>{preview.maxSlippageBps} bps</dd>
        </div>
      </dl>
      <dl className="swapRouteDetails">
        <div>
          <dt>Route</dt><dd>{preview.quote?.router ?? "Jupiter"}</dd>
        </div>
        <div><dt>Wallet</dt><dd>{shorten(preview.walletAddress)}</dd></div>
        <div><dt>Deadline</dt><dd>{new Date(preview.deadlineAt).toLocaleTimeString()}</dd></div>
        <div><dt>Policy</dt><dd>{passed}/{preview.checks.length} passed</dd></div>
      </dl>
      <div className="missionChecks">
        {preview.checks.map((check) => (
          <div className={check.status} key={check.code}>
            <span>{check.status === "pass" ? "OK" : "BLOCK"}</span>
            <p>{check.message}</p>
          </div>
        ))}
      </div>
      {simulation && <SimulationResult simulation={simulation} />}
      {execution && (
        <ExecutionResult
          receipt={execution}
          verifying={verifying}
          onVerify={onVerify}
        />
      )}
      <footer>
        <div>
          <span>
            {execution
              ? `Execution ${execution.status}`
              : simulation?.status === "passed"
                ? fullAccess ? "Full Access execution unavailable" : "Final approval required"
                : "Execution locked"}
          </span>
          <small>
            {execution
              ? "This receipt is persisted with the encrypted session."
              : fullAccess && simulation?.status === "passed"
                ? "The local signing session must still be active. Create a fresh Full Access session after unlocking the vault if it was cleared by lock, sleep, restart, or emergency stop."
                : "Simulation never authorizes a transaction by itself."}
          </small>
        </div>
         {execution ? null : simulation?.status === "passed" && fullAccess ? (
          <span className="executionPendingState">Full Access checks completed</span>
        ) : simulation?.status === "passed" ? (
          <button
            className="executeButton"
            disabled={executing}
            onClick={onExecute}
          >
            {executing ? "Submitting…" : "Review in wallet"}
          </button>
        ) : (
          <button
            disabled={
              preview.status !== "ready-for-review" ||
              simulating ||
              execution !== null
            }
            onClick={onSimulate}
          >
            {simulating
              ? "Simulating…"
              : simulation
                ? "Simulate again"
                : "Review route"}
          </button>
        )}
      </footer>
    </section>
  );
}
export function SimulationResult({
  simulation,
}: {
  simulation: MissionSimulationPreview;
}) {
  return (
    <div className={`simulationResult ${simulation.status}`}>
      <div>
        <strong>Simulation {simulation.status}</strong>
        <span>{new Date(simulation.simulatedAt).toLocaleString()}</span>
      </div>
      <dl>
        <div>
          <dt>Router</dt>
          <dd>{simulation.router ?? "—"}</dd>
        </div>
        <div>
          <dt>Compute units</dt>
          <dd>{simulation.unitsConsumed?.toLocaleString() ?? "—"}</dd>
        </div>
        <div>
          <dt>Fee</dt>
          <dd>
            {simulation.feeLamports === null
              ? "—"
              : `${simulation.feeLamports.toLocaleString()} lamports`}
          </dd>
        </div>
        <div>
          <dt>Programs</dt>
          <dd>{simulation.programIds.length}</dd>
        </div>
        <div>
          <dt>Fee value</dt>
          <dd>{simulation.feeSol ? `${simulation.feeSol} SOL` : "—"}{simulation.feeUsd === null || simulation.feeUsd === undefined ? "" : ` · $${simulation.feeUsd.toFixed(4)}`}</dd>
        </div>
        <div>
          <dt>Fee percentage</dt>
          <dd>{simulation.feePercent === null || simulation.feePercent === undefined ? "—" : `${simulation.feePercent.toFixed(2)}%`}</dd>
        </div>
        <div>
          <dt>Account funding</dt>
          <dd>{simulation.accountFundingLamports === null || simulation.accountFundingLamports === undefined ? "—" : `${simulation.accountFundingLamports.toLocaleString()} lamports`}</dd>
        </div>
        <div>
          <dt>Estimated wallet outflow</dt>
          <dd>{simulation.estimatedWalletOutflowLamports ?? "—"} lamports</dd>
        </div>
        <div>
          <dt>Fee guard</dt>
          <dd>{simulation.feeRisk ?? "unavailable"}</dd>
        </div>
      </dl>
      {simulation.estimatedWalletOutflowLamports && (
        <p>
          Estimated SOL balance impact before signing:{" "}
          {simulation.estimatedWalletOutflowLamports} lamports. Token input is shown
          separately from network fee and account funding.
        </p>
      )}
      {simulation.feeGuardMessage && <p>{simulation.feeGuardMessage}</p>}
      {simulation.error && <p>{simulation.error}</p>}
      <small>Unsigned · no broadcast attempted</small>
    </div>
  );
}
export function ExecutionResult({
  receipt,
  verifying,
  onVerify,
}: {
  receipt: MissionExecutionReceipt;
  verifying: boolean;
  onVerify: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const verification = receipt.chainVerification ?? "unavailable";
  async function copySignature(): Promise<void> {
    if (!receipt.signature) return;
    await window.silfable.copyTransactionSignature({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      signature: receipt.signature,
    });
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }
  async function openExplorer(): Promise<void> {
    if (!receipt.signature) return;
    await window.silfable.openTransactionInExplorer({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      signature: receipt.signature,
    });
  }
  return (
    <div className={`executionResult ${receipt.status}`}>
      <div>
        <strong>Mainnet execution {receipt.status}</strong>
        <span>{new Date(receipt.executedAt).toLocaleString()}</span>
      </div>
      <dl>
        <div>
          <dt>Input settled</dt>
          <dd>{receipt.inputAmount ?? "—"}</dd>
        </div>
        <div>
          <dt>Output settled</dt>
          <dd>{receipt.outputAmount ?? "—"}</dd>
        </div>
        <div>
          <dt>Router</dt>
          <dd>{receipt.router}</dd>
        </div>
        <div>
          <dt>Expected output</dt>
          <dd>{receipt.expectedOutputAmount ?? "—"}</dd>
        </div>
        <div>
          <dt>Actual slippage</dt>
          <dd>{receipt.actualSlippageBps === null || receipt.actualSlippageBps === undefined ? "—" : `${receipt.actualSlippageBps.toFixed(2)} bps`}</dd>
        </div>
        <div>
          <dt>Output delta</dt>
          <dd>{receipt.actualSlippageRawAmount ?? "—"} raw</dd>
        </div>
        <div>
          <dt>Estimated network fee</dt>
          <dd>{receipt.networkFeeLamports === null || receipt.networkFeeLamports === undefined ? "—" : `${receipt.networkFeeLamports.toLocaleString()} lamports`}</dd>
        </div>
        <div>
          <dt>Actual network fee</dt>
          <dd>{receipt.actualNetworkFeeLamports === null || receipt.actualNetworkFeeLamports === undefined ? "—" : `${receipt.actualNetworkFeeLamports.toLocaleString()} lamports`}</dd>
        </div>
        <div>
          <dt>Account/rent funding</dt>
          <dd>{receipt.accountFundingLamports === null || receipt.accountFundingLamports === undefined ? "—" : `${Number(receipt.accountFundingLamports).toLocaleString()} lamports`}</dd>
        </div>
        <div>
          <dt>Total wallet outflow</dt>
          <dd>{receipt.totalWalletOutflowLamports === null || receipt.totalWalletOutflowLamports === undefined ? "—" : `${Number(receipt.totalWalletOutflowLamports).toLocaleString()} lamports`}</dd>
        </div>
        <div>
          <dt>Code</dt>
          <dd>{receipt.code ?? "—"}</dd>
        </div>
        <div>
          <dt>On-chain</dt>
          <dd>{verification}</dd>
        </div>
        <div>
          <dt>Slot</dt>
          <dd>{receipt.chainSlot?.toLocaleString() ?? "—"}</dd>
        </div>
      </dl>
      {receipt.signature && (
        <div className="receiptSignature">
          <span>Transaction signature</span>
          <code>{receipt.signature}</code>
          <div className="receiptActions">
            <button onClick={() => void copySignature()}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={() => void openExplorer()}>Open Explorer</button>
            <button disabled={verifying} onClick={onVerify}>
              {verifying ? "Verifying…" : "Verify on-chain"}
            </button>
          </div>
        </div>
      )}
      {receipt.error && <p>{receipt.error}</p>}
      {receipt.chainError && receipt.chainError !== receipt.error && (
        <p>{receipt.chainError}</p>
      )}
      <small>
        {receipt.verifiedAt
          ? `Solana RPC checked ${new Date(receipt.verifiedAt).toLocaleString()}`
          : "Not independently verified yet"}{" "}
        · never retry an unknown broadcast without checking the signature
      </small>
    </div>
  );
}


