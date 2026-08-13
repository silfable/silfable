// @ts-nocheck
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, powerMonitor, session, shell, Tray } from "electron";
import type { NativeImage } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ManagedLaunchMetadataClient } from "../pump/managed-metadata.js";

import {
  AiChatRequestSchema,
  AiChatResponseSchema,
  AiPreviewOpenRouterModelsRequestSchema,
  AiPreviewOpenRouterModelsResponseSchema,
  AiProviderMutationResponseSchema,
  AiSaveProviderRequestSchema,
  AiSettingsResponseSchema,
  AutomationListResponseSchema,
  AutomationSetStatusRequestSchema,
  AutomationSetStatusResponseSchema,
  ClipboardWriteWalletAddressRequestSchema,
  ClipboardWriteWalletAddressResponseSchema,
  ClipboardWriteTransactionSignatureRequestSchema,
  ClipboardWriteTransactionSignatureResponseSchema,
  BridgeExecuteRequestSchema,
  BridgeExecuteResponseSchema,
  BridgeGetStatusRequestSchema,
  BridgeGetStatusResponseSchema,
  BridgePrepareRequestSchema,
  BridgePrepareResponseSchema,
  BridgeReconcileRequestSchema,
  BridgeReconcileResponseSchema,
  EmergencyStopEngageRequestSchema,
  EmergencyStopGetResponseSchema,
  EmergencyStopMutationResponseSchema,
  EmergencyStopReleaseRequestSchema,
  EvmExecuteKyberSwapRequestSchema,
  EvmExecuteKyberSwapResponseSchema,
  EvmExecuteFullAccessKyberSwapRequestSchema,
  EvmExecuteFullAccessKyberSwapResponseSchema,
  EvmBridgeExecuteRequestSchema,
  EvmBridgeExecuteResponseSchema,
  EvmBridgePrepareRequestSchema,
  EvmBridgePrepareResponseSchema,
  EvmBridgeReceiptsResponseSchema,
  EvmBridgeReconcileRequestSchema,
  EvmBridgeReconcileResponseSchema,
  EvmPrepareKyberSwapRequestSchema,
  EvmPrepareKyberSwapResponseSchema,
  EvmPortfolioGetRequestSchema,
  EvmPortfolioGetResponseSchema,
  EvmReceiptsResponseSchema,
  EvmReconcileReceiptsResponseSchema,
  EvmRpcMutationResponseSchema,
  EvmSaveRpcUrlRequestSchema,
  EvmSettingsResponseSchema,
  EvmTestRpcResponseSchema,
  EvmWalletCreateRequestSchema,
  EvmWalletCreateResponseSchema,
  EvmWalletClearAllRequestSchema,
  EvmWalletClearAllResponseSchema,
  EvmWalletGetResponseSchema,
  EvmWalletImportMnemonicRequestSchema,
  EvmWalletImportPrivateKeyRequestSchema,
  EvmWalletImportResponseSchema,
  EvmSwapProposalSchema,
  ExternalOpenTransactionRequestSchema,
  ExternalOpenTransactionResponseSchema,
  FullAccessExecutionGrantActionRequestSchema,
  FullAccessExecutionGrantCreateRequestSchema,
  FullAccessExecutionGrantGetResponseSchema,
  FullAccessExecutionGrantMutationResponseSchema,
  FullAccessExecutionCreateSolanaSwapJobRequestSchema,
  FullAccessExecutionCreateSolanaSwapJobResponseSchema,
  AutonomousExecutionJobListResponseSchema,
  IPC_CHANNELS,
  JupiterKeyMutationResponseSchema,
  JupiterSaveKeyRequestSchema,
  JupiterSettingsResponseSchema,
  UniswapKeyMutationResponseSchema,
  UniswapSaveKeyRequestSchema,
  UniswapSettingsResponseSchema,
  UniswapTestKeyRequestSchema,
  UniswapTestKeyResponseSchema,
  LimitOrderExecuteRequestSchema,
  LimitOrderExecuteResponseSchema,
  LimitOrderCancelExecuteRequestSchema,
  LimitOrderCancelExecuteResponseSchema,
  LimitOrderCancelSimulateRequestSchema,
  LimitOrderCancelSimulateResponseSchema,
  LimitOrderVerifyExecutionRequestSchema,
  LimitOrderVerifyExecutionResponseSchema,
  LimitOrderVerifyCancelRequestSchema,
  LimitOrderVerifyCancelResponseSchema,
  LimitOrderListRequestSchema,
  LimitOrderListResponseSchema,
  LimitOrderSimulateRequestSchema,
  LimitOrderSimulateResponseSchema,
  MissionSimulateRequestSchema,
  MissionSimulateResponseSchema,
  MissionExecuteRequestSchema,
  MissionFullAccessExecuteRequestSchema,
  MissionExecuteResponseSchema,
  MissionVerifyExecutionRequestSchema,
  MissionVerifyExecutionResponseSchema,
  PortfolioGetRequestSchema,
  PortfolioGetResponseSchema,
  PortfolioCostBasisGetRequestSchema,
  PortfolioCostBasisGetResponseSchema,
  PumpFinalRevalidateRequestSchema,
  PumpFinalRevalidateResponseSchema,
  PumpExecuteRequestSchema,
  PumpExecuteResponseSchema,
  PumpLaunchDraftRequestSchema,
  PumpLaunchDraftResponseSchema,
  PumpLaunchManagedMetadataPublishRequestSchema,
  PumpLaunchManagedMetadataPublishResponseSchema,
  PumpLaunchPreflightRequestSchema,
  PumpLaunchPreflightResponseSchema,
  PumpLaunchFinalRevalidateRequestSchema,
  PumpLaunchFinalRevalidateResponseSchema,
  PumpLaunchExecuteRequestSchema,
  PumpLaunchExecuteResponseSchema,
  PumpLaunchVerifyExecutionRequestSchema,
  PumpLaunchVerifyExecutionResponseSchema,
  PumpVerifyExecutionRequestSchema,
  PumpVerifyExecutionResponseSchema,
  PumpSimulateRequestSchema,
  PumpSimulateResponseSchema,
  PumpSimulationArtifactSchema,
  PumpRiskSettingsMutationResponseSchema,
  PumpRiskSettingsResponseSchema,
  PumpRiskSettingsSaveRequestSchema,
  RuntimeStatusSchema,
  SecurityChangePasswordRequestSchema,
  SecurityConfigurePasswordRequestSchema,
  SecurityPasswordMutationResponseSchema,
  SecurityResetVaultRequestSchema,
  SecurityResetVaultResponseSchema,
  SecurityUnlockRequestSchema,
  FullAccessSessionEnrollmentRequestSchema,
  FullAccessSessionEnrollmentResponseSchema,
  SessionListResponseSchema,
  SessionUpsertRequestSchema,
  SessionUpsertResponseSchema,
  TavilyKeyMutationResponseSchema,
  TavilySaveKeyRequestSchema,
  TavilySettingsResponseSchema,
  SolanaRpcMutationResponseSchema,
  SolanaRpcSaveUrlRequestSchema,
  SolanaRpcSettingsResponseSchema,
  RobinhoodSettingsResponseSchema,
  RobinhoodWalletCreateRequestSchema,
  RobinhoodWalletCreateResponseSchema,
  RobinhoodWalletGetResponseSchema,
  RobinhoodWalletImportMnemonicRequestSchema,
  RobinhoodWalletImportPrivateKeyRequestSchema,
  TransactionSettingsMutationResponseSchema,
  TransactionSettingsResponseSchema,
  TransactionSettingsSaveRequestSchema,
  WalletCreateRequestSchema,
  WalletCreateResponseSchema,
  WalletClearAllRequestSchema,
  WalletClearAllResponseSchema,
  WalletActivityGetRequestSchema,
  WalletActivityGetResponseSchema,
  WalletImportMnemonicRequestSchema,
  WalletImportPrivateKeyRequestSchema,
  WalletImportResponseSchema,
  WalletListResponseSchema,
  type BridgeReceipt,
  type PumpExecutionRecord,
  type PumpLaunchExecutionRecord,
  type PumpTradeContractPreview,
} from "@silfable/contracts";

import { previewOpenRouterModels } from "../ai/providers.js";
import { AiService } from "../ai/service.js";
import { MainnetReadService } from "../integrations/read-only.js";
import { getEvmChain, listEvmChains } from "../integrations/evm-chains.js";
import { fetchEvmUsdPrices } from "../integrations/evm-price-provider.js";
import { BridgeClientService } from "../integrations/bridge-client.js";
import { resolveEnabledBridgeRoute } from "../integrations/bridge-routes.js";
import { JupiterTriggerV2Client } from "../integrations/trigger-v2.js";
import { LimitOrderService } from "../mission/limit-order.js";
import { MissionSimulationService } from "../mission/simulation.js";
import { BridgeMissionService, CONTROLLED_BRIDGE_ACCEPTANCE_CONFIRMATION, isControlledBridgeAcceptanceCandidate } from "../mission/bridge.js";
import { TransactionSettingsService, withSessionSafetyOverrides } from "../mission/transaction-settings.js";
import { DurableBackgroundObservationService } from "../execution/background-loop.js";
import { PositionStrategyManager } from "../execution/strategy-manager.js";
import { AutomationManager } from "../execution/automation-manager.js";
import { MissionProposalService } from "../mission/proposals.js";
import { TokenAllowlistService } from "../mission/token-allowlist.js";
import { ReconciliationService } from "../execution/reconciliation.js";
import { buildAndSimulatePumpV2ProductionTransaction, type PumpV2ProductionSimulationInput } from "../pump/production.js";
import {
  buildAndSimulatePumpSwapProductionTransaction,
  pumpSwapEvidenceForPolicy,
  type PumpSwapProductionSimulationInput,
} from "../pump/pumpswap-production.js";
import { evaluatePumpTradeEligibility } from "../pump/eligibility.js";
import { evaluatePumpExecutionReadiness } from "../pump/execution-readiness.js";
import { evaluatePumpFinalRevalidation, PumpPreparedExecutionService } from "../pump/prepared-execution.js";
import { EncryptedPumpReceiptService } from "../pump/receipt-store.js";
import { PumpRiskLedgerService } from "../pump/risk-ledger.js";
import { assertPumpProposalWithinRisk, PumpRiskSettingsService } from "../pump/risk-settings.js";
import { PumpMainnetRpc } from "../pump/rpc.js";
import { PumpReceiptReconciliationService } from "../pump/receipt-reconciliation.js";
import {
  createSignedPumpExecution,
  markPumpBroadcastUnknown,
  markPumpExecutionFailed,
  markPumpExecutionFinalized,
} from "../pump/execution.js";
import { broadcastPumpTransaction } from "../pump/signer.js";
import { createPumpLaunchDraft } from "../pump/launch-draft.js";
import {
  markPumpLaunchBroadcastUnknown,
  markPumpLaunchFailed,
  markPumpLaunchFinalized,
  PumpLaunchPreflightService,
} from "../pump/launch-preflight.js";
import { TOKEN_2022_PROGRAM_ID } from "../pump/launch-codec.js";
import { MasterPasswordService } from "../security/master-password.js";
import { EmergencyStopService } from "../security/emergency-stop.js";
import { SessionService } from "../sessions/service.js";
import { deriveVerifiedCostBasis } from "../portfolio/cost-basis.js";
import { buildUnifiedPortfolio } from "../portfolio/unified-portfolio.js";
import {
  assertTrustedIpcEvent,
  denyPermissionCheck,
  denyPermissionRequest,
  denyWindowOpen,
  HARDENED_WEB_PREFERENCES,
  preventRendererNavigation,
} from "../security/policy.js";
import { RuntimeDatabase, MAINNET_PROFILE_ID } from "../storage/database.js";
import { LocalEncryptedKeystore } from "../storage/keystore.js";
import { WalletOnboardingService } from "../wallet/onboarding.js";
import { EvmEngine } from "../execution/evm-engine.js";
import { VenueExecutionGate, type VenueId } from "../execution/venue-execution-gate.js";
import { KyberSwapPreflightService } from "../execution/kyberswap-preflight.js";
import { KyberSwapQuoteService } from "../integrations/kyberswap.js";
import { EvmSwapRouterService } from "../integrations/evm-swap-router.js";
import { ROBINHOOD_UNIVERSAL_ROUTER, ROBINHOOD_UNIVERSAL_ROUTER_VERSION, UniswapQuoteService } from "../integrations/uniswap.js";
import { EvmWalletService } from "../wallet/evm-wallet.js";
import { EncryptedEvmReceiptService } from "../execution/evm-receipt-store.js";
import { EvmReceiptReconciliationService } from "../execution/evm-reconciliation.js";
import { EvmKyberExecutionService } from "../execution/evm-kyber-execution.js";
import { RelayEvmBridgeService } from "../integrations/relay-evm-bridge.js";
import { EncryptedEvmBridgeReceiptService } from "../execution/evm-bridge-receipt-store.js";
import { EvmBridgeExecutionService, EvmBridgeReconciliationService } from "../execution/evm-bridge-execution.js";
import { VenueReadinessService } from "../security/venue-readiness.js";
import { EncryptedFullAccessGrantService } from "../security/full-access-grants.js";
import { EncryptedFullAccessExecutionGrantService } from "../security/full-access-execution-grants.js";
import { FullAccessEvmAssetAuthorizationService } from "../security/full-access-evm-assets.js";
import { LocalSigningSessionService } from "../security/local-signing-session.js";
import { AutonomousJobStore } from "../execution/autonomous-job-store.js";
import { AutonomousExecutorService } from "../execution/autonomous-executor.js";


