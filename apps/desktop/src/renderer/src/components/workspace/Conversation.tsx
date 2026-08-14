// @ts-nocheck
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, ArrowUp, Bot, Brain, CirclePlus, Settings, ShieldCheck, Target } from 'lucide-react';
import { Button, Modal } from '../ui';
import { shorten, cn } from '../../lib/utils';

import {
  BridgeProposalCard, EvmBridgeProposalCard, EvmBridgeWorkspace
} from '../bridge/EvmBridge';
import {
  PumpTradePreviewCard, PumpExecutionCard
} from '../trading/PumpCards';
import {
  PumpLaunchDraftForm, EvmSwapProposalCard, FullAccessEvmAssetReviewCard, MissionPreviewCard, PumpSimulationCard, PumpLaunchDraftCard, LimitOrderPreviewCard
} from '../trading/ActivityCards';
import { Composer } from './WorkspacePanels';
import { AnimatedMarkdownMessage, MarkdownMessage, BridgePreparationForm } from './MarkdownComponents';
import { StatusPill, Notice, Field, SetupCard, SetupActions, Brand, BrandMark, CornerFooter, RailSection, ProviderCard } from '../setup/SetupHelpers';
import { ACTIVITY_LEVELS, INTEGRATION_CATEGORIES, SETUP_STEPS, STORAGE_KEY } from '../types';
import type { BridgePreflightEvidence, BridgeProposal, BridgeReceipt, BridgeDestinationChain, EmergencyStopStatus, EvmBridgeContract, EvmBridgePreflight, EvmBridgeQuote, EvmBridgeReceipt, EvmChainKey, EvmPortfolioSnapshot, EvmSessionExecutionReceipt, EvmSwapPreflightEvidence, EvmSwapProposal, LimitOrderCancelSimulation, LimitOrderContractPreview, LimitOrderExecutionReceipt, LimitOrderSimulationPreview, LegacyPumpLaunchMetadataPackage, MissionContractPreview, MissionExecutionReceipt, MissionSimulationPreview, OpenRouterModelView, PortfolioSnapshot, PumpExecutionRecord, PumpFinalRevalidation, PumpLaunchDraft, PumpLaunchDraftInput, PumpLaunchMetadata, PumpLaunchPreflight, PumpLaunchFinalRevalidation, PumpLaunchExecutionRecord, PumpRiskSettings, PumpSimulationArtifact, PumpTokenIntelligence, PumpTradeContractPreview, RuntimeStatus, SessionRecord, TransactionSettings, WalletActivitySnapshot } from '@silfable/contracts';
import { BRIDGE_ARBITRUM_CHAIN_ID, BRIDGE_ARBITRUM_USDC_ADDRESS, BRIDGE_AVALANCHE_CHAIN_ID, BRIDGE_AVALANCHE_USDC_ADDRESS, BRIDGE_BASE_CHAIN_ID, BRIDGE_BASE_USDC_ADDRESS, BRIDGE_ETHEREUM_CHAIN_ID, BRIDGE_ETHEREUM_USDC_ADDRESS, BRIDGE_OPTIMISM_CHAIN_ID, BRIDGE_OPTIMISM_USDC_ADDRESS, BRIDGE_POLYGON_CHAIN_ID, BRIDGE_POLYGON_USDC_ADDRESS, BRIDGE_ROBINHOOD_CHAIN_ID, BRIDGE_ROBINHOOD_USDG_ADDRESS, BRIDGE_SOLANA_CHAIN_ID, BRIDGE_SOLANA_USDC_MINT } from '@silfable/contracts';

