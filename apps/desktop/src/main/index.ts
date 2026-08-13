// @ts-nocheck
import { registerIpc } from "./ipc/registerIpc.js";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, powerMonitor, session, shell, Tray } from "electron";
import type { NativeImage } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

import { previewOpenRouterModels } from "./ai/providers.js";
import { AiService } from "./ai/service.js";
import { MainnetReadService } from "./integrations/read-only.js";
import { getEvmChain, listEvmChains } from "./integrations/evm-chains.js";
import { fetchEvmUsdPrices } from "./integrations/evm-price-provider.js";
import { BridgeClientService } from "./integrations/bridge-client.js";
import { resolveEnabledBridgeRoute } from "./integrations/bridge-routes.js";
import { JupiterTriggerV2Client } from "./integrations/trigger-v2.js";
import { LimitOrderService } from "./mission/limit-order.js";
import { MissionSimulationService } from "./mission/simulation.js";
import { BridgeMissionService, CONTROLLED_BRIDGE_ACCEPTANCE_CONFIRMATION, isControlledBridgeAcceptanceCandidate } from "./mission/bridge.js";
import { TransactionSettingsService, withSessionSafetyOverrides } from "./mission/transaction-settings.js";
import { DurableBackgroundObservationService } from "./execution/background-loop.js";
import { PositionStrategyManager } from "./execution/strategy-manager.js";
import { AutomationManager } from "./execution/automation-manager.js";
import { MissionProposalService } from "./mission/proposals.js";
import { TokenAllowlistService } from "./mission/token-allowlist.js";
import { ReconciliationService } from "./execution/reconciliation.js";
import { buildAndSimulatePumpV2ProductionTransaction, type PumpV2ProductionSimulationInput } from "./pump/production.js";
import {
  buildAndSimulatePumpSwapProductionTransaction,
  pumpSwapEvidenceForPolicy,
  type PumpSwapProductionSimulationInput,
} from "./pump/pumpswap-production.js";
import { evaluatePumpTradeEligibility } from "./pump/eligibility.js";
import { evaluatePumpExecutionReadiness } from "./pump/execution-readiness.js";
import { evaluatePumpFinalRevalidation, PumpPreparedExecutionService } from "./pump/prepared-execution.js";
import { EncryptedPumpReceiptService } from "./pump/receipt-store.js";
import { PumpRiskLedgerService } from "./pump/risk-ledger.js";
import { assertPumpProposalWithinRisk, PumpRiskSettingsService } from "./pump/risk-settings.js";
import { PumpMainnetRpc } from "./pump/rpc.js";
import { PumpReceiptReconciliationService } from "./pump/receipt-reconciliation.js";
import {
  createSignedPumpExecution,
  markPumpBroadcastUnknown,
  markPumpExecutionFailed,
  markPumpExecutionFinalized,
} from "./pump/execution.js";
import { broadcastPumpTransaction } from "./pump/signer.js";
import { createPumpLaunchDraft } from "./pump/launch-draft.js";
import {
  markPumpLaunchBroadcastUnknown,
  markPumpLaunchFailed,
  markPumpLaunchFinalized,
  PumpLaunchPreflightService,
} from "./pump/launch-preflight.js";
import { TOKEN_2022_PROGRAM_ID } from "./pump/launch-codec.js";
import { MasterPasswordService } from "./security/master-password.js";
import { EmergencyStopService } from "./security/emergency-stop.js";
import { SessionService } from "./sessions/service.js";
import { deriveVerifiedCostBasis } from "./portfolio/cost-basis.js";
import { buildUnifiedPortfolio } from "./portfolio/unified-portfolio.js";
import {
  assertTrustedIpcEvent,
  denyPermissionCheck,
  denyPermissionRequest,
  denyWindowOpen,
  HARDENED_WEB_PREFERENCES,
  preventRendererNavigation,
} from "./security/policy.js";
import { RuntimeDatabase, MAINNET_PROFILE_ID } from "./storage/database.js";
import { LocalEncryptedKeystore } from "./storage/keystore.js";
import { WalletOnboardingService } from "./wallet/onboarding.js";
import { EvmEngine } from "./execution/evm-engine.js";
import { VenueExecutionGate, type VenueId } from "./execution/venue-execution-gate.js";
import { KyberSwapPreflightService } from "./execution/kyberswap-preflight.js";
import { KyberSwapQuoteService } from "./integrations/kyberswap.js";
import { EvmSwapRouterService } from "./integrations/evm-swap-router.js";
import { ROBINHOOD_UNIVERSAL_ROUTER, ROBINHOOD_UNIVERSAL_ROUTER_VERSION, UniswapQuoteService } from "./integrations/uniswap.js";
import { EvmWalletService } from "./wallet/evm-wallet.js";
import { EncryptedEvmReceiptService } from "./execution/evm-receipt-store.js";
import { EvmReceiptReconciliationService } from "./execution/evm-reconciliation.js";
import { EvmKyberExecutionService } from "./execution/evm-kyber-execution.js";
import { RelayEvmBridgeService } from "./integrations/relay-evm-bridge.js";
import { EncryptedEvmBridgeReceiptService } from "./execution/evm-bridge-receipt-store.js";
import { EvmBridgeExecutionService, EvmBridgeReconciliationService } from "./execution/evm-bridge-execution.js";
import { VenueReadinessService } from "./security/venue-readiness.js";
import { EncryptedFullAccessGrantService } from "./security/full-access-grants.js";
import { EncryptedFullAccessExecutionGrantService } from "./security/full-access-execution-grants.js";
import { FullAccessEvmAssetAuthorizationService } from "./security/full-access-evm-assets.js";
import { LocalSigningSessionService } from "./security/local-signing-session.js";
import { AutonomousJobStore } from "./execution/autonomous-job-store.js";
import { AutonomousExecutorService } from "./execution/autonomous-executor.js";
import { configureSafeAuditLog } from "./telemetry/safe-audit-log.js";