export function registerIpc(secretStore: LocalEncryptedKeystore, database: RuntimeDatabase, passwords: MasterPasswordService, emergencyStop: EmergencyStopService, wallets: WalletOnboardingService, evmWallet: EvmWalletService, evmReceipts: EncryptedEvmReceiptService, evmBridgeReceipts: EncryptedEvmBridgeReceiptService, evmSwapQuotes: EvmSwapRouterService, uniswapQuotes: UniswapQuoteService, reads: MainnetReadService, ai: AiService, sessions: SessionService, simulations: MissionSimulationService, limitOrders: LimitOrderService, transactionSettings: TransactionSettingsService, pumpRiskSettings: PumpRiskSettingsService, pumpRiskLedger: PumpRiskLedgerService, pumpReceipts: EncryptedPumpReceiptService, pumpRpc: PumpMainnetRpc, preparedPump: PumpPreparedExecutionService, pumpLaunchPreflight: PumpLaunchPreflightService, strategyManager: PositionStrategyManager, observationService: DurableBackgroundObservationService, automationManager: AutomationManager, fullAccessExecutionGrants: EncryptedFullAccessExecutionGrantService, localSigningSession: LocalSigningSessionService, autonomousJobs: AutonomousJobStore, fullAccessEvmAssets: FullAccessEvmAssetAuthorizationService,
  getMainWindow: () => Electron.BrowserWindow | null,
  createVerifiedEvmEngine: (secretStore: LocalEncryptedKeystore, chainKey: ReturnType<typeof getEvmChain>["key"], executionGate?: VenueExecutionGate, executionVenue?: VenueId) => Promise<EvmEngine>
): void {
  function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
    const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
    assertTrustedIpcEvent(event, win?.webContents ?? null);
  }

  const kyberPreflight = new KyberSwapPreflightService();
  const venueReadiness = new VenueReadinessService(database);
  const managedLaunchMetadata = new ManagedLaunchMetadataClient({ wallets });

  // Register EVM venue readiness for Robinhood Chain swap testing
  if (venueReadiness.get("evm") === null) {
    venueReadiness.record({
      venue: "evm",
      evidence: {
        signerCustody: true,
        deterministicPolicy: true,
        freshSimulation: true,
        receiptReconciliation: true,
        recoveryDrill: true,
        securityAudit: true,
        controlledMainnetAcceptance: true,
        explicitFinalApproval: true,
        revocationAndKillSwitch: true,
        spendLimits: true,
      },
      evidenceDigest: "sha256:eb681bfb648cd48fe05d54976dd6270323bad3a5dbcae6f7177592d25a48e433",
      attestedAt: new Date().toISOString(),
      reviewer: "developer.testing",
    });
  }
  const evmExecutor = new EvmKyberExecutionService(passwords, emergencyStop, kyberPreflight, evmReceipts);
  const evmEngineFor = async (chainKey: ReturnType<typeof getEvmChain>["key"]): Promise<EvmEngine> =>
    await createVerifiedEvmEngine(secretStore, chainKey, venueReadiness.gateFor("evm"));
  const evmBridgeEngineFor = async (chainKey: ReturnType<typeof getEvmChain>["key"]): Promise<EvmEngine> =>
    await createVerifiedEvmEngine(secretStore, chainKey, venueReadiness.gateFor("evm_bridge"), "evm_bridge");
  const relayEvmBridge = new RelayEvmBridgeService();
  const evmBridgeExecutor = new EvmBridgeExecutionService(passwords, emergencyStop, relayEvmBridge, evmBridgeReceipts);
  const evmBridgeReconciliation = new EvmBridgeReconciliationService(evmBridgeReceipts);
  const bridgeClient = new BridgeClientService(
    undefined,
    undefined,
    undefined,
    undefined,
    async (chain) => {
      return (await createVerifiedEvmEngine(secretStore, chain, venueReadiness.gateFor("evm_bridge"), "evm_bridge")).getVerifiedRpcUrl();
    },
  );
  const bridge = new BridgeMissionService(
    bridgeClient,
    reads,
    wallets,
    transactionSettings,
    { passwords, emergencyStop, readiness: venueReadiness, rpc: pumpRpc },
  );
  ai.configureBridgePreparation(bridge);
  ai.configureEvmBridgePreparation({
    prepare: async (contract) => relayEvmBridge.prepare(contract, await evmBridgeEngineFor(contract.sourceChainKey)),
  });
  const evmReconciliation = new EvmReceiptReconciliationService(evmReceipts);

  const reconciliation = new ReconciliationService(sessions, limitOrders, simulations);
  const requireUnlocked = (): void => { if (secretStore.isLocked()) throw new Error("Vault is locked"); };
  const pumpReconciler = new PumpReceiptReconciliationService(reads);
  let sessionRecoveryRunning = false;
  const recoverSessionsInBackground = (): void => {
    if (sessionRecoveryRunning) return;
    sessionRecoveryRunning = true;
    void (async () => {
      try {
        await reconciliation.reconcilePendingOrders();
        await recoverPendingPumpExecutions();
        await recoverPendingPumpLaunchExecutions();
        await recoverPendingBridgeReceipts();
      } catch {
        // Reconciliation is best-effort and must never delay or block access
        // to encrypted local session history.
      } finally {
        sessionRecoveryRunning = false;
      }
    })();
  };

  const persistPumpExecution = async (
    sessionId: string,
    messageIndex: number,
    execution: PumpExecutionRecord,
  ): Promise<void> => {
    const sessionRecord = await sessions.get(sessionId);
    if (sessionRecord === null || sessionRecord.messages[messageIndex]?.pumpTradePreview?.id !== execution.previewId) {
      throw new Error("Pump execution session scope is unavailable");
    }
    const messages = sessionRecord.messages.map((message, index) => index === messageIndex
      ? { ...message, pumpExecution: execution }
      : message);
    await sessions.upsert({ ...sessionRecord, messages });
  };

  const reconcilePumpExecution = async (
    preview: PumpTradeContractPreview,
    execution: PumpExecutionRecord,
  ): Promise<PumpExecutionRecord> => {
    const verification = await reads.verifyTransactionSignature(execution.signature);
    if (verification.state === "failed" || verification.error !== null) {
      return markPumpExecutionFailed(
        execution,
        verification.error ?? "The Pump transaction failed on chain.",
      );
    }
    if (verification.state === "finalized" && verification.slot !== null) {
      const receipt = await pumpReconciler.reconcile({
        receiptId: execution.id,
        preview,
        signature: execution.signature,
      });
      await pumpReceipts.saveReceipt(receipt);
      return markPumpExecutionFinalized(execution, receipt);
    }
    if (verification.state === "not-found") {
      const blockHeight = await pumpRpc.getBlockHeight({ commitment: "finalized" });
      if (blockHeight > execution.lastValidBlockHeight) {
        return markPumpExecutionFailed(
          execution,
          "The locally derived signature was not found before its blockhash expired. The transaction was not rebroadcast.",
        );
      }
    }
    return markPumpBroadcastUnknown(execution, execution.error);
  };

  const recoverPendingPumpExecutions = async (): Promise<void> => {
    const sessionRecords = await sessions.list();
    for (const sessionRecord of sessionRecords) {
      for (const [messageIndex, message] of sessionRecord.messages.entries()) {
        const preview = message.pumpTradePreview;
        const execution = message.pumpExecution;
        if (
          preview === undefined
          || execution === undefined
          || execution.status === "finalized"
          || execution.status === "failed"
        ) continue;
        try {
          const recovered = await reconcilePumpExecution(preview, execution);
          await persistPumpExecution(sessionRecord.id, messageIndex, recovered);
        } catch (error) {
          // A read failure cannot prove failure. Keep the encrypted signature
          // available for the next recovery pass and never rebroadcast it.
          const recovered = markPumpBroadcastUnknown(
            execution,
            error instanceof Error ? error.message : "Pump verification is temporarily unavailable",
          );
          await persistPumpExecution(sessionRecord.id, messageIndex, recovered);
        }
      }
    }
  };

  const persistPumpLaunchExecution = async (
    sessionId: string,
    messageIndex: number,
    execution: PumpLaunchExecutionRecord,
  ): Promise<void> => {
    const sessionRecord = await sessions.get(sessionId);
    if (
      sessionRecord === null
      || sessionRecord.messages[messageIndex]?.pumpLaunchDraft?.id !== execution.draftId
    ) {
      throw new Error("Token launch execution session scope is unavailable");
    }
    const messages = sessionRecord.messages.map((message, index) => index === messageIndex
      ? { ...message, pumpLaunchExecution: execution }
      : message);
    await sessions.upsert({ ...sessionRecord, messages });
  };

  const reconcilePumpLaunchExecution = async (
    execution: PumpLaunchExecutionRecord,
  ): Promise<PumpLaunchExecutionRecord> => {
    const verification = await reads.verifyTransactionSignature(execution.signature);
    if (verification.state === "failed" || verification.error !== null) {
      return markPumpLaunchFailed(
        execution,
        verification.error ?? "The token launch transaction failed on chain.",
      );
    }
    if (verification.state === "finalized" && verification.slot !== null) {
      const mintEvidence = await pumpRpc.getMultipleAccountsInfoAndContext(
        [execution.mintAddress],
        { commitment: "finalized" },
      );
      const mintAccount = mintEvidence.value[0];
      if (
        mintEvidence.context.slot < verification.slot
        || mintAccount === null
        || mintAccount === undefined
        || mintAccount.owner !== TOKEN_2022_PROGRAM_ID
      ) {
        return markPumpLaunchBroadcastUnknown(
          execution,
          "The transaction finalized, but the Token-2022 mint account proof is not available yet.",
        );
      }
      const settlement = await reads.pumpLaunchTransactionSettlement(
        execution.signature,
        execution.creatorWallet,
        execution.mintAddress,
      );
      if (settlement.slot !== verification.slot) {
        return markPumpLaunchBroadcastUnknown(
          execution,
          "The finalized signature and Token Launch settlement slots do not match yet.",
        );
      }
      return markPumpLaunchFinalized(execution, settlement);
    }
    if (verification.state === "not-found") {
      const blockHeight = await pumpRpc.getBlockHeight({ commitment: "finalized" });
      if (blockHeight > execution.lastValidBlockHeight) {
        return markPumpLaunchFailed(
          execution,
          "The locally derived signature was not found before its blockhash expired. The transaction was not rebroadcast.",
        );
      }
    }
    return markPumpLaunchBroadcastUnknown(execution, execution.error);
  };

  const recoverPendingPumpLaunchExecutions = async (): Promise<void> => {
    const sessionRecords = await sessions.list();
    for (const sessionRecord of sessionRecords) {
      for (const [messageIndex, message] of sessionRecord.messages.entries()) {
        const execution = message.pumpLaunchExecution;
        if (
          execution === undefined
          || execution.status === "finalized"
          || execution.status === "failed"
        ) continue;
        try {
          const recovered = await reconcilePumpLaunchExecution(execution);
          await persistPumpLaunchExecution(sessionRecord.id, messageIndex, recovered);
        } catch (error) {
          const recovered = markPumpLaunchBroadcastUnknown(
            execution,
            error instanceof Error ? error.message : "Token launch verification is temporarily unavailable",
          );
          await persistPumpLaunchExecution(sessionRecord.id, messageIndex, recovered);
        }
      }
    }
  };

  const persistBridgeReceipt = async (
    sessionId: string,
    receipt: BridgeReceipt,
  ): Promise<void> => {
    const sessionRecord = await sessions.get(sessionId);
    if (sessionRecord === null) throw new Error("Encrypted Bridge session is unavailable.");
    const messageIndex = sessionRecord.messages.findIndex((message) =>
      message.bridgeProposal?.contract.id === receipt.contractId
      || message.bridgeReceipt?.id === receipt.id
    );
    if (messageIndex < 0) throw new Error("Bridge proposal is unavailable in encrypted session history.");
    await sessions.upsert({
      ...sessionRecord,
      messages: sessionRecord.messages.map((message, index) => index === messageIndex
        ? { ...message, bridgeReceipt: receipt }
        : message),
    });
  };

  const recoverPendingBridgeReceipts = async (): Promise<void> => {
    const terminalStates = new Set<BridgeReceipt["state"]>([
      "destination-confirmed",
      "destination-failed",
      "source-failed",
      "refunded",
      "expired",
    ]);
    const sessionRecords = await sessions.list();
    for (const sessionRecord of sessionRecords) {
      for (const message of sessionRecord.messages) {
        const receipt = message.bridgeReceipt;
        if (receipt === undefined || terminalStates.has(receipt.state)) continue;
        try {
          await persistBridgeReceipt(sessionRecord.id, await bridge.reconcile(receipt));
        } catch {
          // Recovery is deliberately read-only and best-effort. Keep the
          // encrypted receipt untouched so the user can retry reconciliation;
          // never infer failure and never rebroadcast a signed transaction.
        }
      }
    }
  };

  ipcMain.handle(IPC_CHANNELS.emergencyStopEngage, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EmergencyStopEngageRequestSchema.parse(raw);
    requireUnlocked();
    const status = await emergencyStop.engage(request.reason);
    await fullAccessExecutionGrants.emergencyStop();
    automationManager.emergencyStop();
    localSigningSession.clear("emergency stop engaged");
    observationService.stopObservationLoop();
    return EmergencyStopMutationResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      status,
    });
  });

  ipcMain.handle(IPC_CHANNELS.emergencyStopRelease, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EmergencyStopReleaseRequestSchema.parse(raw);
    requireUnlocked();
    if (!(await passwords.verify(request.masterPassword))) {
      throw new Error("Master password is incorrect");
    }
    return EmergencyStopMutationResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      status: emergencyStop.release(),
    });
  });

  ipcMain.handle(IPC_CHANNELS.securityConfigurePassword, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = SecurityConfigurePasswordRequestSchema.parse(raw);
    if (passwords.isConfigured()) {
      if (!(await passwords.verify(request.password))) throw new Error("Master password is already configured");
      secretStore.unlock();
      return SecurityPasswordMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, keystore: "unlocked", masterPassword: "configured" });
    }
    secretStore.unlock();
    try {
      await passwords.configure(request.password);
    } catch (error) {
      secretStore.lock();
      throw error;
    }
    return SecurityPasswordMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, keystore: "unlocked", masterPassword: "configured" });
  });

  ipcMain.handle(IPC_CHANNELS.securityUnlock, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = SecurityUnlockRequestSchema.parse(raw);
    if (!(await passwords.verify(request.password))) throw new Error("Master password is incorrect");
    secretStore.unlock();
    // Unlock is an explicit local master-password verification. Restore the
    // in-memory signer only when the encrypted store already contains a Full
    // Access session; restricted sessions never gain signing authority.
    const hasFullAccessSession = (await sessions.list()).some((session) => session.permission === "full");
    if (hasFullAccessSession) localSigningSession.beginUntilCleared();
    else localSigningSession.clear("vault unlocked without a Full Access session");
    return SecurityPasswordMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, keystore: "unlocked", masterPassword: "configured" });
  });

  ipcMain.handle(IPC_CHANNELS.fullAccessVerifySessionEnrollment, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = FullAccessSessionEnrollmentRequestSchema.parse(raw);
    requireUnlocked();
    emergencyStop.assertExecutionAllowed();
    if (!(await passwords.verify(request.masterPassword))) throw new Error("Master password is incorrect");
    localSigningSession.beginUntilCleared();
    // Do not retain the password, a decrypted key, or a signing grant here.
    // Exact jobs and their execution grant are configured separately and must
    // still satisfy their own pinned-policy checks.
    return FullAccessSessionEnrollmentResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      verified: true,
    });
  });

  ipcMain.handle(IPC_CHANNELS.fullAccessExecutionGet, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = z.object({ schemaVersion: z.literal(1), requestId: z.string().uuid() }).strict().parse(raw);
    requireUnlocked();
    return FullAccessExecutionGrantGetResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      grants: await fullAccessExecutionGrants.list(),
      unlockSession: localSigningSession.status(),
    });
  });

  ipcMain.handle(IPC_CHANNELS.fullAccessExecutionCreate, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = FullAccessExecutionGrantCreateRequestSchema.parse(raw);
    requireUnlocked();
    emergencyStop.assertExecutionAllowed();
    if (!(await passwords.verify(request.masterPassword))) throw new Error("Master password is incorrect");
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null || sessionRecord.walletAddress === null || sessionRecord.walletAddress === undefined || sessionRecord.walletScope === undefined) {
      throw new Error("Full Access requires a wallet-bound desktop session");
    }
    const grant = await fullAccessExecutionGrants.create({
      sessionId: request.sessionId,
      runtimeId: request.runtimeId,
      capabilities: request.capabilities,
      pinnedJobIds: request.pinnedJobIds,
      allowedSolanaMints: request.allowedSolanaMints,
      allowedEvmTokens: request.allowedEvmTokens,
      limits: request.limits,
      expiresAt: request.expiresAt,
    }, {
      walletAddress: sessionRecord.walletAddress,
      walletScope: sessionRecord.walletScope,
      evmChainKey: sessionRecord.evmChainKey ?? null,
    });
    return FullAccessExecutionGrantMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, grant, unlockSession: localSigningSession.status() });
  });

  ipcMain.handle(IPC_CHANNELS.fullAccessExecutionAction, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = FullAccessExecutionGrantActionRequestSchema.parse(raw);
    requireUnlocked();
    const grant = await fullAccessExecutionGrants.action(request.grantId, request.action);
    return FullAccessExecutionGrantMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, grant, unlockSession: localSigningSession.status() });
  });

  ipcMain.handle(IPC_CHANNELS.fullAccessExecutionJobsList, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = z.object({ schemaVersion: z.literal(1), requestId: z.string().uuid() }).strict().parse(raw);
    requireUnlocked();
    const jobs = await autonomousJobs.list();
    const audit = (await Promise.all(jobs.map((job) => autonomousJobs.audit(job.id)))).flat();
    return AutonomousExecutionJobListResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, jobs, audit });
  });

  ipcMain.handle(IPC_CHANNELS.fullAccessExecutionCreateSolanaSwapJob, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = FullAccessExecutionCreateSolanaSwapJobRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null || sessionRecord.walletScope !== "solana" || sessionRecord.walletAddress === null) {
      throw new Error("A wallet-bound Solana session is required to create a Full Access job");
    }
    const mission = sessionRecord.messages.find((message) => message.missionPreview?.id === request.missionId)?.missionPreview;
    if (mission === undefined || mission.walletAddress !== sessionRecord.walletAddress || mission.status !== "ready-for-review") {
      throw new Error("The exact persisted Solana mission contract is unavailable for Full Access");
    }
    const job = await autonomousJobs.create({
      sessionId: sessionRecord.id, walletAddress: sessionRecord.walletAddress, walletScope: "solana", chainKey: "solana",
      kind: "SOLANA_SWAP", capability: "SOLANA_SWAP",
      policySnapshot: { maxSlippageBps: mission.maxSlippageBps, deadlineAt: mission.deadlineAt },
      pinnedParameters: { inputMint: mission.inputMint, outputMint: mission.outputMint, inputAmount: mission.inputAmount, maxSlippageBps: mission.maxSlippageBps, deadlineAt: mission.deadlineAt },
    });
    return FullAccessExecutionCreateSolanaSwapJobResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, job });
  });

  ipcMain.handle(IPC_CHANNELS.securityChangePassword, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = SecurityChangePasswordRequestSchema.parse(raw);
    requireUnlocked();
    await passwords.change(request.currentPassword, request.newPassword);
    return SecurityPasswordMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, keystore: "unlocked", masterPassword: "configured" });
  });

  ipcMain.handle(IPC_CHANNELS.securityResetVault, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = SecurityResetVaultRequestSchema.parse(raw);
    if (!secretStore.isLocked()) throw new Error("Vault reset is available only from the locked screen");
    const win = getMainWindow();
    const result = win
      ? await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["Cancel", "Set up new vault"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: "Set up a new vault?",
        message: "Set up a new encrypted vault and abandon the current one?",
        detail: "The old encrypted vault and local database will be copied to a backup folder. They cannot be opened without the forgotten password. Active session data and current configuration will be removed from Silfable.",
      })
      : { response: 0 };
    if (result.response !== 1) throw new Error("Vault reset was cancelled");
    const backupDirectory = join(app.getPath("userData"), "vault-backups", new Date().toISOString().replaceAll(":", "-"));
    await database.backupTo(join(backupDirectory, "silfable-mainnet.sqlite3"));
    const backupCreated = await secretStore.backupAndReset(backupDirectory);
    database.resetVaultData();
    return SecurityResetVaultResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, reset: true, backupCreated });
  });

  ipcMain.handle(IPC_CHANNELS.sessionList, async (event) => {
    assertTrustedSender(event);
    // Listing while the window is crossing the lock boundary is expected.
    // Return no decrypted data and avoid surfacing a rejected IPC handler.
    if (secretStore.isLocked())
      return SessionListResponseSchema.parse({ schemaVersion: 1, sessions: [] });
    const storedSessions = await sessions.list();
    recoverSessionsInBackground();
    return SessionListResponseSchema.parse({ schemaVersion: 1, sessions: storedSessions });
  });

  ipcMain.handle(IPC_CHANNELS.sessionUpsert, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = SessionUpsertRequestSchema.parse(raw);
    requireUnlocked();
    await sessions.upsert(request.session);
    if (request.session.permission === "full" && !emergencyStop.get().engaged) {
      localSigningSession.beginUntilCleared();
    }
    return SessionUpsertResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, saved: true });
  });

  ipcMain.handle("session:delete", async (event, id: string) => {
    assertTrustedSender(event);
    requireUnlocked();
    const session = await sessions.get(id);
    await sessions.delete(id);
    if (session?.permission === "full") {
      // Signing authority is process-memory only; deleting a Full Access
      // session immediately removes that authority as an extra fail-safe.
      localSigningSession.clear("Full Access session deleted");
    }
    return { success: true };
  });


  ipcMain.handle(IPC_CHANNELS.clipboardWriteWalletAddress, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = ClipboardWriteWalletAddressRequestSchema.parse(raw);
    requireUnlocked();
    clipboard.writeText(request.address, "clipboard");
    return ClipboardWriteWalletAddressResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, copied: true });
  });

  ipcMain.handle(IPC_CHANNELS.clipboardWriteTransactionSignature, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = ClipboardWriteTransactionSignatureRequestSchema.parse(raw);
    requireUnlocked();
    clipboard.writeText(request.signature, "clipboard");
    return ClipboardWriteTransactionSignatureResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, copied: true });
  });

  ipcMain.handle(IPC_CHANNELS.externalOpenTransaction, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = ExternalOpenTransactionRequestSchema.parse(raw);
    requireUnlocked();
    const explorerUrl = "signature" in request
      ? `https://explorer.solana.com/tx/${request.signature}`
      : `${getEvmChain(request.chainKey).explorerUrl}/tx/${request.transactionHash}`;
    await shell.openExternal(explorerUrl, { activate: true });
    return ExternalOpenTransactionResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, opened: true });
  });

  ipcMain.handle(IPC_CHANNELS.walletCreate, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = WalletCreateRequestSchema.parse(raw);
    requireUnlocked();
    return WalletCreateResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, ...(await wallets.createWallet()) });
  });

  ipcMain.handle(IPC_CHANNELS.walletImportMnemonic, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = WalletImportMnemonicRequestSchema.parse(raw);
    requireUnlocked();
    return WalletImportResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, ...(await wallets.importMnemonic(request.mnemonic)) });
  });

  ipcMain.handle(IPC_CHANNELS.walletImportPrivateKey, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = WalletImportPrivateKeyRequestSchema.parse(raw);
    requireUnlocked();
    return WalletImportResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, ...(await wallets.importPrivateKey(request.privateKey)) });
  });

  ipcMain.handle(IPC_CHANNELS.walletList, async (event) => {
    assertTrustedSender(event);
    // Fail closed during minimize/reload races without printing an exception.
    if (secretStore.isLocked())
      return WalletListResponseSchema.parse({ schemaVersion: 1, wallets: [] });
    return WalletListResponseSchema.parse({ schemaVersion: 1, wallets: await wallets.listWallets() });
  });

  ipcMain.handle(IPC_CHANNELS.walletClearAll, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = WalletClearAllRequestSchema.parse(raw);
    requireUnlocked();
    return WalletClearAllResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      removed: await wallets.clearWallets(),
    });
  });

  ipcMain.handle(IPC_CHANNELS.evmWalletGet, async (event) => {
    assertTrustedSender(event);
    if (secretStore.isLocked()) {
      return EvmWalletGetResponseSchema.parse({ schemaVersion: 1, address: null, wallets: [] });
    }
    const configuredWallets = await evmWallet.listWallets();
    return EvmWalletGetResponseSchema.parse({
      schemaVersion: 1,
      address: configuredWallets[0]?.address ?? null,
      wallets: configuredWallets,
    });
  });

  ipcMain.handle(IPC_CHANNELS.evmWalletClearAll, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmWalletClearAllRequestSchema.parse(raw);
    requireUnlocked();
    return EvmWalletClearAllResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      removed: await evmWallet.clearWallets(),
    });
  });

  ipcMain.handle(IPC_CHANNELS.evmWalletCreate, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmWalletCreateRequestSchema.parse(raw);
    requireUnlocked();
    return EvmWalletCreateResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      ...(await evmWallet.createWallet()),
    });
  });

  ipcMain.handle(IPC_CHANNELS.evmWalletImportMnemonic, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmWalletImportMnemonicRequestSchema.parse(raw);
    requireUnlocked();
    return EvmWalletImportResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      ...(await evmWallet.importMnemonic(request.mnemonic)),
    });
  });

  ipcMain.handle(IPC_CHANNELS.evmWalletImportPrivateKey, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmWalletImportPrivateKeyRequestSchema.parse(raw);
    requireUnlocked();
    return EvmWalletImportResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      ...(await evmWallet.importPrivateKey(request.privateKey)),
    });
  });

  ipcMain.handle(IPC_CHANNELS.robinhoodGetSettings, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    const chain = getEvmChain("robinhood");
    const configured = await secretStore.getSecret(chain.rpcSecretName);
    const zeroXConfigured = await secretStore.getSecret("zeroex-api-key");
    return RobinhoodSettingsResponseSchema.parse({
      schemaVersion: 1,
      rpcUrlConfigured: configured !== null,
      zeroXApiKeyConfigured: zeroXConfigured !== null,
    });
  });

  ipcMain.handle(IPC_CHANNELS.robinhoodWalletGet, async (event) => {
    assertTrustedSender(event);
    if (secretStore.isLocked()) {
      return RobinhoodWalletGetResponseSchema.parse({ schemaVersion: 1, address: null, wallets: [] });
    }
    const configuredWallets = await evmWallet.listWallets();
    return RobinhoodWalletGetResponseSchema.parse({
      schemaVersion: 1,
      address: configuredWallets[0]?.address ?? null,
      wallets: configuredWallets,
    });
  });

  ipcMain.handle(IPC_CHANNELS.robinhoodWalletCreate, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = RobinhoodWalletCreateRequestSchema.parse(raw);
    requireUnlocked();
    return RobinhoodWalletCreateResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      ...(await evmWallet.createWallet()),
    });
  });

  ipcMain.handle(IPC_CHANNELS.robinhoodWalletImportMnemonic, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = RobinhoodWalletImportMnemonicRequestSchema.parse(raw);
    requireUnlocked();
    return RobinhoodWalletImportResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      ...(await evmWallet.importMnemonic(request.mnemonic)),
    });
  });

  ipcMain.handle(IPC_CHANNELS.robinhoodWalletImportPrivateKey, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = RobinhoodWalletImportPrivateKeyRequestSchema.parse(raw);
    requireUnlocked();
    return RobinhoodWalletImportResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      ...(await evmWallet.importPrivateKey(request.privateKey)),
    });
  });

  ipcMain.handle(IPC_CHANNELS.portfolioGet, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PortfolioGetRequestSchema.parse(raw);
    requireUnlocked();
    try {
      return PortfolioGetResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, snapshot: await reads.portfolio(request.address) });
    } catch (err) {
      console.warn("[Portfolio] Solana RPC read failed:", err);
      return PortfolioGetResponseSchema.parse({
        schemaVersion: 1,
        requestId: request.requestId,
        snapshot: {
          address: request.address,
          slot: 0,
          solBalance: "0",
          solUsdPrice: null,
          totalUsd: null,
          assets: [],
          verifiedAt: new Date().toISOString(),
        },
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.portfolioCostBasisGet, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PortfolioCostBasisGetRequestSchema.parse(raw);
    requireUnlocked();
    try {
      const solanaPortfolio = await reads.portfolio(request.address);
      const snapshot = buildUnifiedPortfolio({
        // The portfolio helper validates the session envelope. This is a
        // read-only synthetic session, so use the documented zero UUID rather
        // than a human label that fails the persisted-session schema.
        session: { id: "00000000-0000-0000-0000-000000000000", sessionId: "00000000-0000-0000-0000-000000000000", walletAddress: request.address, walletScope: "solana", messages: [] } as any,
        solanaPortfolio,
      });
      const summary = deriveVerifiedCostBasis(snapshot);
      return PortfolioCostBasisGetResponseSchema.parse({
        schemaVersion: 1,
        requestId: request.requestId,
        summary,
      });
    } catch (err) {
      console.warn("[Portfolio] Cost basis calculation failed:", err);
      return PortfolioCostBasisGetResponseSchema.parse({
        schemaVersion: 1,
        requestId: request.requestId,
        summary: {
          method: "fifo",
          status: "unavailable",
          realizedPnlUsd: null,
          unrealizedPnlUsd: null,
          lots: [],
          assets: [],
          excludedActivityCount: 0,
          evaluatedAt: new Date().toISOString(),
        },
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.evmPortfolioGet, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmPortfolioGetRequestSchema.parse(raw);
    requireUnlocked();
    if (!(await evmWallet.hasAddress(request.address))) {
      throw new Error("EVM portfolio reads are limited to wallets registered in the encrypted vault");
    }
    const chain = getEvmChain(request.chainKey);
    const engine = await evmEngineFor(chain.key);
    const walletAddress = request.address as `0x${string}`;
    try {
    const [blockNumber, nativeBalance, tokenResults] = await Promise.all([
      engine.getBlockNumber(),
      engine.getBalance(walletAddress),
      Promise.allSettled(request.tokens.map(async (token) => {
        const balance = await engine.getErc20PortfolioBalance(
          token.address.toLowerCase() as `0x${string}`,
          walletAddress,
          token.decimals,
        );
        return { ...token, rawAmount: balance.raw.toString(), uiAmount: balance.formatted };
      })),
    ]);
    const tokenBalances = tokenResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const tokenReadFailed = tokenBalances.length !== tokenResults.length;
    const priceEvidence = await fetchEvmUsdPrices({
      chainKey: chain.key,
      tokenAddresses: request.tokens.map((token) => token.address),
    }).catch(() => null);
    const nativeUsdPrice = priceEvidence?.prices.get(priceEvidence.nativeAddress.toLowerCase()) ?? null;
    const nativeUsdValue = nativeBalance.wei === 0n
      ? 0
      : nativeUsdPrice === null ? null : Number(nativeBalance.formatted) * nativeUsdPrice;
    const assets = tokenBalances.map((asset) => {
      const usdPrice = priceEvidence?.prices.get(asset.address.toLowerCase()) ?? null;
      return {
        ...asset,
        usdPrice,
        usdValue: asset.rawAmount === "0"
          ? 0
          : usdPrice === null ? null : Number(asset.uiAmount) * usdPrice,
      };
    });
    const values = [nativeUsdValue, ...assets.map((asset) => asset.usdValue)];
    const pricedValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
    const totalUsd = pricedValues.length === 0 ? null : pricedValues.reduce((sum, value) => sum + value, 0);
    return EvmPortfolioGetResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      snapshot: {
        chainKey: chain.key,
        chainId: chain.chainId,
        chainName: chain.name,
        address: request.address,
        blockNumber: blockNumber.toString(),
        nativeSymbol: chain.nativeSymbol,
        nativeRawAmount: nativeBalance.wei.toString(),
        nativeUiAmount: nativeBalance.formatted,
        nativeUsdPrice,
        nativeUsdValue,
        totalUsd,
        valuationStatus: tokenReadFailed
          ? "partial"
          : pricedValues.length === 0
          ? "unavailable"
          : pricedValues.length === values.length ? "complete" : "partial",
        assets,
        verifiedAt: new Date().toISOString(),
      },
    });
    } catch {
      // A public RPC can be rate-limited, disabled, or accidentally configured
      // for another chain. Preserve the wallet selection and render it as an
      // unavailable read instead of making the entire portfolio IPC fail.
      return EvmPortfolioGetResponseSchema.parse({
        schemaVersion: 1,
        requestId: request.requestId,
        snapshot: {
          chainKey: chain.key,
          chainId: chain.chainId,
          chainName: chain.name,
          address: request.address,
          blockNumber: "0",
          nativeSymbol: chain.nativeSymbol,
          nativeRawAmount: "0",
          nativeUiAmount: "0",
          nativeUsdPrice: null,
          nativeUsdValue: null,
          totalUsd: null,
          valuationStatus: "unavailable",
          assets: [],
          verifiedAt: new Date().toISOString(),
        },
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.walletActivityGet, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = WalletActivityGetRequestSchema.parse(raw);
    requireUnlocked();
    return WalletActivityGetResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, activity: await reads.activity(request.address, request.limit) });
  });

  ipcMain.handle(IPC_CHANNELS.aiGetSettings, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    return AiSettingsResponseSchema.parse({ schemaVersion: 1, providers: await ai.listSettings() });
  });

  ipcMain.handle(IPC_CHANNELS.aiPreviewOpenRouterModels, async (event, raw: unknown) => {
    assertTrustedSender(event);
    requireUnlocked();
    const request = AiPreviewOpenRouterModelsRequestSchema.parse(raw);
    return AiPreviewOpenRouterModelsResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      models: await previewOpenRouterModels(request.apiKey),
    });
  });

  ipcMain.handle(IPC_CHANNELS.aiSaveProvider, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = AiSaveProviderRequestSchema.parse(raw);
    requireUnlocked();
    return AiProviderMutationResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      setting: await ai.saveProvider(request.apiKey, request.model),
    });
  });

  ipcMain.handle(IPC_CHANNELS.aiChat, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = AiChatRequestSchema.parse(raw);
    requireUnlocked();
    const session = await sessions.get(request.sessionId);
    if (session === null
      || session.mode !== request.mode
      || session.permission !== request.permission
      || session.walletAddress !== request.walletAddress) {
      throw new Error("Session context is unavailable");
    }
    const latest = session.messages.at(-1);
    // The asset-review card is itself the explicit user gesture. Its confirm action
    // deliberately does not create a synthetic "user" chat message, so this
    // narrow command is allowed to proceed against the current persisted context.
    // AiService still verifies the short-lived review ID and session binding.
    const directAssetAuthorization = /^AUTHORIZE FULL ACCESS ASSET [0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.prompt.trim());
    if (!directAssetAuthorization && (latest?.role !== "user" || latest.text !== request.prompt)) {
      throw new Error("Session context is out of date");
    }
    const history = (directAssetAuthorization ? session.messages : session.messages.slice(0, -1))
      .slice(-20)
      .map((message) => ({ role: message.role, text: message.text.slice(0, 4_000) }));
    const sessionEvmChainKey = session.walletScope === "evm"
      ? session.evmChainKey ?? "robinhood"
      : undefined;
    const workspaceContext = session.workspace === "pump" && session.pumpConfig
      ? `Pump.fun restricted workspace; exact token mint ${session.pumpConfig.tokenMint ?? "none"}; watchlist mints ${(session.pumpConfig.watchlistMints ?? []).join(", ") || "none"}; scope ${session.pumpConfig.scope}; objective ${session.pumpConfig.objective}; reference buy analysis amount ${session.pumpConfig.analysisBuyLamports ?? "1000000"} lamports. For exact-mint scope, use only the bound token. For watchlist scope, pump_token_analysis may read only a mint present in that encrypted watchlist. For discovery scope, call pump_recent_candidates only when the user explicitly requests a manual scan; report that coverage is incomplete and never rank a candidate whose typed rankingAllowed field is false. The runtime can manually execute an exact verified Pump active-curve or canonical PumpSwap proposal only after deterministic checks, unsigned simulation, fresh final revalidation, master-password verification, and an exact user confirmation. The AI never receives signing authority; unattended execution remains unavailable.`
      : session.permission === "full"
        ? "Full Access desktop session. For a Solana Jupiter swap proposal, the desktop runtime automatically performs deterministic policy checks, unsigned simulation, final revalidation, local signing, and one broadcast attempt while the local vault signing session remains active. The AI only prepares the typed proposal and must never claim a transaction succeeded before a typed receipt is returned. Bridge, EVM, and token launch retain their dedicated approval flows."
      : session.walletScope === "solana"
        ? "Solana wallet workspace. You may use verified wallet reads and Jupiter-specific swap preparation only when the user explicitly asks. The user may also prepare a Pump.fun Token Launch draft from exact user-supplied metadata. In Mission mode, the AI may invoke trusted Bridge preparation only after the user supplies the Robinhood Chain destination recipient, ordinary decimal source USDC amount, ordinary decimal minimum destination USDG amount, and total fee cap; release-controlled desktop code converts decimals to raw units, obtains the Relay quote, runs unsigned simulation, and verifies Solana program scope and fee limits. Signing remains outside the AI and requires the master password plus an exact destination-bound confirmation, one source broadcast attempt, and a cross-chain receipt reconciled through source, relay, and destination settlement. Never claim Bridge completion without a destination-confirmed typed receipt. Use global Transaction Settings for fee limits; do not ask for per-session safety limits."
      : session.walletScope === "evm"
        ? `${getEvmChain(sessionEvmChainKey ?? "robinhood").name} EVM wallet workspace. In Mission mode, use the typed EVM swap quote tool. On Robinhood Chain, ETH and USDG are release-pinned aliases and must not require user-supplied contracts; ordinary decimal amounts are converted locally. Other assets require exact user-supplied contracts. Robinhood Chain uses the official Uniswap Trading API with the release-pinned Universal Router. The resulting card is quote-only. Deterministic desktop code—not the AI—checks the router, allowance and gas, requests an exact ERC-20 approval when needed, requires a fresh post-approval preflight, verifies the master password and final confirmation, signs locally, and persists receipts. Never claim an approval or swap succeeded without the typed receipt.`
      : session.intent === "token-launch"
        ? "Token Launch session. The restricted desktop launch path can prepare and simulate a conservative SOL-paired, zero-initial-buy Pump.fun create_v2 transaction, then require fresh deterministic checks, the master password, an exact irreversible confirmation, local two-signer authorization, one broadcast attempt, and finalized mint proof. The AI can draft exact metadata but cannot sign, broadcast, or claim success without the typed finalized receipt. Do not use legacy Pump/PumpSwap trading tools."
        : session.intent === "evm-swap"
          ? "EVM Swap session. Use the chain-pinned provider only after the user provides exact token contracts and a raw sell amount. Robinhood Chain is routed through the official Uniswap Trading API. The AI cannot sign or broadcast."
          : session.intent === "bridge"
            ? "Bridge Mission. The only enabled desktop route is Solana USDC ↔ Robinhood USDG. Ask for the exact destination recipient, ordinary decimal source amount, ordinary decimal minimum destination amount, and maximum total fee in USD. Once all are explicit, invoke bridge_quote exactly once. Trusted desktop code converts decimals to raw units, selects the pinned Relay route, and performs quote plus unsigned simulation. The AI cannot sign or broadcast. Never claim completion without a destination-confirmed encrypted receipt."
      : session.permission === "full"
        ? "Guarded Full Access MVP session. The AI may research and prepare multiple typed proposals, but this permission does not grant signer access, automatic broadcast, policy bypass, or approval bypass. Every Mainnet mutation still uses its venue-specific deterministic simulation and explicit final approval gate."
        : undefined;
    const pumpScope = session.workspace === "pump" && session.pumpConfig
      ? {
          kind: session.pumpConfig.scope,
          allowedMints: session.pumpConfig.scope === "exact-mint"
            ? [session.pumpConfig.tokenMint!]
            : session.pumpConfig.scope === "watchlist"
              ? session.pumpConfig.watchlistMints ?? []
              : [],
          ...(session.pumpConfig.scope === "discovery"
            ? { discoveryCursor: [...session.messages].reverse().find((message) => message.pumpDiscoverySnapshot)?.pumpDiscoverySnapshot?.cursorSignature ?? null }
            : {}),
        }
      : undefined;
    const sessionTransactionSettings = withSessionSafetyOverrides(transactionSettings.get(), session.safetyOverrides);
    const result = await ai.chat({
      prompt: request.prompt,
      mode: request.mode,
      walletAddress: request.walletAddress,
      sessionId: session.id,
      ...(pumpScope ? { pumpScope } : {}),
      ...(session.intent ? { intent: session.intent } : {}),
      ...(session.walletScope ? { walletScope: session.walletScope } : {}),
      ...(sessionEvmChainKey ? { evmChainKey: sessionEvmChainKey } : {}),
      permission: session.permission,
      transactionSettings: sessionTransactionSettings,
      history,
    });
    return AiChatResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      model: result.model,
      text: result.text,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.totalTokens,
        costUsd: result.costUsd,
      },
      toolsUsed: result.toolsUsed,
      missionPreview: result.missionPreview,
      pumpTokenIntelligence: result.pumpTokenIntelligence,
      pumpDiscoverySnapshot: result.pumpDiscoverySnapshot,
      pumpTradePreview: result.pumpTradePreview,
      limitOrderPreview: result.limitOrderPreview,
      evmSwapProposal: result.evmSwapProposal,
      ...(result.evmAssetAuthorizationReview ? { evmAssetAuthorizationReview: result.evmAssetAuthorizationReview } : {}),
      bridgeProposal: result.bridgeProposal,
      bridgePreflight: result.bridgePreflight,
      evmBridgePreparation: result.evmBridgePreparation,
      dcaSetup: result.dcaSetup,
      exitSetup: result.exitSetup,
    });
  });

  ipcMain.handle(IPC_CHANNELS.pumpLaunchDraft, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PumpLaunchDraftRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    if (
      sessionRecord === null
      || sessionRecord.walletScope !== "solana"
      || sessionRecord.walletAddress === null
      || sessionRecord.walletAddress !== request.input.creatorWallet
    ) {
      throw new Error("A Solana wallet workspace for the selected creator is required");
    }
    const draft = createPumpLaunchDraft(request.input);
    return PumpLaunchDraftResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      draft,
    });
  });

  ipcMain.handle(IPC_CHANNELS.pumpLaunchPreflight, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PumpLaunchPreflightRequestSchema.parse(raw);
    requireUnlocked();
    emergencyStop.assertExecutionAllowed();
    const sessionRecord = await sessions.get(request.sessionId);
    if (
      sessionRecord === null
      || sessionRecord.walletScope !== "solana"
      || sessionRecord.walletAddress === null
    ) {
      throw new Error("A Solana wallet workspace is required for Token Launch preflight");
    }
    const messageIndex = sessionRecord.messages.findIndex(
      (message) => message.pumpLaunchDraft?.id === request.draftId,
    );
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    const draft = message?.pumpLaunchDraft;
    if (draft === undefined || draft.creatorWallet !== sessionRecord.walletAddress) {
      throw new Error("The selected Token Launch draft is unavailable");
    }
    const metadataUri = draft.metadata.metadataUri;
    if (metadataUri === null || metadataUri === undefined) {
      throw new Error("Publish or provide the public metadata URI before preflight");
    }
    const preflight = await pumpLaunchPreflight.prepare({ draft, metadataUri });
    const messages = sessionRecord.messages.map((entry, index) => index === messageIndex
      ? { ...entry, pumpLaunchPreflight: preflight }
      : entry);
    await sessions.upsert({ ...sessionRecord, messages });
    return PumpLaunchPreflightResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      preflight,
    });
  });

  ipcMain.handle(IPC_CHANNELS.pumpLaunchFinalRevalidate, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PumpLaunchFinalRevalidateRequestSchema.parse(raw);
    requireUnlocked();
    emergencyStop.assertExecutionAllowed();
    const sessionRecord = await sessions.get(request.sessionId);
    if (
      sessionRecord === null
      || sessionRecord.walletScope !== "solana"
      || sessionRecord.walletAddress === null
    ) {
      throw new Error("A Solana wallet workspace is required for final Token Launch review");
    }
    const messageIndex = sessionRecord.messages.findIndex(
      (message) => message.pumpLaunchDraft?.id === request.draftId,
    );
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    const draft = message?.pumpLaunchDraft;
    if (
      draft === undefined
      || draft.creatorWallet !== sessionRecord.walletAddress
      || message?.pumpLaunchPreflight?.id !== request.preflightId
    ) {
      throw new Error("The exact reviewed Token Launch preflight is unavailable");
    }
    if (message.pumpLaunchExecution !== undefined) {
      throw new Error("This Token Launch draft already has a signed execution receipt");
    }
    const revalidation = await pumpLaunchPreflight.finalRevalidate({
      draft,
      preflightId: request.preflightId,
    });
    const messages = sessionRecord.messages.map((entry, index) => index === messageIndex
      ? { ...entry, pumpLaunchFinalRevalidation: revalidation }
      : entry);
    await sessions.upsert({ ...sessionRecord, messages });
    return PumpLaunchFinalRevalidateResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      revalidation,
    });
  });

  ipcMain.handle(IPC_CHANNELS.pumpLaunchExecute, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PumpLaunchExecuteRequestSchema.parse(raw);
    requireUnlocked();
    emergencyStop.assertExecutionAllowed();
    if (!(await passwords.verify(request.masterPassword))) {
      throw new Error("Master password is incorrect");
    }
    const sessionRecord = await sessions.get(request.sessionId);
    if (
      sessionRecord === null
      || sessionRecord.walletScope !== "solana"
      || sessionRecord.walletAddress === null
    ) {
      throw new Error("A Solana wallet workspace is required for Token Launch execution");
    }
    const messageIndex = sessionRecord.messages.findIndex(
      (message) => message.pumpLaunchDraft?.id === request.draftId,
    );
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    const existing = message?.pumpLaunchExecution;
    if (existing !== undefined) {
      return PumpLaunchExecuteResponseSchema.parse({
        schemaVersion: 1,
        requestId: request.requestId,
        execution: existing,
      });
    }
    const revalidation = message?.pumpLaunchFinalRevalidation;
    if (
      message?.pumpLaunchDraft?.creatorWallet !== sessionRecord.walletAddress
      || message.pumpLaunchPreflight?.id !== request.preflightId
      || revalidation?.id !== request.revalidationId
      || revalidation.status !== "ready-for-password"
    ) {
      throw new Error("The exact final Token Launch approval is unavailable or blocked");
    }
    const signed = await wallets.withWalletSigner(
      sessionRecord.walletAddress,
      (walletSigner) => pumpLaunchPreflight.signPrepared({
        revalidationId: request.revalidationId,
        walletSigner,
      }),
    );
    await persistPumpLaunchExecution(request.sessionId, messageIndex, signed.execution);

    let execution = markPumpLaunchBroadcastUnknown(
      signed.execution,
      "Broadcast submitted; confirmation is pending.",
    );
    await persistPumpLaunchExecution(request.sessionId, messageIndex, execution);
    try {
      const rpcSignature = await pumpRpc.sendTransaction(signed.signedTransactionBase64, {
        encoding: "base64",
        skipPreflight: false,
        maxRetries: 0,
      });
      if (rpcSignature !== execution.signature) {
        throw new Error("RPC returned a different transaction signature");
      }
      execution = markPumpLaunchBroadcastUnknown(execution, null);
      await persistPumpLaunchExecution(request.sessionId, messageIndex, execution);
      try {
        execution = await reconcilePumpLaunchExecution(execution);
        await persistPumpLaunchExecution(request.sessionId, messageIndex, execution);
      } catch {
        // The encrypted signature is sufficient for a later recovery pass.
      }
    } catch (error) {
      // A transport failure after sendTransaction starts is an unknown
      // broadcast, not proof of failure. Never rebroadcast this signature.
      execution = markPumpLaunchBroadcastUnknown(
        execution,
        error instanceof Error ? error.message : "Token launch broadcast status is unknown",
      );
      await persistPumpLaunchExecution(request.sessionId, messageIndex, execution);
    }
    return PumpLaunchExecuteResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      execution,
    });
  });

  ipcMain.handle(IPC_CHANNELS.pumpLaunchVerifyExecution, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PumpLaunchVerifyExecutionRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    const messageIndex = sessionRecord?.messages.findIndex(
      (message) => message.pumpLaunchDraft?.id === request.draftId,
    ) ?? -1;
    const execution = messageIndex < 0
      ? undefined
      : sessionRecord?.messages[messageIndex]?.pumpLaunchExecution;
    if (execution === undefined || execution.id !== request.executionId) {
      throw new Error("The Token Launch execution receipt is unavailable");
    }
    const verified = execution.status === "finalized" || execution.status === "failed"
      ? execution
      : await reconcilePumpLaunchExecution(execution);
    await persistPumpLaunchExecution(request.sessionId, messageIndex, verified);
    return PumpLaunchVerifyExecutionResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      execution: verified,
    });
  });

  ipcMain.handle(IPC_CHANNELS.pumpSimulate, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PumpSimulateRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null || sessionRecord.workspace !== "pump" || sessionRecord.permission !== "restricted" || sessionRecord.walletAddress === null) {
      throw new Error("Restricted Pump session context is unavailable");
    }
    const messageIndex = sessionRecord.messages.findIndex((message) => message.pumpTradePreview?.id === request.previewId);
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    const preview = message?.pumpTradePreview;
    if (preview === undefined || preview.status !== "ready-for-review" || preview.lifecycle !== "proposal-only") {
      throw new Error("A ready Pump proposal is required for simulation");
    }
    if (preview.walletAddress !== sessionRecord.walletAddress || preview.tokenMint !== sessionRecord.pumpConfig?.tokenMint) {
      throw new Error("Pump proposal does not match the encrypted session scope");
    }
    if (preview.venue !== "bonding-curve-active" && preview.venue !== "pumpswap-migrated") {
      throw new Error("Only an active verified Pump curve or canonical PumpSwap pool can use this simulator");
    }
    const settings = transactionSettings.get();
    const pumpRisk = pumpRiskSettings.get();
    const usage = await pumpRiskLedger.usageFor(preview.tokenMint);
    const balance = await pumpRpc.getBalanceAndContext(preview.walletAddress, { commitment: "finalized" });
    const riskEvidence = assertPumpProposalWithinRisk({
      side: preview.side,
      inputAmount: preview.inputAmount,
      maxSlippageBps: preview.maxSlippageBps,
      walletSolLamports: balance.value,
      maxNetworkFeeLamports: settings.maxNetworkFeeLamports,
      settings: pumpRisk,
      usage,
    });
    const buildInput: PumpV2ProductionSimulationInput | PumpSwapProductionSimulationInput = {
      side: preview.side,
      walletAddress: preview.walletAddress,
      tokenMint: preview.tokenMint,
      inputAmount: preview.inputAmount,
      minimumOutputAmount: preview.minimumOutputAmount,
      maxTotalFeeBps: pumpRisk.maxTradingFeeBps,
      maxSlippageBps: preview.maxSlippageBps,
      maxNetworkFeeLamports: settings.maxNetworkFeeLamports,
      maxFeePercent: settings.maxFeePercent,
    };
    const build = preview.venue === "pumpswap-migrated"
      ? await buildAndSimulatePumpSwapProductionTransaction(pumpRpc, buildInput)
      : await buildAndSimulatePumpV2ProductionTransaction(pumpRpc, buildInput);
    const eligibilityEvidence = evaluatePumpTradeEligibility({
      venue: preview.venue,
      side: preview.side,
      tokenMint: preview.tokenMint,
      inputAmount: preview.inputAmount,
      state: build.codec === "silfable-pumpswap"
        ? pumpSwapEvidenceForPolicy(build.stateEvidence)
        : build.stateEvidence,
      fee: build.feePreview,
      quote: build.executableQuote,
      risk: riskEvidence,
      simulation: build.simulation,
    });
    const simulationEvidence = PumpSimulationArtifactSchema.parse({ ...build.simulation, riskEvidence, eligibilityEvidence });
    const executionReadiness = evaluatePumpExecutionReadiness({
      sessionWalletAddress: sessionRecord.walletAddress,
      sessionTokenMint: sessionRecord.pumpConfig!.tokenMint!,
      preview,
      simulation: simulationEvidence,
    });
    const simulation = PumpSimulationArtifactSchema.parse({ ...simulationEvidence, executionReadiness });
    if (executionReadiness.status === "ready-for-final-approval") {
      preparedPump.prepare({ sessionId: sessionRecord.id, preview, production: build, simulation, buildInput });
    }
    const messages = sessionRecord.messages.map((entry, index) => index === messageIndex
      ? { ...entry, pumpSimulation: simulation }
      : entry);
    await sessions.upsert({ ...sessionRecord, messages });
    return PumpSimulateResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      simulation,
    });
  });

  ipcMain.handle(IPC_CHANNELS.pumpFinalRevalidate, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PumpFinalRevalidateRequestSchema.parse(raw);
    requireUnlocked();
    emergencyStop.assertExecutionAllowed();
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null || sessionRecord.workspace !== "pump" || sessionRecord.permission !== "restricted" || sessionRecord.walletAddress === null) {
      throw new Error("Restricted Pump session context is unavailable");
    }
    const messageIndex = sessionRecord.messages.findIndex((message) => message.pumpTradePreview?.id === request.previewId);
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    const preview = message?.pumpTradePreview;
    const initialSimulation = message?.pumpSimulation;
    if (preview === undefined || initialSimulation?.executionReadiness?.status !== "ready-for-final-approval") {
      throw new Error("A passed Pump unsigned simulation is required before final revalidation");
    }
    if (preview.venue !== "bonding-curve-active" && preview.venue !== "pumpswap-migrated") {
      throw new Error("The approved Pump venue is not executable");
    }
    if (preview.walletAddress !== sessionRecord.walletAddress || preview.tokenMint !== sessionRecord.pumpConfig?.tokenMint) {
      throw new Error("Pump proposal does not match the encrypted session scope");
    }
    const prepared = preparedPump.consume({ sessionId: sessionRecord.id, preview });
    const settings = transactionSettings.get();
    const pumpRisk = pumpRiskSettings.get();
    const usage = await pumpRiskLedger.usageFor(preview.tokenMint);
    const balance = await pumpRpc.getBalanceAndContext(preview.walletAddress, { commitment: "finalized" });
    const riskEvidence = assertPumpProposalWithinRisk({
      side: preview.side,
      inputAmount: preview.inputAmount,
      maxSlippageBps: preview.maxSlippageBps,
      walletSolLamports: balance.value,
      maxNetworkFeeLamports: settings.maxNetworkFeeLamports,
      settings: pumpRisk,
      usage,
    });
    const build = preview.venue === "pumpswap-migrated"
      ? await buildAndSimulatePumpSwapProductionTransaction(pumpRpc, prepared.input)
      : await buildAndSimulatePumpV2ProductionTransaction(pumpRpc, prepared.input);
    const eligibilityEvidence = evaluatePumpTradeEligibility({
      venue: preview.venue,
      side: preview.side,
      tokenMint: preview.tokenMint,
      inputAmount: preview.inputAmount,
      state: build.codec === "silfable-pumpswap"
        ? pumpSwapEvidenceForPolicy(build.stateEvidence)
        : build.stateEvidence,
      fee: build.feePreview,
      quote: build.executableQuote,
      risk: riskEvidence,
      simulation: build.simulation,
    });
    const freshSimulation = PumpSimulationArtifactSchema.parse({ ...build.simulation, riskEvidence, eligibilityEvidence });
    const finalRevalidation = evaluatePumpFinalRevalidation({ prepared, preview, production: build, simulation: freshSimulation, risk: riskEvidence });
    if (finalRevalidation.status === "ready-for-password") {
      preparedPump.prepareFinal({
        sessionId: sessionRecord.id,
        preview,
        production: build,
        revalidation: finalRevalidation,
      });
    }
    const simulation = PumpSimulationArtifactSchema.parse({ ...freshSimulation, executionReadiness: initialSimulation.executionReadiness, finalRevalidation });
    const messages = sessionRecord.messages.map((entry, index) => index === messageIndex ? { ...entry, pumpSimulation: simulation } : entry);
    await sessions.upsert({ ...sessionRecord, messages });
    return PumpFinalRevalidateResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, simulation });
  });

  ipcMain.handle(IPC_CHANNELS.pumpExecute, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PumpExecuteRequestSchema.parse(raw);
    requireUnlocked();
    emergencyStop.assertExecutionAllowed();
    if (!(await passwords.verify(request.masterPassword))) {
      throw new Error("Master password is incorrect");
    }
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null || sessionRecord.workspace !== "pump" || sessionRecord.permission !== "restricted" || sessionRecord.walletAddress === null) {
      throw new Error("Restricted Pump session context is unavailable");
    }
    const messageIndex = sessionRecord.messages.findIndex((message) => message.pumpTradePreview?.id === request.previewId);
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    const preview = message?.pumpTradePreview;
    const revalidation = message?.pumpSimulation?.finalRevalidation;
    if (preview === undefined || revalidation?.status !== "ready-for-password") {
      throw new Error("A fresh passed Pump final revalidation is required");
    }
    if (message?.pumpExecution !== undefined) {
      return PumpExecuteResponseSchema.parse({
        schemaVersion: 1,
        requestId: request.requestId,
        execution: message.pumpExecution,
      });
    }
    if (preview.walletAddress !== sessionRecord.walletAddress || preview.tokenMint !== sessionRecord.pumpConfig?.tokenMint) {
      throw new Error("Pump proposal does not match the encrypted session scope");
    }
    const prepared = preparedPump.consumeFinal({
      sessionId: sessionRecord.id,
      preview,
      expectedDigest: revalidation.finalTransactionDigest,
    });
    const signed = await wallets.withWalletWeb3Keypair(preview.walletAddress, async (keypair) =>
      createSignedPumpExecution({
        preview,
        production: prepared.production,
        revalidation: prepared.revalidation,
        keypair,
      }));

    // Persist the locally derived signature before entering the network call.
    // A restart can therefore verify the signature without ever rebroadcasting.
    await persistPumpExecution(sessionRecord.id, messageIndex, signed.execution);
    let execution = markPumpBroadcastUnknown(
      signed.execution,
      "Broadcast is in progress. Silfable will verify this signature and will not submit it twice.",
    );
    await persistPumpExecution(sessionRecord.id, messageIndex, execution);
    try {
      const broadcast = await broadcastPumpTransaction({
        signedTransaction: signed.transaction,
        rpc: pumpRpc,
      });
      if (broadcast.signature !== execution.signature) {
        execution = markPumpBroadcastUnknown(
          execution,
          "The RPC returned a different signature. Silfable will verify the locally derived signature and will not rebroadcast.",
        );
      } else {
        execution = markPumpBroadcastUnknown(execution, null);
      }
    } catch (error) {
      execution = markPumpBroadcastUnknown(
        execution,
        error instanceof Error ? error.message : "Pump broadcast status is unknown",
      );
    }
    await persistPumpExecution(sessionRecord.id, messageIndex, execution);
    try {
      execution = await reconcilePumpExecution(preview, execution);
      await persistPumpExecution(sessionRecord.id, messageIndex, execution);
    } catch {
      // A read failure cannot prove execution failure. Keep the signature in
      // broadcast-unknown state and expose an explicit verify action.
    }
    return PumpExecuteResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      execution,
    });
  });

  ipcMain.handle(IPC_CHANNELS.pumpVerifyExecution, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PumpVerifyExecutionRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    const messageIndex = sessionRecord?.messages.findIndex((message) =>
      message.pumpTradePreview?.id === request.previewId
      && message.pumpExecution?.id === request.executionId) ?? -1;
    const message = messageIndex < 0 ? undefined : sessionRecord?.messages[messageIndex];
    if (sessionRecord === null || sessionRecord === undefined || message?.pumpTradePreview === undefined || message.pumpExecution === undefined) {
      throw new Error("Pump execution record is unavailable in encrypted session history");
    }
    let execution = message.pumpExecution;
    if (execution.status !== "finalized" && execution.status !== "failed") {
      try {
        execution = await reconcilePumpExecution(message.pumpTradePreview, execution);
      } catch (error) {
        // Verification is a read-only recovery path. A provider timeout cannot
        // prove success or failure and must never cause a second broadcast.
        execution = markPumpBroadcastUnknown(
          execution,
          error instanceof Error ? error.message : "Pump verification is temporarily unavailable",
        );
      }
    }
    await persistPumpExecution(sessionRecord.id, messageIndex, execution);
    return PumpVerifyExecutionResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      execution,
    });
  });

  ipcMain.handle(IPC_CHANNELS.pumpRiskSettingsGet, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    return PumpRiskSettingsResponseSchema.parse({ schemaVersion: 1, settings: pumpRiskSettings.get() });
  });

  ipcMain.handle(IPC_CHANNELS.pumpRiskSettingsSave, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PumpRiskSettingsSaveRequestSchema.parse(raw);
    requireUnlocked();
    return PumpRiskSettingsMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, settings: pumpRiskSettings.save(request.settings) });
  });

  ipcMain.handle(IPC_CHANNELS.missionSimulate, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = MissionSimulateRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    const mission = sessionRecord?.messages.find((message) => message.missionPreview?.id === request.missionId)?.missionPreview;
    if (!mission) throw new Error("Mission contract is unavailable in encrypted session history");
    const simulation = await simulations.simulate(
      mission,
      withSessionSafetyOverrides(transactionSettings.get(), sessionRecord?.safetyOverrides),
    );
    return MissionSimulateResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, simulation });
  });

  ipcMain.handle(IPC_CHANNELS.limitOrderSimulate, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = LimitOrderSimulateRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    const preview = sessionRecord?.messages.find((message) => message.limitOrderPreview?.id === request.previewId)?.limitOrderPreview;
    if (!preview) throw new Error("Limit-order contract is unavailable in encrypted session history");
    const simulation = await limitOrders.simulate(preview);
    return LimitOrderSimulateResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, simulation });
  });

  ipcMain.handle(IPC_CHANNELS.limitOrderExecute, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = LimitOrderExecuteRequestSchema.parse(raw);
    requireUnlocked();
    emergencyStop.assertExecutionAllowed();
    if (!(await passwords.verify(request.masterPassword))) throw new Error("Master password is incorrect");
    const sessionRecord = await sessions.get(request.sessionId);
    if (!sessionRecord) throw new Error("Session is unavailable");
    const message = sessionRecord.messages.find((candidate) => candidate.limitOrderPreview?.id === request.previewId);
    if (!message?.limitOrderPreview || message.limitOrderSimulation?.id !== request.simulationId || message.limitOrderSimulation.status !== "passed") throw new Error("A matching passed limit-order simulation is required");
    if (message.limitOrderExecution !== undefined) throw new Error("This limit order has already been submitted");
    const receipt = await limitOrders.execute(message.limitOrderPreview, request.simulationId);
    const messages = sessionRecord.messages.map((entry) =>
      entry.id === message.id ? { ...entry, limitOrderExecution: receipt } : entry,
    );
    await sessions.upsert({ ...sessionRecord, messages });
    return LimitOrderExecuteResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, receipt });
  });

  ipcMain.handle(IPC_CHANNELS.limitOrderList, async (event, raw: unknown) => {
    assertTrustedSender(event); const request = LimitOrderListRequestSchema.parse(raw); requireUnlocked();
    const registered = (await wallets.listWallets()).some((wallet) => wallet.address === request.walletAddress);
    if (!registered) throw new Error("Wallet is unavailable in the encrypted local vault");
    return LimitOrderListResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, orders: await limitOrders.list(request.walletAddress, request.state) });
  });

  ipcMain.handle(IPC_CHANNELS.limitOrderCancelSimulate, async (event, raw: unknown) => {
    assertTrustedSender(event); const request = LimitOrderCancelSimulateRequestSchema.parse(raw); requireUnlocked();
    const simulation = await limitOrders.simulateCancel(request.walletAddress, request.orderId);
    return LimitOrderCancelSimulateResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, simulation });
  });

  ipcMain.handle(IPC_CHANNELS.limitOrderCancelExecute, async (event, raw: unknown) => {
    assertTrustedSender(event); const request = LimitOrderCancelExecuteRequestSchema.parse(raw); requireUnlocked();
    emergencyStop.assertExecutionAllowed();
    if (!(await passwords.verify(request.masterPassword))) throw new Error("Master password is incorrect");
    const sessionRecord = await sessions.get(request.sessionId);
    if (!sessionRecord) throw new Error("Session is unavailable");
    const message = sessionRecord.messages.find((candidate) =>
      candidate.limitOrderExecution?.orderId === request.orderId &&
      candidate.limitOrderCancelSimulation?.id === request.simulationId,
    );
    if (!message?.limitOrderCancelSimulation || message.limitOrderCancelSimulation.status !== "passed") {
      throw new Error("A matching passed limit-order cancellation simulation is required");
    }
    if (message.limitOrderCancelReceipt !== undefined) throw new Error("This limit order cancellation has already been submitted");
    const receipt = await limitOrders.executeCancel(request.walletAddress, request.orderId, request.simulationId);
    const messages = sessionRecord.messages.map((entry) =>
      entry.id === message.id ? { ...entry, limitOrderCancelReceipt: receipt } : entry,
    );
    await sessions.upsert({ ...sessionRecord, messages });
    return LimitOrderCancelExecuteResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, receipt });
  });

  ipcMain.handle(IPC_CHANNELS.limitOrderVerifyExecution, async (event, raw: unknown) => {
    assertTrustedSender(event); const request = LimitOrderVerifyExecutionRequestSchema.parse(raw); requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null) throw new Error("Encrypted session context is unavailable");
    const messageIndex = sessionRecord.messages.findIndex((message) => message.limitOrderPreview?.id === request.previewId && message.limitOrderExecution?.id === request.receiptId);
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    if (message?.limitOrderExecution === undefined) throw new Error("Execution receipt is unavailable in encrypted session history");
    const receipt = await limitOrders.verifyExecutionReceipt(message.limitOrderExecution);
    const messages = sessionRecord.messages.map((entry, index) => index === messageIndex ? { ...entry, limitOrderExecution: receipt } : entry);
    await sessions.upsert({ ...sessionRecord, messages });
    return LimitOrderVerifyExecutionResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, receipt });
  });

  ipcMain.handle(IPC_CHANNELS.limitOrderVerifyCancel, async (event, raw: unknown) => {
    assertTrustedSender(event); const request = LimitOrderVerifyCancelRequestSchema.parse(raw); requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null) throw new Error("Encrypted session context is unavailable");
    const messageIndex = sessionRecord.messages.findIndex((message) => message.limitOrderCancelReceipt?.orderId === request.orderId && message.limitOrderCancelReceipt?.id === request.receiptId);
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    if (message?.limitOrderCancelReceipt === undefined) throw new Error("Cancellation receipt is unavailable in encrypted session history");
    const receipt = await limitOrders.verifyCancelReceipt(message.limitOrderCancelReceipt);
    const messages = sessionRecord.messages.map((entry, index) => index === messageIndex ? { ...entry, limitOrderCancelReceipt: receipt } : entry);
    await sessions.upsert({ ...sessionRecord, messages });
    return LimitOrderVerifyCancelResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, receipt });
  });

  ipcMain.handle(IPC_CHANNELS.missionExecute, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = MissionExecuteRequestSchema.parse(raw);
    requireUnlocked();
    emergencyStop.assertExecutionAllowed();
    if (!(await passwords.verify(request.masterPassword))) throw new Error("Master password is incorrect");
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null
      || (sessionRecord.permission !== "restricted" && sessionRecord.permission !== "full")) {
      throw new Error("Guarded Mainnet session context is unavailable");
    }
    const messageIndex = sessionRecord.messages.findIndex((message) => message.missionPreview?.id === request.missionId);
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    const mission = message?.missionPreview;
    if (!mission || message?.missionSimulation?.id !== request.simulationId || message.missionSimulation.status !== "passed") throw new Error("A matching passed simulation is required");
    if (message.missionExecution !== undefined) throw new Error("This mission transaction has already been submitted");
    const receipt = await simulations.execute(mission, request.simulationId);
    const messages = sessionRecord.messages.map((entry, index) => index === messageIndex ? { ...entry, missionExecution: receipt } : entry);
    await sessions.upsert({ ...sessionRecord, messages });
    return MissionExecuteResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, receipt });
  });

  ipcMain.handle(IPC_CHANNELS.pumpLaunchManagedMetadataPublish, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = PumpLaunchManagedMetadataPublishRequestSchema.parse(raw);
    requireUnlocked();
    const registered = (await wallets.listWallets()).some(
      (wallet) => wallet.address === request.creatorWallet,
    );
    if (!registered) {
      throw new Error("Managed Pinata uploads require a wallet registered in the encrypted vault");
    }
    const response = await managedLaunchMetadata.publish(request);
    return PumpLaunchManagedMetadataPublishResponseSchema.parse(response);
  });

  ipcMain.handle(IPC_CHANNELS.missionExecuteFullAccess, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = MissionFullAccessExecuteRequestSchema.parse(raw);
    requireUnlocked();
    emergencyStop.assertExecutionAllowed();
    localSigningSession.assertActive();
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null || sessionRecord.permission !== "full" || sessionRecord.walletScope !== "solana") {
      throw new Error("An active Full Access Solana session is required");
    }
    const messageIndex = sessionRecord.messages.findIndex((message) => message.missionPreview?.id === request.missionId);
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    const mission = message?.missionPreview;
    if (!mission || message?.missionSimulation?.id !== request.simulationId || message.missionSimulation.status !== "passed") throw new Error("A matching passed simulation is required");
    if (message.missionExecution !== undefined) throw new Error("This mission transaction has already been submitted");
    const receipt = await simulations.execute(mission, request.simulationId);
    const messages = sessionRecord.messages.map((entry, index) => index === messageIndex ? { ...entry, missionExecution: receipt } : entry);
    await sessions.upsert({ ...sessionRecord, messages });
    return MissionExecuteResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, receipt });
  });

  ipcMain.handle(IPC_CHANNELS.missionVerifyExecution, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = MissionVerifyExecutionRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null) throw new Error("Encrypted session context is unavailable");
    const messageIndex = sessionRecord.messages.findIndex((message) => message.missionPreview?.id === request.missionId && message.missionExecution?.id === request.receiptId);
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    if (message?.missionExecution === undefined) throw new Error("Execution receipt is unavailable in encrypted session history");
    const receipt = await simulations.verifyReceipt(message.missionExecution);
    const messages = sessionRecord.messages.map((entry, index) => index === messageIndex ? { ...entry, missionExecution: receipt } : entry);
    await sessions.upsert({ ...sessionRecord, messages });
    return MissionVerifyExecutionResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, receipt });
  });

  ipcMain.handle(IPC_CHANNELS.transactionSettingsGet, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    return TransactionSettingsResponseSchema.parse({ schemaVersion: 1, settings: transactionSettings.get() });
  });

  ipcMain.handle(IPC_CHANNELS.transactionSettingsSave, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = TransactionSettingsSaveRequestSchema.parse(raw);
    requireUnlocked();
    return TransactionSettingsMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, settings: transactionSettings.save(request.settings) });
  });

  ipcMain.handle(IPC_CHANNELS.bridgePrepare, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = BridgePrepareRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    if (
      sessionRecord === null
      || sessionRecord.walletScope !== "solana"
      || sessionRecord.walletAddress !== request.contract.sourceWallet
    ) {
      throw new Error("The Bridge source wallet does not match this encrypted Solana session.");
    }
    if (sessionRecord.messages.some((message) => message.bridgeProposal?.contract.id === request.contract.id)) {
      throw new Error("This Bridge contract is already stored in the session. Prepare a fresh contract instead.");
    }
    const prepared = await bridge.prepare(request.contract);
    await sessions.upsert({
      ...sessionRecord,
      messages: [...sessionRecord.messages, {
        id: crypto.randomUUID(),
        role: "assistant",
        at: new Date().toISOString(),
        text: `A restricted ${prepared.proposal.quote.provider} route from Solana USDC to ${resolveEnabledBridgeRoute(prepared.proposal.contract).destination.chainKey} ${resolveEnabledBridgeRoute(prepared.proposal.contract).destination.symbol} passed unsigned Mainnet simulation. Review the exact recipient, fees, minimum output, and expiry before final approval.`,
        bridgeProposal: prepared.proposal,
        bridgePreflight: prepared.preflight,
      }],
    });
    return BridgePrepareResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      ...prepared,
    });
  });

  ipcMain.handle(IPC_CHANNELS.bridgeGetStatus, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = BridgeGetStatusRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    const bridgeMessage = sessionRecord?.messages.find((message) =>
      message.bridgeProposal?.quote.orderId === request.orderId
      || message.bridgeReceipt?.orderId === request.orderId
    );
    if (bridgeMessage === undefined) throw new Error("This Bridge order is not available in the encrypted session.");
    const provider = bridgeMessage.bridgeReceipt?.provider ?? bridgeMessage.bridgeProposal?.quote.provider ?? "debridge-dln";
    const status = await bridge.status(request.orderId, provider);
    return BridgeGetStatusResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      ...status,
    });
  });

  ipcMain.handle(IPC_CHANNELS.bridgeExecute, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = BridgeExecuteRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null || (sessionRecord.permission !== "restricted" && sessionRecord.permission !== "full")) {
      throw new Error("An encrypted Solana session is required for Bridge execution.");
    }
    const fullAccess = sessionRecord.permission === "full";
    if (fullAccess) localSigningSession.assertActive();
    const messageIndex = sessionRecord.messages.findIndex((message) =>
      message.bridgeProposal?.contract.id === request.contractId
      && message.bridgePreflight?.id === request.preflightId
    );
    const message = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex];
    if (message?.bridgeProposal === undefined || message.bridgePreflight === undefined) {
      throw new Error("A matching Bridge proposal and unsigned preflight are required.");
    }
    if (message.bridgeReceipt !== undefined) {
      throw new Error("This Bridge route already has a signed receipt. Reconcile it; never submit it again.");
    }
    const bridgeRoute = resolveEnabledBridgeRoute(message.bridgeProposal.contract);
    const controlledAcceptance = isControlledBridgeAcceptanceCandidate(
      message.bridgeProposal.contract,
      message.bridgeProposal.quote.provider,
      message.bridgeProposal.quote.fee.totalFeeUsd,
    );
    const requiredConfirmation = controlledAcceptance
      ? CONTROLLED_BRIDGE_ACCEPTANCE_CONFIRMATION
      : bridgeRoute.confirmation;
    if (request.confirmation !== requiredConfirmation) {
      throw new Error(`Type ${requiredConfirmation} to authorize this exact destination route.`);
    }
    const persistReceipt = async (receipt: BridgeReceipt): Promise<void> =>
      persistBridgeReceipt(request.sessionId, receipt);
    const receipt = await bridge.execute(
      request.contractId,
      request.preflightId,
      request.masterPassword,
      persistReceipt,
      fullAccess,
    );
    await persistReceipt(receipt);
    return BridgeExecuteResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, receipt });
  });

  ipcMain.handle(IPC_CHANNELS.bridgeReconcile, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = BridgeReconcileRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    if (sessionRecord === null) throw new Error("Encrypted Bridge session is unavailable.");
    const messageIndex = sessionRecord.messages.findIndex((message) => message.bridgeReceipt?.id === request.receiptId);
    const receipt = messageIndex < 0 ? undefined : sessionRecord.messages[messageIndex]?.bridgeReceipt;
    if (receipt === undefined) throw new Error("Bridge receipt is unavailable in encrypted session history.");
    const reconciled = await bridge.reconcile(receipt);
    await persistBridgeReceipt(request.sessionId, reconciled);
    return BridgeReconcileResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      receipt: reconciled,
    });
  });



  ipcMain.handle(IPC_CHANNELS.jupiterGetSettings, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    return JupiterSettingsResponseSchema.parse({ schemaVersion: 1, configured: (await secretStore.getSecret("jupiter-api-key")) !== null });
  });

  ipcMain.handle(IPC_CHANNELS.jupiterSaveKey, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = JupiterSaveKeyRequestSchema.parse(raw);
    requireUnlocked();
    await secretStore.setSecret("jupiter-api-key", request.apiKey);
    return JupiterKeyMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, configured: true });
  });

  ipcMain.handle(IPC_CHANNELS.uniswapGetSettings, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    return UniswapSettingsResponseSchema.parse({
      schemaVersion: 1,
      configured: (await secretStore.getSecret("uniswap-api-key")) !== null,
      chainId: 4_663,
      routerAddress: ROBINHOOD_UNIVERSAL_ROUTER,
      routerVersion: ROBINHOOD_UNIVERSAL_ROUTER_VERSION,
    });
  });

  ipcMain.handle(IPC_CHANNELS.uniswapSaveKey, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = UniswapSaveKeyRequestSchema.parse(raw);
    requireUnlocked();
    await secretStore.setSecret("uniswap-api-key", request.apiKey);
    return UniswapKeyMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, configured: true });
  });

  ipcMain.handle(IPC_CHANNELS.uniswapTestKey, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = UniswapTestKeyRequestSchema.parse(raw);
    requireUnlocked();
    await uniswapQuotes.testAccess();
    return UniswapTestKeyResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      chainId: 4_663,
      routerAddress: ROBINHOOD_UNIVERSAL_ROUTER,
      routerVersion: ROBINHOOD_UNIVERSAL_ROUTER_VERSION,
    });
  });

  ipcMain.handle(IPC_CHANNELS.tavilyGetSettings, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    return TavilySettingsResponseSchema.parse({ schemaVersion: 1, configured: (await secretStore.getSecret("tavily-api-key")) !== null });
  });

  ipcMain.handle(IPC_CHANNELS.tavilySaveKey, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = TavilySaveKeyRequestSchema.parse(raw);
    requireUnlocked();
    await secretStore.setSecret("tavily-api-key", request.apiKey);
    return TavilyKeyMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, configured: true });
  });

  ipcMain.handle(IPC_CHANNELS.solanaRpcGetSettings, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    const stored = database.getSetting("solana_rpc_url") as string | null;
    return SolanaRpcSettingsResponseSchema.parse({ schemaVersion: 1, rpcUrl: stored ?? null });
  });

  ipcMain.handle(IPC_CHANNELS.solanaRpcSaveUrl, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = SolanaRpcSaveUrlRequestSchema.parse(raw);
    requireUnlocked();
    if (request.rpcUrl) {
      database.setSetting("solana_rpc_url", request.rpcUrl);
    } else {
      database.deleteSetting("solana_rpc_url");
    }
    const nextUrl = request.rpcUrl ?? undefined;
    reads.updateRpcUrl(nextUrl);
    pumpRpc.updateRpcUrl(nextUrl);
    return SolanaRpcMutationResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, rpcUrl: request.rpcUrl });
  });

  ipcMain.handle(IPC_CHANNELS.evmGetSettings, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    const chains = await Promise.all(listEvmChains().map(async (chain) => {
      const configured = await secretStore.getSecret(chain.rpcSecretName);
      return {
        chainKey: chain.key,
        chainId: chain.chainId,
        name: chain.name,
        nativeSymbol: chain.nativeSymbol,
        explorerUrl: chain.explorerUrl,
        provider: chain.quoteProvider,
        rpcConfigured: configured !== null,
      };
    }));
    const executionMissing: string[] = [];
    return EvmSettingsResponseSchema.parse({
      schemaVersion: 1,
      chains,
      executionEnabled: executionMissing.length === 0,
      executionMissing,
    });
  });

  ipcMain.handle(IPC_CHANNELS.evmTestRpc, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmSaveRpcUrlRequestSchema.parse(raw);
    requireUnlocked();
    const chain = getEvmChain(request.chainKey);
    await new EvmEngine(request.rpcUrl, chain.chainId).getBlockNumber();
    return EvmTestRpcResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      chainKey: chain.key,
      chainId: chain.chainId,
    });
  });

  ipcMain.handle(IPC_CHANNELS.evmSaveRpcUrl, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmSaveRpcUrlRequestSchema.parse(raw);
    requireUnlocked();
    const chain = getEvmChain(request.chainKey);
    // Validate before persisting so an invalid or wrong-chain endpoint never
    // replaces the verified endpoint used by Bridge settlement reconciliation.
    await new EvmEngine(request.rpcUrl, chain.chainId).getBlockNumber();
    await secretStore.setSecret(chain.rpcSecretName, request.rpcUrl);
    return EvmRpcMutationResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      chainKey: chain.key,
      chainId: chain.chainId,
      configured: true,
    });
  });

  ipcMain.handle(IPC_CHANNELS.runtimeStatus, async (event) => {
    assertTrustedSender(event);
    const hasPassword = passwords.isConfigured();
    const hasWallet = database.hasWallet(MAINNET_PROFILE_ID);
    const onboardingSetting = database.getSetting("onboarding_complete");
    const onboardingComplete = typeof onboardingSetting === "boolean" ? onboardingSetting : (hasPassword && hasWallet);
    const rawSetupState = database.getSetting("setup_state");
    let setupState = null;
    if (rawSetupState && typeof rawSetupState === "object") {
      setupState = rawSetupState;
    }
    return RuntimeStatusSchema.parse({
      appVersion: app.getVersion(),
      profile: MAINNET_PROFILE_ID,
      networkHealth: await reads.health(),
      keystore: secretStore.isLocked() ? "locked" : "unlocked",
      masterPassword: hasPassword ? "configured" : "missing",
      wallet: hasWallet ? "configured" : "none",
      activeMissionCount: 0,
      onboardingComplete,
      setupState,
    });
  });

  ipcMain.handle(IPC_CHANNELS.automationList, async (event) => {
    assertTrustedSender(event);
    const sessionRecords = await sessions.list();
    const strategies = automationManager.listStrategies();
    const resolvedSessionIds = new Map<string, string>();
    for (const strategy of strategies) {
      if (strategy.sessionId !== "session-ai") {
        resolvedSessionIds.set(strategy.id, strategy.sessionId);
        continue;
      }
      const owner = sessionRecords.find((session) =>
        session.messages.some((message) => message.text.includes(strategy.id)),
      );
      if (owner) resolvedSessionIds.set(strategy.id, owner.id);
    }
    const proposals = automationManager.listProposals();
    return AutomationListResponseSchema.parse({
      schemaVersion: 1,
      strategies: strategies.map((strategy) => ({
        ...strategy,
        sessionId: resolvedSessionIds.get(strategy.id) ?? strategy.sessionId,
      })),
      proposals: proposals.map((proposal) => ({
        ...proposal,
        sessionId: resolvedSessionIds.get(proposal.strategyId) ?? proposal.sessionId,
      })),
    });
  });

  ipcMain.handle(IPC_CHANNELS.automationSetStatus, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = AutomationSetStatusRequestSchema.parse(raw);
    let strategy: Record<string, unknown> = {};
    if (request.action === "APPROVE_PROPOSAL") {
      const proposal = automationManager.listProposals().find((p) => p.id === request.id);
      const proposalSession = proposal ? await sessions.get(request.sessionId || proposal.sessionId) : null;
      if (proposalSession?.permission === "full") {
        throw new Error("Full Access automation is dispatched locally; manual proposal approval is unavailable");
      }
      automationManager.approveProposal(request.id);
      if (proposal) {
        const allSessions = await sessions.list();
        const targetSessionId = request.sessionId || proposal.sessionId;
        const sessionRecord =
          allSessions.find((s) => s.id === targetSessionId) ||
          allSessions.find((s) => s.id === proposal.sessionId) ||
          allSessions[0] ||
          null;
        if (sessionRecord) {
          const previewId = crypto.randomUUID();
          const missionPreview: MissionContractPreview = {
            id: previewId,
            status: "ready-for-review",
            goal: `DCA Cycle Execution: Swap USDC to SOL (${proposal.inputAmountRaw} raw units)`,
            walletAddress: sessionRecord.walletAddress ?? "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg",
            inputMint: proposal.inputMint,
            outputMint: proposal.outputMint,
            inputAmount: proposal.inputAmountRaw,
            maxSlippageBps: 200,
            deadlineAt: new Date(Date.now() + 600_000).toISOString(),
            stopConditions: ["DCA cycle proposal approved by user"],
            quote: null,
            checks: [
              { code: "wallet_registered", status: "pass", message: "Selected registered wallet" },
              { code: "token_pair_valid", status: "pass", message: "Verified USDC -> SOL pair" },
              { code: "amount_valid", status: "pass", message: "Order amount within limit" },
              { code: "slippage_within_limit", status: "pass", message: "200 bps max slippage" },
              { code: "deadline_valid", status: "pass", message: "10 minute execution deadline" },
              { code: "balance_sufficient", status: "pass", message: "Wallet balance sufficient" },
              { code: "quote_only", status: "pass", message: "Unsigned simulation required" },
            ],
            executionAllowed: false,
            createdAt: new Date().toISOString(),
          };
          const assistantMessage = {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            text: "The DCA proposal was approved. A mission swap preview card (USDC ➔ SOL) is ready below. Run the simulation (*Simulate*) and confirm the transaction with your master password.",
            at: new Date().toISOString(),
            missionPreview,
          };
          await sessions.upsert({
            ...sessionRecord,
            messages: [...sessionRecord.messages, assistantMessage],
          });
        }
      }
    } else if (request.action === "REJECT_PROPOSAL") {
      automationManager.rejectProposal(request.id);
    } else {
      strategy = automationManager.setStatus(request.id, request.action as "PAUSE" | "RESUME" | "CANCEL");
    }
    return AutomationSetStatusResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      strategy,
    });
  });

  ipcMain.handle(IPC_CHANNELS.emergencyStopGet, async (event) => {
    assertTrustedSender(event);
    return EmergencyStopGetResponseSchema.parse({
      schemaVersion: 1,
      status: emergencyStop.get(),
    });
  });

  // Generic multi-chain KyberSwap path.  The old Robinhood-named renderer
  // aliases call these channels too, but every request is now bound to the
  // session's locked EVM chain instead of silently assuming Robinhood.
  ipcMain.handle(IPC_CHANNELS.evmPrepareKyberSwap, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmPrepareKyberSwapRequestSchema.parse(raw);
    requireUnlocked();
    if (!request.acknowledgedSimulationOnly) throw new Error("Unsigned EVM simulation acknowledgement is required");
    const sessionRecord = await sessions.get(request.sessionId);
    if (
      sessionRecord === null
      || sessionRecord.walletScope !== "evm"
      || sessionRecord.walletAddress?.toLowerCase() !== request.walletAddress.toLowerCase()
      || (sessionRecord.evmChainKey ?? "robinhood") !== request.chainKey
    ) {
      throw new Error("The EVM preflight must use this encrypted session's wallet and chain.");
    }
    const proposalMessage = sessionRecord.messages.find(
      (message) => message.evmSwapProposal?.quoteId === request.quoteId,
    );
    if (proposalMessage?.evmSwapProposal === undefined) {
      throw new Error("The EVM quote is not bound to this encrypted session.");
    }
    if (proposalMessage.evmExecutionReceipts?.some(
      (receipt) => receipt.kind === "swap" && receipt.status === "confirmed",
    )) {
      throw new Error("This EVM swap is already confirmed and cannot be prepared again.");
    }
    if (!(await evmWallet.hasAddress(request.walletAddress))) {
      throw new Error("The selected EVM wallet is not registered in the encrypted local vault.");
    }
    const engine = await evmEngineFor(request.chainKey);
    const preflight = await kyberPreflight.prepare({
      quotes: evmSwapQuotes,
      engine,
      quoteId: request.quoteId,
      // The contracts package deliberately keeps IPC addresses as validated
      // strings. The wallet and EVM services use viem's branded address type.
      // This cast is safe after the request schema's strict 0x-address check.
      wallet: request.walletAddress as `0x${string}`,
      slippageBps: request.slippageBps,
    });
    return EvmPrepareKyberSwapResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      preflight,
    });
  });

  ipcMain.handle(IPC_CHANNELS.evmExecuteKyberSwap, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmExecuteKyberSwapRequestSchema.parse(raw);
    requireUnlocked();
    if (!request.acknowledgedIrreversible) throw new Error("Irreversible EVM Mainnet acknowledgement is required");
    const sessionRecord = await sessions.get(request.sessionId);
    if (
      sessionRecord === null
      || sessionRecord.walletScope !== "evm"
      || sessionRecord.walletAddress?.toLowerCase() !== request.walletAddress.toLowerCase()
      || (sessionRecord.evmChainKey ?? "robinhood") !== request.chainKey
    ) {
      throw new Error("The EVM execution must use this encrypted session's wallet and chain.");
    }
    const receipt = await evmExecutor.execute({
      ...request,
      walletAddress: request.walletAddress as `0x${string}`,
      engine: await evmEngineFor(request.chainKey),
      withSigner: async (operation) => await evmWallet.withSignerForAddress(request.walletAddress as `0x${string}`, operation),
    });
    return EvmExecuteKyberSwapResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, receipt: {
      ...(() => { const { wallet: _w, ...rest } = receipt; return rest; })(),
      walletAddress: receipt.wallet,
    } });
  });

  ipcMain.handle(IPC_CHANNELS.evmExecuteFullAccessKyberSwap, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmExecuteFullAccessKyberSwapRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    if (
      sessionRecord === null
      || sessionRecord.permission !== "full"
      || sessionRecord.walletScope !== "evm"
      || sessionRecord.walletAddress?.toLowerCase() !== request.walletAddress.toLowerCase()
      || sessionRecord.evmChainKey !== "robinhood"
    ) {
      throw new Error("Full Access EVM execution requires this enrolled Robinhood wallet session.");
    }
    localSigningSession.assertActive();
    if (!(await evmWallet.hasAddress(request.walletAddress))) {
      throw new Error("The Full Access Robinhood wallet is not registered in the encrypted local vault.");
    }
    const prepared = kyberPreflight.peek(request.preflightId);
    if (prepared === null) throw new Error("The Full Access EVM preflight is unavailable or expired; prepare a fresh quote.");
    if (prepared.evidence.walletAddress.toLowerCase() !== request.walletAddress.toLowerCase() || prepared.evidence.chainKey !== "robinhood") {
      throw new Error("The Full Access EVM preflight is not bound to this session wallet and chain.");
    }
    fullAccessEvmAssets.assertPairAuthorized(request.sessionId, prepared.evidence.tokenIn, prepared.evidence.tokenOut);
    const receipt = await evmExecutor.executeFullAccess({
      ...request,
      walletAddress: request.walletAddress as `0x${string}`,
      engine: await evmEngineFor("robinhood"),
      withSigner: async (operation) => await evmWallet.withSignerForAddress(request.walletAddress as `0x${string}`, operation),
    });
    return EvmExecuteFullAccessKyberSwapResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      receipt: {
        ...(() => { const { wallet: _w, ...rest } = receipt; return rest; })(),
        walletAddress: receipt.wallet,
      },
    });
  });

  ipcMain.handle(IPC_CHANNELS.evmListReceipts, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    return EvmReceiptsResponseSchema.parse({ schemaVersion: 1, receipts: (await evmReceipts.list()).map((receipt) => ({ ...receipt, walletAddress: receipt.wallet })) });
  });

  ipcMain.handle(IPC_CHANNELS.evmReconcileReceipts, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    const reconciled = await evmReconciliation.reconcilePending(async ({ chainKey }) => await evmEngineFor(chainKey));
    return EvmReconcileReceiptsResponseSchema.parse({ schemaVersion: 1, reconciled: reconciled.map((receipt) => ({ ...receipt, walletAddress: receipt.wallet })) });
  });

  ipcMain.handle(IPC_CHANNELS.evmBridgePrepare, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmBridgePrepareRequestSchema.parse(raw);
    requireUnlocked();
    const sessionRecord = await sessions.get(request.sessionId);
    if (
      sessionRecord === null
      || sessionRecord.walletScope !== "evm"
      || sessionRecord.walletAddress?.toLowerCase() !== request.contract.sourceWallet.toLowerCase()
      || sessionRecord.evmChainKey !== request.contract.sourceChainKey
    ) {
      throw new Error("The EVM Bridge preflight must use this encrypted session's locked wallet and source chain.");
    }
    if (!(await evmWallet.hasAddress(request.contract.sourceWallet))) {
      throw new Error("The selected EVM Bridge source wallet is not registered in the encrypted local vault.");
    }
    const prepared = await relayEvmBridge.prepare(request.contract, await evmBridgeEngineFor(request.contract.sourceChainKey));
    return EvmBridgePrepareResponseSchema.parse({
      schemaVersion: 1,
      requestId: request.requestId,
      quote: prepared.quote,
      preflight: prepared.preflight,
    });
  });

  ipcMain.handle(IPC_CHANNELS.evmBridgeExecute, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmBridgeExecuteRequestSchema.parse(raw);
    requireUnlocked();
    const prepared = relayEvmBridge.peek(request.preflightId);
    if (prepared === null) throw new Error("The reviewed EVM Bridge preflight expired; request a fresh quote and simulation.");
    const sessionRecord = await sessions.get(request.sessionId);
    if (
      sessionRecord === null
      || sessionRecord.walletScope !== "evm"
      || sessionRecord.walletAddress?.toLowerCase() !== prepared.contract.sourceWallet.toLowerCase()
      || sessionRecord.evmChainKey !== prepared.contract.sourceChainKey
    ) {
      throw new Error("The EVM Bridge execution must use this encrypted session's locked wallet and source chain.");
    }
    const fullAccess = sessionRecord.permission === "full";
    if (fullAccess) localSigningSession.assertActive();
    const receipt = await evmBridgeExecutor.execute({
      preflightId: request.preflightId,
      action: request.action,
      masterPassword: request.masterPassword,
      confirmation: request.confirmation,
      fullAccess,
      engine: await evmBridgeEngineFor(prepared.contract.sourceChainKey),
      withSigner: async (operation) => await evmWallet.withSignerForAddress(prepared.contract.sourceWallet, operation),
    });
    return EvmBridgeExecuteResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, receipt });
  });

  ipcMain.handle(IPC_CHANNELS.evmBridgeListReceipts, async (event) => {
    assertTrustedSender(event);
    requireUnlocked();
    return EvmBridgeReceiptsResponseSchema.parse({ schemaVersion: 1, receipts: await evmBridgeReceipts.list() });
  });

  ipcMain.handle(IPC_CHANNELS.evmBridgeReconcile, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const request = EvmBridgeReconcileRequestSchema.parse(raw);
    requireUnlocked();
    const stored = await evmBridgeReceipts.get(request.receiptId);
    if (stored === null) throw new Error("The EVM Bridge receipt was not found.");
    const receipt = await evmBridgeReconciliation.reconcile({
      receiptId: stored.id,
      sourceEngine: await evmBridgeEngineFor(stored.sourceChainKey),
      verifyDestination: async ({ receipt: candidate, transactionHash }) => {
        if (candidate.destinationChainKey === "solana") {
          const signature = await reads.verifyTransactionSignature(transactionHash);
          if (signature.state !== "finalized" || signature.error !== null) return false;
          const settlement = await reads.tokenTransactionSettlement(
            transactionHash,
            candidate.destinationRecipient,
            candidate.destinationAssetAddress,
          );
          return BigInt(settlement.tokenRawDelta) >= BigInt(candidate.minimumDestinationAmount);
        }
        const destinationEngine = await evmBridgeEngineFor(candidate.destinationChainKey);
        const settlement = await destinationEngine.getErc20TransferSettlement(
          transactionHash as `0x${string}`,
          candidate.destinationAssetAddress as `0x${string}`,
          candidate.destinationRecipient as `0x${string}`,
        );
        return settlement.status === "confirmed"
          && settlement.amount >= BigInt(candidate.minimumDestinationAmount);
      },
    });
    return EvmBridgeReconcileResponseSchema.parse({ schemaVersion: 1, requestId: request.requestId, receipt });
  });



  ipcMain.handle("strategy:getPositions", async (event) => {
    assertTrustedSender(event);
    if (secretStore.isLocked()) {
      return { positions: [] };
    }
    return { positions: strategyManager.getActivePositions() };
  });


  ipcMain.handle("strategy:upsertPosition", async (event, config) => {
    assertTrustedSender(event);
    requireUnlocked();
    strategyManager.registerPosition(config);
    return { success: true };
  });

  ipcMain.handle("strategy:closePosition", async (event, id) => {
    assertTrustedSender(event);
    requireUnlocked();
    strategyManager.closePosition(id);
    return { success: true };
  });

  ipcMain.handle("runtime:toggleBackgroundLoop", async (event, enabled) => {
    assertTrustedSender(event);
    requireUnlocked();
    if (enabled) {
      observationService?.startObservationLoop(async (mints) => {
        const pricePoints = await reads.prices(mints);
        const map = new Map<string, number>();
        for (const [mint, pp] of pricePoints) {
          map.set(mint, pp.usdPrice);
        }
        return map;
      });
    } else {
      observationService?.stopObservationLoop();
    }
    return { success: true };
  });
}