export function Conversation({
  session,
  draft,
  setDraft,
  onSend,
  onCreatePumpLaunchDraft,
  onPreflightPumpLaunch,
  onFinalRevalidatePumpLaunch,
  onExecutePumpLaunch,
  onVerifyPumpLaunchExecution,
  onPrepareBridge,
  preparingBridge,
  reconcilingBridgeIds,
  onRequestBridgeExecution,
  onReconcileBridge,
  onDispatchEvmBridge,
  dispatchingEvmBridgeIds,
  thinking,
  animatedMessageIds,
  onAnimationComplete,
  simulatingMissionIds,
  simulatingPumpIds,
  revalidatingPumpIds,
  executingPumpIds,
  verifyingPumpExecutionIds,
  executingMissionIds,
  verifyingReceiptIds,
  simulatingLimitIds,
  executingLimitIds,
  cancellingLimitIds,
  verifyingLimitExecutionIds,
  verifyingLimitCancelIds,
  preparingEvmIds,
  executingEvmIds,
  evmExecutionEnabled,
  evmExecutionMissing,
  fullAccessEvm,
  onPrepareEvmSwap,
  onRequestEvmExecution,
  onAuthorizeFullAccessEvmAsset,
  onRequestLimitSimulation,
  onRequestLimitExecution,
  onRequestLimitCancel,
  onRequestLimitCancelExecution,
  onVerifyLimitExecution,
  onVerifyLimitCancel,
  onRequestSimulation,
  onRequestPumpSimulation,
  onRequestPumpFinalRevalidation,
  onRequestPumpExecution,
  onVerifyPumpExecution,
  onRequestExecution,
  onVerifyExecution,
}: {
  session: SessionItem;
  draft: string;
  setDraft: (value: string) => void;
  onSend: () => void;
  onCreatePumpLaunchDraft: (input: PumpLaunchDraftInput) => Promise<void>;
  onPreflightPumpLaunch: (draft: PumpLaunchDraft) => Promise<void>;
  onFinalRevalidatePumpLaunch: (draft: PumpLaunchDraft, preflight: PumpLaunchPreflight) => Promise<void>;
  onExecutePumpLaunch: (
    draft: PumpLaunchDraft,
    preflight: PumpLaunchPreflight,
    revalidation: PumpLaunchFinalRevalidation,
    credentials: { masterPassword: string },
  ) => Promise<void>;
  onVerifyPumpLaunchExecution: (draft: PumpLaunchDraft, execution: PumpLaunchExecutionRecord) => Promise<void>;
  onPrepareBridge: (input: {
    destinationChain: BridgeDestinationChain;
    destinationRecipient: string;
    amountIn: string;
    minimumDestinationAmount: string;
    maximumTotalFeeUsd: number;
  }) => Promise<void>;
  preparingBridge: boolean;
  reconcilingBridgeIds: string[];
  onRequestBridgeExecution: (proposal: BridgeProposal, preflight: BridgePreflightEvidence) => void;
  onReconcileBridge: (receipt: BridgeReceipt) => void;
  onDispatchEvmBridge: (messageId: string, preparation: { quote: EvmBridgeQuote; preflight: EvmBridgePreflight; contract?: EvmBridgeContract }) => void;
  dispatchingEvmBridgeIds: string[];
  thinking: boolean;
  animatedMessageIds: string[];
  onAnimationComplete: (id: string) => void;
  simulatingMissionIds: string[];
  simulatingPumpIds: string[];
  revalidatingPumpIds: string[];
  executingPumpIds: string[];
  verifyingPumpExecutionIds: string[];
  executingMissionIds: string[];
  verifyingReceiptIds: string[];
  simulatingLimitIds: string[];
  executingLimitIds: string[];
  cancellingLimitIds: string[];
  verifyingLimitExecutionIds: string[];
  verifyingLimitCancelIds: string[];
  preparingEvmIds: string[];
  executingEvmIds: string[];
  evmExecutionEnabled: boolean;
  evmExecutionMissing: string[];
  fullAccessEvm?: boolean;
  onPrepareEvmSwap: (messageId: string, proposal: EvmSwapProposal) => void;
  onRequestEvmExecution: (
    messageId: string,
    proposal: EvmSwapProposal,
    preflight: EvmSwapPreflightEvidence,
  ) => void;
  onAuthorizeFullAccessEvmAsset: (reviewId: string) => Promise<void>;
  onRequestLimitSimulation: (
    messageId: string,
    preview: LimitOrderContractPreview,
  ) => void;
  onRequestLimitExecution: (
    messageId: string,
    preview: LimitOrderContractPreview,
    simulation: LimitOrderSimulationPreview,
  ) => void;
  onRequestLimitCancel: (
    messageId: string,
    walletAddress: string,
    orderId: string,
  ) => void;
  onRequestLimitCancelExecution: (
    messageId: string,
    walletAddress: string,
    orderId: string,
    simulation: LimitOrderCancelSimulation,
  ) => void;
  onVerifyLimitExecution: (
    messageId: string,
    preview: LimitOrderContractPreview,
    receipt: LimitOrderExecutionReceipt,
  ) => void;
  onVerifyLimitCancel: (
    messageId: string,
    receipt: NonNullable<
      SessionRecord["messages"][number]["limitOrderCancelReceipt"]
    >,
  ) => void;
  onRequestSimulation: (
    messageId: string,
    preview: MissionContractPreview,
  ) => void;
  onRequestPumpSimulation: (
    messageId: string,
    preview: PumpTradeContractPreview,
  ) => void;
  onRequestPumpFinalRevalidation: (
    messageId: string,
    preview: PumpTradeContractPreview,
  ) => void;
  onRequestPumpExecution: (
    messageId: string,
    preview: PumpTradeContractPreview,
    simulation: PumpSimulationArtifact,
    revalidation: PumpFinalRevalidation,
  ) => void;
  onVerifyPumpExecution: (
    messageId: string,
    preview: PumpTradeContractPreview,
    execution: PumpExecutionRecord,
  ) => void;
  onRequestExecution: (
    messageId: string,
    preview: MissionContractPreview,
    simulation: MissionSimulationPreview,
  ) => void;
  onVerifyExecution: (
    messageId: string,
    preview: MissionContractPreview,
    receipt: MissionExecutionReceipt,
  ) => void;
}) {
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const messages = messagesRef.current;
    if (messages === null) return;
    const scrollToLatest = () => {
      messages.scrollTop = messages.scrollHeight;
    };
    scrollToLatest();
    const frame = requestAnimationFrame(scrollToLatest);
    return () => cancelAnimationFrame(frame);
  }, [session.id, session.messages.length]);

  return (
    <div className={`conversation${session.walletScope === "solana" && session.walletAddress !== null ? " conversationWithLaunch" : ""}`}>
      <header>
        <div>
          <span className="liveDot" />{" "}
          {session.workspace === "pump"
            ? "Pump.fun · manual restricted"
            : session.walletScope === "solana"
              ? session.mode === "mission"
                ? `Solana workspace · ${session.permission} mission`
                : `Solana workspace · ${session.permission} agent`
              : session.walletScope === "evm"
                ? session.mode === "mission"
                  ? `Robinhood workspace · ${session.permission} mission`
                  : `Robinhood workspace · ${session.permission} agent`
            : session.intent === "token-launch"
              ? "Token launch planning"
              : session.intent === "solana-swap"
                ? "Solana swap preparing"
                : session.intent === "evm-swap"
                  ? "EVM swap planning · release gated"
                  : session.intent === "bridge"
                    ? "Bridge planning · quote only"
                    : session.mode === "mission"
              ? "Mission preparing"
              : "Agent active"}
        </div>
        <StatusPill tone={session.permission === "full" ? "success" : "warning"}>
          {session.permission === "full" ? "Full Access" : "Restricted"}
        </StatusPill>
      </header>
      {session.walletScope === "solana" && session.walletAddress !== null && (
        <div className="conversationLaunchBar">
          <PumpLaunchDraftForm
            creatorWallet={session.walletAddress}
            onCreate={onCreatePumpLaunchDraft}
          />
        </div>
      )}
      <div className="messages" ref={messagesRef}>
        {session.messages.map((message) => (
          <article className={message.role} key={message.id}>
            {message.role === "assistant" && <span className="avatar">S</span>}
            <div>
              <small>
                {message.role === "user" ? "You" : "Silfable"} ·{" "}
                {new Date(message.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
              {message.role === "assistant" &&
              animatedMessageIds.includes(message.id) ? (
                <AnimatedMarkdownMessage
                  message={message}
                  onComplete={() => onAnimationComplete(message.id)}
                />
              ) : (
                <MarkdownMessage text={message.text} />
              )}
              {message.evmSwapProposal && (
                <EvmSwapProposalCard
                  proposal={message.evmSwapProposal}
                  preflight={message.evmSwapPreflight ?? null}
                  receipts={message.evmExecutionReceipts ?? []}
                  preparing={preparingEvmIds.includes(message.evmSwapProposal.id)}
                  executing={executingEvmIds.includes(message.evmSwapProposal.id)}
                  executionEnabled={evmExecutionEnabled}
                  executionMissing={evmExecutionMissing}
                  fullAccess={fullAccessEvm}
                  onPrepare={() =>
                    onPrepareEvmSwap(message.id, message.evmSwapProposal!)
                  }
                  onExecute={() =>
                    onRequestEvmExecution(
                      message.id,
                      message.evmSwapProposal!,
                      message.evmSwapPreflight!,
                    )
                  }
                />
              )}
              {(message as any).evmAssetAuthorizationReview && (
                <FullAccessEvmAssetReviewCard
                  review={(message as any).evmAssetAuthorizationReview}
                  onAuthorize={() => onAuthorizeFullAccessEvmAsset((message as any).evmAssetAuthorizationReview.id)}
                />
              )}
              {message.bridgeProposal && message.bridgePreflight && (
                <BridgeProposalCard
                  proposal={message.bridgeProposal}
                  preflight={message.bridgePreflight}
                  receipt={message.bridgeReceipt ?? null}
                  reconciling={message.bridgeReceipt
                    ? reconcilingBridgeIds.includes(message.bridgeReceipt.id)
                    : false}
                  onExecute={() => onRequestBridgeExecution(message.bridgeProposal!, message.bridgePreflight!)}
                  {...(message.bridgeReceipt
                    ? { onReconcile: () => onReconcileBridge(message.bridgeReceipt!) }
                    : {})}
                />
              )}
              {(message as any).evmBridgePreparation && (
                <EvmBridgeProposalCard
                  preparation={(message as any).evmBridgePreparation}
                  receipts={(message as any).evmBridgeReceipts ?? []}
                  fullAccess={session.permission === "full"}
                  dispatching={dispatchingEvmBridgeIds.includes(message.id)}
                  onDispatch={() => onDispatchEvmBridge(message.id, (message as any).evmBridgePreparation)}
                />
              )}
              {message.missionPreview && (
                <MissionPreviewCard
                  preview={message.missionPreview}
                  simulation={message.missionSimulation ?? null}
                  execution={message.missionExecution ?? null}
                  simulating={simulatingMissionIds.includes(
                    message.missionPreview.id,
                  )}
                  executing={executingMissionIds.includes(
                    message.missionPreview.id,
                  )}
                  verifying={
                    message.missionExecution
                      ? verifyingReceiptIds.includes(
                          message.missionExecution.id,
                        )
                      : false
                  }
                  fullAccess={session.permission === "full"}
                  onSimulate={() =>
                    onRequestSimulation(message.id, message.missionPreview!)
                  }
                  onExecute={() =>
                    onRequestExecution(
                      message.id,
                      message.missionPreview!,
                      message.missionSimulation!,
                    )
                  }
                  onVerify={() =>
                    onVerifyExecution(
                      message.id,
                      message.missionPreview!,
                      message.missionExecution!,
                    )
                  }
                />
              )}
              {message.pumpTradePreview && (
                <PumpTradePreviewCard
                  preview={message.pumpTradePreview}
                  simulation={message.pumpSimulation ?? null}
                  simulating={simulatingPumpIds.includes(message.pumpTradePreview.id)}
                  onSimulate={() => onRequestPumpSimulation(message.id, message.pumpTradePreview!)}
                />
              )}
              {message.pumpSimulation && (
                <PumpSimulationCard
                  simulation={message.pumpSimulation}
                  execution={message.pumpExecution ?? null}
                  revalidating={message.pumpTradePreview ? revalidatingPumpIds.includes(message.pumpTradePreview.id) : false}
                  executing={message.pumpTradePreview ? executingPumpIds.includes(message.pumpTradePreview.id) : false}
                  onFinalRevalidate={message.pumpTradePreview
                    ? () => onRequestPumpFinalRevalidation(message.id, message.pumpTradePreview!)
                    : undefined}
                  onRequestExecution={message.pumpTradePreview && message.pumpSimulation.finalRevalidation
                    ? () => onRequestPumpExecution(
                        message.id,
                        message.pumpTradePreview!,
                        message.pumpSimulation!,
                        message.pumpSimulation!.finalRevalidation!,
                      )
                    : undefined}
                />
              )}
              {message.pumpLaunchDraft && <PumpLaunchDraftCard
                draft={message.pumpLaunchDraft}
                metadataPackage={message.pumpLaunchMetadataPackage}
                preflight={message.pumpLaunchPreflight}
                revalidation={message.pumpLaunchFinalRevalidation}
                execution={message.pumpLaunchExecution}
                onPreflight={onPreflightPumpLaunch}
                onFinalRevalidate={onFinalRevalidatePumpLaunch}
                onExecute={onExecutePumpLaunch}
                onVerify={onVerifyPumpLaunchExecution}
              />}
              {message.pumpTradePreview && message.pumpExecution && (
                <PumpExecutionCard
                  execution={message.pumpExecution}
                  preview={message.pumpTradePreview}
                  simulation={message.pumpSimulation ?? null}
                  verifying={verifyingPumpExecutionIds.includes(message.pumpExecution.id)}
                  onVerify={() => onVerifyPumpExecution(
                    message.id,
                    message.pumpTradePreview!,
                    message.pumpExecution!,
                  )}
                />
              )}
              {message.limitOrderPreview && (
                <LimitOrderPreviewCard
                  preview={message.limitOrderPreview}
                  simulation={message.limitOrderSimulation ?? null}
                  execution={message.limitOrderExecution ?? null}
                  cancelSimulation={message.limitOrderCancelSimulation ?? null}
                  cancelReceipt={message.limitOrderCancelReceipt ?? null}
                  simulating={simulatingLimitIds.includes(
                    message.limitOrderPreview.id,
                  )}
                  executing={executingLimitIds.includes(
                    message.limitOrderPreview.id,
                  )}
                  cancelling={
                    message.limitOrderExecution?.orderId
                      ? cancellingLimitIds.includes(
                          message.limitOrderExecution.orderId,
                        )
                      : false
                  }
                  verifyingExecution={
                    message.limitOrderExecution
                      ? verifyingLimitExecutionIds.includes(
                          message.limitOrderExecution.id,
                        )
                      : false
                  }
                  verifyingCancel={
                    message.limitOrderCancelReceipt
                      ? verifyingLimitCancelIds.includes(
                          message.limitOrderCancelReceipt.id,
                        )
                      : false
                  }
                  onSimulate={() =>
                    onRequestLimitSimulation(
                      message.id,
                      message.limitOrderPreview!,
                    )
                  }
                  onExecute={() =>
                    onRequestLimitExecution(
                      message.id,
                      message.limitOrderPreview!,
                      message.limitOrderSimulation!,
                    )
                  }
                  onCancel={() =>
                    onRequestLimitCancel(
                      message.id,
                      message.limitOrderPreview!.walletAddress,
                      message.limitOrderExecution!.orderId!,
                    )
                  }
                  onExecuteCancel={() =>
                    onRequestLimitCancelExecution(
                      message.id,
                      message.limitOrderPreview!.walletAddress,
                      message.limitOrderExecution!.orderId!,
                      message.limitOrderCancelSimulation!,
                    )
                  }
                  onVerifyExecution={() =>
                    onVerifyLimitExecution(
                      message.id,
                      message.limitOrderPreview!,
                      message.limitOrderExecution!,
                    )
                  }
                  onVerifyCancel={() =>
                    onVerifyLimitCancel(
                      message.id,
                      message.limitOrderCancelReceipt!,
                    )
                  }
                />
              )}
              {message.role === "assistant" && (
                <div className="evidenceTag">
                  {message.pumpExecution
                    ? `Pump Mainnet execution: ${message.pumpExecution.status}`
                    : message.evmExecutionReceipts?.length
                      ? `EVM Mainnet execution: ${message.evmExecutionReceipts.at(-1)!.kind} ${message.evmExecutionReceipts.at(-1)!.status}`
                    : message.missionExecution
                    ? `Mainnet execution: ${message.missionExecution.status}`
                    : "No execution attempted"}
                  {message.toolsUsed?.length
                    ? ` · evidence: ${message.toolsUsed.join(", ")}`
                    : " · external inference"}
                </div>
              )}
            </div>
          </article>
        ))}
        {thinking && (
          <article className="assistant typingArticle">
            <span className="avatar">S</span>
            <div>
              <small>Silfable · reasoning</small>
              <div
                className="typingIndicator"
                aria-label="Silfable is preparing a response"
              >
                <span />
                <span />
                <span />
              </div>
            </div>
          </article>
        )}
      </div>
      <div className="conversationComposer">
        {session.walletScope === "solana" && session.walletAddress !== null && (
          <>
            {session.mode === "mission" && (
              <BridgePreparationForm busy={preparingBridge} onPrepare={onPrepareBridge} />
            )}
          </>
        )}
        {session.walletScope === "evm" && session.walletAddress !== null && session.evmChainKey === "robinhood" && (
          <EvmBridgeWorkspace
            sessionId={session.id}
            sourceChainKey={session.evmChainKey}
            sourceWallet={session.walletAddress}
          />
        )}
        <Notice tone={session.permission === "full" ? "info" : "warning"} title={session.permission === "full" ? "Full Access session" : "Restricted Mainnet session"}>
          {session.permission === "full"
            ? "Exact actions still require a pinned execution job and active local-vault grant. Until then, the normal review and approval flow remains active."
            : "Every mutating action requires a validated contract, passed simulation, password recheck, and explicit approval."}
        </Notice>
        <Composer
          value={draft}
          setValue={setDraft}
          onSubmit={onSend}
          disabled={thinking}
          placeholder={thinking ? "Silfable is thinking..." : "Type a follow-up or refine the plan…"}
        />
      </div>
    </div>
  );
}