let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let keystore: LocalEncryptedKeystore | null = null;
let runtimeDatabase: RuntimeDatabase | null = null;
let observationService: DurableBackgroundObservationService | null = null;
let launchPreflightService: PumpLaunchPreflightService | null = null;
let localSigningSession: LocalSigningSessionService | null = null;

app.enableSandbox();
if (process.platform === "win32") app.setAppUserModelId("ai.silfable.desktop");

function revealMainWindow(): void {
  if (!mainWindow) return;
  if (keystore?.isLocked()) mainWindow.webContents.reload();
  mainWindow.show();
  mainWindow.focus();
}

function getAppIcon(): NativeImage {
  const possiblePaths = [
    fileURLToPath(new URL("../../src/assets/logo-bg.jpeg", import.meta.url)),
    fileURLToPath(new URL("../renderer/assets/logo-bg.jpeg", import.meta.url)),
    join(app.getAppPath(), "src/assets/logo-bg.jpeg"),
    join(app.getAppPath(), "resources/icon.png"),
    join(app.getAppPath(), "resources/icon.ico"),
    join(app.getAppPath(), "build/icon.png"),
  ];
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  }
  return nativeImage.createEmpty();
}

function createMainWindow(): BrowserWindow {
  const appIcon = getAppIcon();
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 680,
    backgroundColor: "#080b18",
    show: false,
    icon: appIcon,
    webPreferences: {
      preload: fileURLToPath(new URL("../preload/index.cjs", import.meta.url)),
      ...HARDENED_WEB_PREFERENCES,
    },
  });
  if (!appIcon.isEmpty()) {
    window.setIcon(appIcon);
  }
  window.webContents.setWindowOpenHandler(denyWindowOpen);
  window.webContents.on("will-navigate", preventRendererNavigation);
  window.webContents.on("will-attach-webview", preventRendererNavigation);
  window.once("ready-to-show", () => window.show());
  window.on("minimize", () => { launchPreflightService?.clear(); keystore?.lock(); window.hide(); });
  window.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      launchPreflightService?.clear();
      keystore?.lock();
      window.hide();
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(fileURLToPath(new URL("../renderer/index.html", import.meta.url)));
  return window;
}

function createTray(): Tray {
  const appIcon = getAppIcon();
  const icon = appIcon.isEmpty() ? nativeImage.createEmpty() : appIcon.resize({ width: 16, height: 16 });
  const appTray = new Tray(icon);
  appTray.setToolTip("Silfable — Mainnet workspace");
  appTray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Silfable", click: revealMainWindow },
    { type: "separator" },
    { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
  ]));
  appTray.on("click", revealMainWindow);
  return appTray;
}

/**
 * Resolves an EVM RPC without trusting an endpoint merely because it answered.
 * A saved custom RPC takes precedence, then the chain's official endpoint,
 * followed by explicitly listed public fallbacks. Every candidate must prove
 * both its expected chain ID and that it can serve a current block before the
 * caller receives an engine. A node answering only `eth_chainId` is not enough
 * for quote evidence, simulation, or a later transaction preflight.
 */
async function createVerifiedEvmEngine(
  secretStore: LocalEncryptedKeystore,
  chainKey: ReturnType<typeof getEvmChain>["key"],
  executionGate: VenueExecutionGate = new VenueExecutionGate(),
  executionVenue: VenueId = "evm",
): Promise<EvmEngine> {
  const chain = getEvmChain(chainKey);
  const configured = await secretStore.getSecret(chain.rpcSecretName);
  const usableConfigured = configured?.trim() || undefined;
  const candidates = [...new Set([
    usableConfigured,
    chain.defaultRpcUrl,
    ...(chain.fallbackRpcUrls ?? []),
  ].filter((value): value is string => value !== undefined))];
  let lastError: unknown;
  for (const rpcUrl of candidates) {
    const engine = new EvmEngine(rpcUrl, chain.chainId, executionGate, executionVenue);
    try {
      await engine.getBlockNumber();
      return engine;
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : "Unknown RPC error";
  throw new Error(`${chain.name} has no reachable verified RPC endpoint. ${detail}`);
}


function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  assertTrustedIpcEvent(event, mainWindow?.webContents ?? null);
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler(denyPermissionCheck);
  session.defaultSession.setPermissionRequestHandler(denyPermissionRequest);
  configureSafeAuditLog({
    directory: join(app.getPath("userData"), "logs"),
    maxBytes: 1_048_576,
    maxArchives: 3,
  });
  keystore = new LocalEncryptedKeystore(join(app.getPath("userData"), "keystore", "secrets.v1.json"));
  const initializedKeystore = keystore;
  runtimeDatabase = await RuntimeDatabase.open(join(app.getPath("userData"), "data", "silfable-mainnet.sqlite3"));
  const passwords = new MasterPasswordService(runtimeDatabase);
  const emergencyStop = new EmergencyStopService(runtimeDatabase);
  const wallets = new WalletOnboardingService(keystore, runtimeDatabase);
  const evmWallet = new EvmWalletService(keystore);
  const evmReceipts = new EncryptedEvmReceiptService(runtimeDatabase, keystore);
  const evmBridgeReceipts = new EncryptedEvmBridgeReceiptService(runtimeDatabase, keystore);
  const reads = new MainnetReadService({ secrets: keystore, wallets });
  const transactionSettings = new TransactionSettingsService(runtimeDatabase);
  const kyberQuotes = new KyberSwapQuoteService();
  const uniswapQuotes = new UniswapQuoteService({
    apiKey: async () => await initializedKeystore.getSecret("uniswap-api-key"),
  });
  const evmSwapQuotes = new EvmSwapRouterService(kyberQuotes, uniswapQuotes);

function resolveEvmTokenMetadata(address: string): { symbol: string; decimals: number } {
  const addr = address.toLowerCase();
  if (addr === "0x0000000000000000000000000000000000000000" || addr === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
    return { symbol: "ETH", decimals: 18 };
  }
  if (addr === "0x0bd7d308f8e1639fab988df18a8011f41eacad73" || addr === "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" || addr === "0x4200000000000000000000000000000000000006" || addr === "0x82af49447d8a07e3bd95bd0d56f35241523fbab1") {
    return { symbol: "WETH", decimals: 18 };
  }
  if (addr === "0x5fc5360d0400a0fd4f2af552add042d716f1d168") {
    return { symbol: "USDG", decimals: 6 };
  }
  if (addr === "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" || addr === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" || addr === "0xaf88d065e77c8cc2239327c5edb3a432268e5831") {
    return { symbol: "USDC", decimals: 6 };
  }
  if (addr === "0x2f782484abd8f85e2ba77daae393bf72658a3297") {
    return { symbol: "WBTC", decimals: 8 };
  }
  return { symbol: `${address.slice(0, 6)}…${address.slice(-4)}`, decimals: 18 };
}

  // AI drafts must read the same persisted defaults shown in Settings.
  const ai = new AiService({
    keystore,
    settings: runtimeDatabase,
    readService: reads,
    transactionSettings,
    evmSwapQuotes: {
      quote: async (input) => {
        if (!(await evmWallet.hasAddress(input.walletAddress))) {
          throw new Error("The selected EVM wallet is not registered in the encrypted local vault.");
        }
        const quote = await evmSwapQuotes.quote({
          chainKey: input.chainKey,
          tokenIn: input.sellToken,
          tokenOut: input.buyToken,
          amountIn: input.sellAmount,
          slippageBps: input.slippageBps,
          swapper: input.walletAddress,
        });
        const blockNumber = await createVerifiedEvmEngine(initializedKeystore, input.chainKey).then(async (engine) => await engine.getBlockNumber());
        const sellMeta = resolveEvmTokenMetadata(quote.tokenIn);
        const buyMeta = resolveEvmTokenMetadata(quote.tokenOut);
        return EvmSwapProposalSchema.parse({
          id: crypto.randomUUID(),
          quoteId: quote.quoteId,
          chainId: quote.chainId,
          chainKey: quote.chainKey,
          walletAddress: input.walletAddress,
          slippageBps: input.slippageBps,
          quote: {
            sellToken: quote.tokenIn,
            buyToken: quote.tokenOut,
            sellAmount: quote.amountIn,
            buyAmount: quote.amountOut,
            minBuyAmount: quote.minimumAmountOut,
            blockNumber: blockNumber.toString(),
            liquidityAvailable: true,
            sellTokenSymbol: sellMeta.symbol,
            buyTokenSymbol: buyMeta.symbol,
            sellTokenMultiplier: (10 ** sellMeta.decimals).toString(),
            buyTokenMultiplier: (10 ** buyMeta.decimals).toString(),
            provider: quote.provider,
            routerAddress: quote.routerAddress,
            routeNames: quote.routeNames,
          },
          status: "quote-only",
          createdAt: quote.createdAt,
        });
      },
    },
  });
  const sessions = new SessionService(runtimeDatabase, keystore);
  const pumpRiskSettings = new PumpRiskSettingsService(runtimeDatabase);
  const pumpRiskLedger = new PumpRiskLedgerService(runtimeDatabase, keystore);
  const pumpReceipts = new EncryptedPumpReceiptService(runtimeDatabase, keystore, pumpRiskLedger);
  const simulations = new MissionSimulationService(reads, wallets, transactionSettings);
  const trigger = new JupiterTriggerV2Client({ secrets: keystore, wallets });
  const limitOrders = new LimitOrderService({ reads, wallets, trigger, transactionSettings });
  const pumpRpc = new PumpMainnetRpc();
  const preparedPump = new PumpPreparedExecutionService();
  launchPreflightService = new PumpLaunchPreflightService(pumpRpc);

  const strategyManager = new PositionStrategyManager(runtimeDatabase);
  const automationManager = new AutomationManager(runtimeDatabase);
  ai.configureAutomationManager(automationManager,
    () => mainWindow
  );
  observationService = new DurableBackgroundObservationService(strategyManager, 15000);
  observationService.setAutomationManager(automationManager, () => mainWindow);
  
  const missionProposals = new MissionProposalService(reads, observationService);
  const tokenAllowlist = new TokenAllowlistService(runtimeDatabase, reads);
  const fullAccessGrants = new EncryptedFullAccessGrantService(runtimeDatabase, keystore);
  localSigningSession = new LocalSigningSessionService(keystore);
  const autonomousJobs = new AutonomousJobStore(runtimeDatabase, keystore);
  const fullAccessExecutionGrants = new EncryptedFullAccessExecutionGrantService(runtimeDatabase, keystore, localSigningSession, autonomousJobs);
  const fullAccessEvmAssets = new FullAccessEvmAssetAuthorizationService(
    runtimeDatabase,
    async () => await createVerifiedEvmEngine(initializedKeystore, "robinhood"),
  );
  ai.configureFullAccessEvmAssets(fullAccessEvmAssets);
  const autonomousExecutor = new AutonomousExecutorService({
    strategyManager,
    pumpRpc,
    transactionSettings,
    pumpRiskSettings,
    pumpRiskLedger,
    keystore,
    receiptStore: pumpReceipts,
    wallets,
    fullAccessGrants,
  });

  observationService.on("auto_execution_triggered", (event) => {
    if (!emergencyStop.get().engaged) {
      autonomousExecutor.executeTrigger(event).catch((err) => {
        console.warn("Autonomous trigger execution skipped/failed:", err.message);
      });
    }
  });

  // Full Access automation remains local to this desktop process. A due DCA
  // or TP/SL proposal is only broadcast after the same fresh policy and
  // simulation path used by an interactive Full Access Solana swap.
  const fullAccessAutomationInFlight = new Set<string>();
  // Robinhood automation owns a separate short-lived preflight store. A due
  // job never reuses a quote or calldata prepared for an earlier execution.
  const evmAutomationPreflight = new KyberSwapPreflightService();
  const evmAutomationExecutor = new EvmKyberExecutionService(passwords, emergencyStop, evmAutomationPreflight, evmReceipts);
  // This mirrors the attested Robinhood EVM readiness gate used by the
  // interactive IPC lane. It is not an approval bypass: the dispatcher still
  // performs a new quote, simulation, balance/gas check and signer boundary.
  const evmAutomationGate = new VenueExecutionGate({
    signerCustody: true, deterministicPolicy: true, freshSimulation: true,
    receiptReconciliation: true, recoveryDrill: true, securityAudit: true,
    controlledMainnetAcceptance: true, explicitFinalApproval: true,
    revocationAndKillSwitch: true, spendLimits: true,
  });
  const dispatchFullAccessAutomation = async (proposal: ReturnType<typeof automationManager.listProposals>[number]) => {
    if (fullAccessAutomationInFlight.has(proposal.id)) return;
    fullAccessAutomationInFlight.add(proposal.id);
    let assistantMessageId: string | null = null;
    let automationStage: "quote" | "preflight" | "approval" | "swap" | "reconcile" | null = null;
    try {
      const sessionRecord = await sessions.get(proposal.sessionId);
      if (sessionRecord?.walletScope === "evm" && sessionRecord.evmChainKey === "robinhood") {
        if (sessionRecord.permission !== "full" || !sessionRecord.walletAddress) return;
        if (emergencyStop.get().engaged || !localSigningSession.status().active) throw new Error("Full Access local signing session is unavailable");
        fullAccessEvmAssets.assertPairAuthorized(sessionRecord.id, proposal.inputMint, proposal.outputMint);
        const assistantMessage = { id: crypto.randomUUID(), role: "assistant" as const, text: `${proposal.reason.replace(/_/gu, " ")} triggered. Full Access is running a fresh Robinhood quote and preflight.`, at: new Date().toISOString() };
        assistantMessageId = assistantMessage.id;
        await sessions.upsert({ ...sessionRecord, messages: [...sessionRecord.messages, assistantMessage] });
        let automationSwapProposal: any = null;
        const run = async (): Promise<Awaited<ReturnType<typeof evmAutomationExecutor.executeFullAccess>>> => {
          automationStage = "quote";
          const quote = await evmSwapQuotes.quote({ chainKey: "robinhood", tokenIn: proposal.inputMint as `0x${string}`, tokenOut: proposal.outputMint as `0x${string}`, amountIn: proposal.inputAmountRaw, slippageBps: 200, swapper: sessionRecord.walletAddress as `0x${string}` });
          const engine = await createVerifiedEvmEngine(initializedKeystore, "robinhood", evmAutomationGate);
          const sellMeta = resolveEvmTokenMetadata(quote.tokenIn);
          const buyMeta = resolveEvmTokenMetadata(quote.tokenOut);
          automationSwapProposal = EvmSwapProposalSchema.parse({
            id: crypto.randomUUID(), quoteId: quote.quoteId, chainId: quote.chainId, chainKey: "robinhood", walletAddress: sessionRecord.walletAddress,
            slippageBps: 200, status: "quote-only", createdAt: new Date().toISOString(),
            quote: { sellToken: quote.tokenIn, buyToken: quote.tokenOut, sellAmount: quote.amountIn, buyAmount: quote.amountOut, minBuyAmount: quote.minimumAmountOut, blockNumber: (await engine.getBlockNumber()).toString(), liquidityAvailable: true, sellTokenSymbol: sellMeta.symbol, buyTokenSymbol: buyMeta.symbol, sellTokenMultiplier: (10 ** sellMeta.decimals).toString(), buyTokenMultiplier: (10 ** buyMeta.decimals).toString(), provider: quote.provider, routerAddress: quote.routerAddress, routeNames: quote.routeNames },
          });
          automationStage = "preflight";
          const preflight = await evmAutomationPreflight.prepare({ quotes: evmSwapQuotes, engine, quoteId: quote.quoteId, wallet: sessionRecord.walletAddress as `0x${string}`, slippageBps: 200 });
          automationStage = preflight.action;
          return await evmAutomationExecutor.executeFullAccess({ preflightId: preflight.id, chainKey: "robinhood", walletAddress: sessionRecord.walletAddress as `0x${string}`, action: preflight.action, engine, withSigner: async (operation) => await evmWallet.withSignerForAddress(sessionRecord.walletAddress as `0x${string}`, operation) });
        };
        let receipt = await run();
        // Exact ERC-20 approval is a bounded first action; the swap always
        // gets a new quote/preflight after that approval is finalized.
        if (receipt.kind === "approval" && receipt.status === "confirmed") receipt = await run();
        const confirmed = receipt.kind === "swap" && receipt.status === "confirmed";
        const latest = await sessions.get(sessionRecord.id);
        if (latest) await sessions.upsert({ ...latest, messages: latest.messages.map((message) => message.id === assistantMessage.id ? {
          ...message,
          text: confirmed ? `${proposal.reason.replace(/_/gu, " ")} Full Access Robinhood swap confirmed.` : `${proposal.reason.replace(/_/gu, " ")} Robinhood transaction is ${receipt.status}; this automation is paused and will not retry automatically.`,
          evmSwapProposal: automationSwapProposal,
          // `wallet` is an internal signer field. Session messages use the
          // public `walletAddress` contract and are strict to prevent secret
          // or implementation fields leaking into encrypted history.
          evmExecutionReceipts: [(() => { const { wallet, ...safeReceipt } = receipt; return { ...safeReceipt, walletAddress: wallet }; })()],
        } : message) });
        if (confirmed) automationManager.approveProposal(proposal.id);
        else automationManager.rejectProposal(proposal.id);
        return;
      }
      if (!sessionRecord || sessionRecord.permission !== "full" || sessionRecord.walletScope !== "solana" || !sessionRecord.walletAddress) return;
      if (emergencyStop.get().engaged || localSigningSession.status().active === false) {
        const blockedMessage = {
          id: crypto.randomUUID(), role: "assistant" as const,
          text: "Full Access automation paused before execution because the local signing session is not active. No transaction was signed or broadcast. Create a fresh Full Access session to resume unattended execution.",
          at: new Date().toISOString(),
        };
        await sessions.upsert({ ...sessionRecord, messages: [...sessionRecord.messages, blockedMessage] });
        automationManager.rejectProposal(proposal.id);
        return;
      }
      const missionPreview = {
        id: crypto.randomUUID(), status: "ready-for-review", goal: `${proposal.reason}: automated ${proposal.inputMint} to ${proposal.outputMint} swap`,
        walletAddress: sessionRecord.walletAddress, inputMint: proposal.inputMint, outputMint: proposal.outputMint, inputAmount: proposal.inputAmountRaw,
        maxSlippageBps: 200, deadlineAt: new Date(Date.now() + 10 * 60_000).toISOString(), stopConditions: [`Full Access automation ${proposal.reason}`], quote: null,
        checks: [
          { code: "wallet_registered", status: "pass", message: "Selected registered wallet" },
          { code: "token_pair_valid", status: "pass", message: "Automation token pair is pinned" },
          { code: "amount_valid", status: "pass", message: "Automation amount is pinned" },
          { code: "slippage_within_limit", status: "pass", message: "200 bps maximum slippage" },
          { code: "deadline_valid", status: "pass", message: "Short-lived execution deadline" },
          { code: "balance_sufficient", status: "pass", message: "Balance is rechecked during simulation" },
          { code: "quote_only", status: "pass", message: "Unsigned simulation is required" },
        ], executionAllowed: false, createdAt: new Date().toISOString(),
      };
      const assistantMessage = { id: crypto.randomUUID(), role: "assistant" as const, text: `${proposal.reason.replace(/_/gu, " ")} triggered. Full Access is running the bounded Solana preflight.`, at: new Date().toISOString(), missionPreview };
      assistantMessageId = assistantMessage.id;
      let updated = { ...sessionRecord, messages: [...sessionRecord.messages, assistantMessage] };
      await sessions.upsert(updated);
      const simulation = await simulations.simulate(missionPreview);
      updated = { ...updated, messages: updated.messages.map((message) => message.id === assistantMessage.id ? { ...message, missionSimulation: simulation } : message) };
      await sessions.upsert(updated);
      if (simulation.status !== "passed") {
        updated = { ...updated, messages: updated.messages.map((message) => message.id === assistantMessage.id ? { ...message, text: `${proposal.reason.replace(/_/gu, " ")} paused because the deterministic simulation did not pass. No transaction was signed or broadcast.` } : message) };
        await sessions.upsert(updated);
        automationManager.rejectProposal(proposal.id);
        return;
      }
      // Pause/cancel/emergency stop may arrive while the unsigned simulation is
      // in flight. Re-check the durable proposal and signer boundary directly
      // before signing so a stale in-flight task can never broadcast.
      const liveProposal = automationManager.listProposals().find((item) => item.id === proposal.id);
      if (liveProposal?.status !== "AWAITING_APPROVAL" || emergencyStop.get().engaged || localSigningSession.status().active === false) {
        updated = { ...updated, messages: updated.messages.map((message) => message.id === assistantMessage.id ? {
          ...message,
          text: `${proposal.reason.replace(/_/gu, " ")} was cancelled before signing. No transaction was signed or broadcast.`,
        } : message) };
        await sessions.upsert(updated);
        automationManager.rejectProposal(proposal.id);
        return;
      }
      const receipt = await simulations.execute(missionPreview, simulation.id);
      const confirmed = receipt.status === "confirmed";
      updated = { ...updated, messages: updated.messages.map((message) => message.id === assistantMessage.id ? {
        ...message,
        text: confirmed
          ? `${proposal.reason.replace(/_/gu, " ")} Full Access swap confirmed on Solana.`
          : `${proposal.reason.replace(/_/gu, " ")} broadcast could not be confirmed. The automation has been paused and will not retry automatically.`,
        missionExecution: receipt,
      } : message) };
      await sessions.upsert(updated);
      if (confirmed) automationManager.approveProposal(proposal.id);
      else automationManager.rejectProposal(proposal.id);
    } catch (error) {
      const rawError = error instanceof Error ? error.message : String(error);
      console.warn("Full Access automation blocked safely:", rawError);
      const latest = await sessions.get(proposal.sessionId).catch(() => null);
      if (latest) {
        const lowerError = rawError.toLowerCase();
        const operationalCause = lowerError.includes("allowance") ? "the exact ERC-20 allowance could not be prepared"
          : lowerError.includes("balance") ? "the wallet balance or native gas reserve is insufficient"
          : lowerError.includes("rpc") || lowerError.includes("fetch") || lowerError.includes("network") ? "the verified Robinhood RPC or quote provider is unavailable"
          : lowerError.includes("router") || lowerError.includes("quote") || lowerError.includes("preflight") ? "a fresh Uniswap quote or preflight was rejected"
          : lowerError.includes("sign") || lowerError.includes("vault") ? "the local Full Access signing session is not active"
          : "a local policy or transaction preflight check failed";
        const stageLabel = automationStage === null ? "session validation" : automationStage;
        const failureText = `Full Access Robinhood automation paused during ${stageLabel} because ${operationalCause}. No transaction was signed or broadcast, and no automatic retry will be attempted. Review the strategy, wallet gas reserve, and Robinhood RPC before resuming.`;
        const messages = assistantMessageId
          ? latest.messages.map((message) => message.id === assistantMessageId ? { ...message, text: failureText } : message)
          : [...latest.messages, { id: crypto.randomUUID(), role: "assistant" as const, text: failureText, at: new Date().toISOString() }];
        await sessions.upsert({ ...latest, messages }).catch(() => undefined);
      }
      automationManager.rejectProposal(proposal.id);
    } finally {
      fullAccessAutomationInFlight.delete(proposal.id);
    }
  };

  observationService.on("automation_proposal_created", (proposal) => {
    void dispatchFullAccessAutomation(proposal);
  });

  if (!emergencyStop.get().engaged) observationService.startObservationLoop(async (mints) => {
    const solanaMints = mints.filter((mint) => !/^0x[0-9a-f]{40}$/iu.test(mint));
    const evmMints = mints.filter((mint) => /^0x[0-9a-f]{40}$/iu.test(mint));
    const pricePoints = solanaMints.length > 0 ? await reads.prices(solanaMints) : [];
    const map = new Map<string, number>();
    for (const [mint, pp] of pricePoints) {
      map.set(mint, pp.usdPrice);
    }
    if (evmMints.length > 0) {
      const evidence = await fetchEvmUsdPrices({ chainKey: "robinhood", tokenAddresses: evmMints });
      for (const [token, price] of evidence?.prices ?? []) map.set(token.toLowerCase(), price);
    }
    return map;
  });

  registerIpc(keystore, runtimeDatabase, passwords, emergencyStop, wallets, evmWallet, evmReceipts, evmBridgeReceipts, evmSwapQuotes, uniswapQuotes, reads, ai, sessions, simulations, limitOrders, transactionSettings, pumpRiskSettings, pumpRiskLedger, pumpReceipts, pumpRpc, preparedPump, launchPreflightService, strategyManager, observationService, automationManager, fullAccessExecutionGrants, localSigningSession, autonomousJobs, fullAccessEvmAssets, () => mainWindow, createVerifiedEvmEngine);

  mainWindow = createMainWindow();
  tray = createTray();
  powerMonitor.on("suspend", () => { preparedPump.clear(); launchPreflightService?.clear(); localSigningSession.clear("system suspended"); keystore?.lock(); observationService?.stopObservationLoop(); });
  powerMonitor.on("lock-screen", () => { localSigningSession.clear("system locked"); keystore?.lock(); });
  powerMonitor.on("resume", () => {
    if (emergencyStop.get().engaged) return;
    observationService?.startObservationLoop(async (mints) => {
      const pricePoints = await reads.prices(mints);
      const map = new Map<string, number>();
      for (const [mint, pp] of pricePoints) {
        map.set(mint, pp.usdPrice);
      }
      return map;
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
  });
}).catch((error) => {
  console.error("Fatal error during app startup:", error);
  app.exit(1);
});

app.on("before-quit", () => {
  isQuitting = true;
  launchPreflightService?.clear();
  launchPreflightService = null;
  observationService?.stopObservationLoop();
  localSigningSession?.clear("application quit");
  localSigningSession = null;
  keystore?.lock();
  runtimeDatabase?.close();
  runtimeDatabase = null;
  tray?.destroy();
  tray = null;
});

