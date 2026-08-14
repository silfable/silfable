// @ts-nocheck
import {
  AiProviderSettingSchema,
  BRIDGE_ROBINHOOD_CHAIN_ID,
  BRIDGE_ROBINHOOD_USDG_ADDRESS,
  BRIDGE_SOLANA_CHAIN_ID,
  BRIDGE_SOLANA_USDC_MINT,
  BridgeContractSchema,
  EvmBridgeContractSchema,
  type AiProviderSetting,
  type BridgeContract,
  type BridgePreflightEvidence,
  type BridgeProposal,
  type EvmBridgeContract,
  type EvmBridgePreflight,
  type EvmBridgeQuote,
  type EvmSwapProposal,
  type EvmChainKey,
  type SessionIntent,
  type SessionWalletScope,
  type TransactionSettings,
} from "@silfable/contracts";

import type { SecretName } from "../storage/keystore.js";
import type { MainnetReadService } from "../integrations/read-only.js";
import { MissionPolicyService } from "../mission/policy.js";
import { DEFAULT_TRANSACTION_SETTINGS, type TransactionSettingsService } from "../mission/transaction-settings.js";
import { callOpenRouterChat, DEFAULT_OPENROUTER_MODEL, type ReadOnlyAiTool } from "./providers.js";
import type { AutomationManager } from "../execution/automation-manager.js";
import { UNISWAP_NATIVE_TOKEN_ADDRESS } from "../integrations/uniswap.js";
import type { FullAccessEvmAssetAuthorizationService } from "../security/full-access-evm-assets.js";

type AiSecretStore = {
  getSecret(name: SecretName): Promise<string | null>;
  setSecret(name: SecretName, plaintext: string): Promise<void>;
  deleteSecret(name: SecretName): Promise<void>;
};

type AiSettingsStore = {
  getSetting(key: string): unknown | null;
  setSetting(key: string, value: unknown): void;
};

type EvmSwapQuoteService = {
  quote(input: {
    walletAddress: string;
    chainKey: EvmChainKey;
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    slippageBps: number;
  }): Promise<EvmSwapProposal>;
};

type BridgePreparationService = {
  prepare(contract: BridgeContract): Promise<{ proposal: BridgeProposal; preflight: BridgePreflightEvidence }>;
};

type EvmBridgePreparationService = {
  prepare(contract: EvmBridgeContract): Promise<{ quote: EvmBridgeQuote; preflight: EvmBridgePreflight }>;
};

const SETTING_KEY = "ai.provider.openrouter";

export type PumpAiScope = {
  kind: "exact-mint" | "watchlist" | "discovery";
  allowedMints: string[];
  discoveryCursor?: string | null;
};

export class AiService {
  readonly #keystore: AiSecretStore;
  readonly #settings: AiSettingsStore;
  readonly #readService: MainnetReadService | null;
  readonly #transactionSettings: Pick<TransactionSettingsService, "get">;
  readonly #evmSwapQuotes: EvmSwapQuoteService | null;
  #bridgePreparation: BridgePreparationService | null;
  #evmBridgePreparation: EvmBridgePreparationService | null;
  #automationManager: AutomationManager | null;
  #fullAccessEvmAssets: FullAccessEvmAssetAuthorizationService | null = null;

  constructor(input: {
    keystore: AiSecretStore;
    settings: AiSettingsStore;
    readService?: MainnetReadService;
    transactionSettings?: Pick<TransactionSettingsService, "get">;
    evmSwapQuotes?: EvmSwapQuoteService;
    bridgePreparation?: BridgePreparationService;
    evmBridgePreparation?: EvmBridgePreparationService;
    automationManager?: AutomationManager;
  }) {
    this.#keystore = input.keystore;
    this.#settings = input.settings;
    this.#readService = input.readService ?? null;
    this.#transactionSettings = input.transactionSettings ?? { get: () => ({ ...DEFAULT_TRANSACTION_SETTINGS }) };
    this.#evmSwapQuotes = input.evmSwapQuotes ?? null;
    this.#bridgePreparation = input.bridgePreparation ?? null;
    this.#evmBridgePreparation = input.evmBridgePreparation ?? null;
    this.#automationManager = input.automationManager ?? null;
  }

  configureAutomationManager(service: AutomationManager): void {
    if (this.#automationManager !== null) throw new Error("Automation manager is already configured");
    this.#automationManager = service;
  }

  configureBridgePreparation(service: BridgePreparationService): void {
    if (this.#bridgePreparation !== null) throw new Error("Bridge preparation is already configured");
    this.#bridgePreparation = service;
  }

  configureEvmBridgePreparation(service: EvmBridgePreparationService): void {
    if (this.#evmBridgePreparation !== null) throw new Error("EVM Bridge preparation is already configured");
    this.#evmBridgePreparation = service;
  }

  configureFullAccessEvmAssets(service: FullAccessEvmAssetAuthorizationService): void {
    if (this.#fullAccessEvmAssets !== null) throw new Error("Full Access EVM assets are already configured");
    this.#fullAccessEvmAssets = service;
  }

  async listSettings(): Promise<AiProviderSetting[]> {
    const configured = (await this.#keystore.getSecret("openrouter-api-key")) !== null;
    return [AiProviderSettingSchema.parse({ provider: "openrouter", configured, model: this.#model() })];
  }

  async saveProvider(apiKey: string, model: string): Promise<AiProviderSetting> {
    const setting = AiProviderSettingSchema.parse({ provider: "openrouter", configured: true, model });
    await this.#keystore.setSecret("openrouter-api-key", apiKey);
    try {
      this.#settings.setSetting(SETTING_KEY, { model: setting.model });
    } catch (error) {
      await this.#keystore.deleteSecret("openrouter-api-key");
      throw error;
    }
    return setting;
  }

  async chat(input: { prompt: string; mode: "agent" | "mission"; walletAddress: string | null; sessionId?: string; sessionContext?: string; history?: Array<{ role: "user" | "assistant"; text: string }>; pumpScope?: PumpAiScope; intent?: SessionIntent; walletScope?: SessionWalletScope; evmChainKey?: EvmChainKey; permission?: "restricted" | "full"; transactionSettings?: TransactionSettings }) {
    const apiKey = await this.#keystore.getSecret("openrouter-api-key");
    if (apiKey === null) throw new Error("OpenRouter is not configured");
    const assetConfirmation = parseFullAccessAssetConfirmation(input.prompt);
    if (assetConfirmation !== null && input.sessionId && input.permission === "full" && input.walletScope === "evm" && input.evmChainKey === "robinhood" && this.#fullAccessEvmAssets !== null) {
      const asset = this.#fullAccessEvmAssets.confirm(input.sessionId, assetConfirmation);
      return localChatResult(`Full Access asset authorized for this Robinhood session: ${asset.symbol} (${asset.address}), ${asset.decimals} decimals. The exact contract was recorded locally. Contract metadata verification is not a liquidity, issuer, or security audit.`, []);
    }
    const assetAddress = parseFullAccessAssetRequest(input.prompt);
    if (assetAddress !== null && input.sessionId && input.permission === "full" && input.walletScope === "evm" && input.evmChainKey === "robinhood" && this.#fullAccessEvmAssets !== null) {
      let review;
      try {
        review = await this.#fullAccessEvmAssets.requestReview(input.sessionId, assetAddress);
      } catch (error) {
        if (error instanceof Error && error.message === "FULL_ACCESS_BUILT_IN_ASSET") {
          return localChatResult("ETH and USDG are release-pinned Robinhood Full Access assets. They are already available in this session and do not need an authorization review. You can request a swap directly, for example: Swap 0.5 USDG to ETH.", []);
        }
        throw error;
      }
      return localChatResult(`Full Access asset review ready. Confirm the exact contract shown on the card before adding it to this session's allowlist. No quote, approval, signing, or broadcast was created.`, [], review);
    }
    if (input.sessionId && input.permission === "full" && input.walletScope === "evm" && input.evmChainKey === "robinhood" && this.#fullAccessEvmAssets !== null && /\b(?:swap|tukar)\b/iu.test(input.prompt)) {
      const requestedContracts = [...input.prompt.matchAll(/\b(0x[0-9a-fA-F]{40})\b/gu)].map((match) => match[1]!);
      const unapproved = requestedContracts.find((address) => this.#fullAccessEvmAssets!.find(input.sessionId!, address) === null);
      if (unapproved !== undefined) {
        const review = await this.#fullAccessEvmAssets.requestReview(input.sessionId, unapproved);
        return localChatResult(`This Full Access swap names a contract that is not authorized for this session. Review the exact asset card and confirm it before a quote can be prepared.`, [], review);
      }
      const authorizedSwap = parseDirectAuthorizedRobinhoodSwap(input.prompt, input.walletScope, input.evmChainKey, input.sessionId, this.#fullAccessEvmAssets);
      if (authorizedSwap !== null && input.mode === "mission" && input.walletAddress !== null && this.#evmSwapQuotes !== null) {
        const settings = input.transactionSettings ?? this.#transactionSettings.get();
        const proposal = await this.#evmSwapQuotes.quote({ walletAddress: input.walletAddress, chainKey: "robinhood", sellToken: authorizedSwap.sellToken, buyToken: authorizedSwap.buyToken, sellAmount: authorizedSwap.sellAmount, slippageBps: Math.min(settings.defaultSlippageBps, settings.maxSlippageBps, 100) });
        return { ...localChatResult(`Robinhood ${authorizedSwap.sellSymbol} → ${authorizedSwap.buySymbol} quote prepared for Full Access review. The main process will re-check this session's exact asset allowlist again before any local signature.`, ["robinhood_swap_quote"]), evmSwapProposal: proposal };
      }
    }
    const directRobinhoodDca = parseDirectRobinhoodDca(input.prompt, input.walletScope, input.evmChainKey);
    if (directRobinhoodDca !== null && input.sessionId && input.walletAddress && this.#automationManager !== null) {
      const strategy = this.#automationManager.createDca({
        sessionId: input.sessionId, walletAddress: input.walletAddress, chainKey: "robinhood",
        inputMint: directRobinhoodDca.inputToken, outputMint: directRobinhoodDca.outputToken,
        orderAmountRaw: directRobinhoodDca.orderAmountRaw, maximumTotalRaw: directRobinhoodDca.maximumTotalRaw,
        intervalSeconds: directRobinhoodDca.intervalSeconds, maximumExecutions: directRobinhoodDca.maximumExecutions,
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      });
      return { model: this.#model(), text: `Robinhood DCA ${directRobinhoodDca.inputSymbol} → ${directRobinhoodDca.outputSymbol} created: ${directRobinhoodDca.displayAmount} ${directRobinhoodDca.inputSymbol} every ${directRobinhoodDca.intervalSeconds} seconds, maximum ${directRobinhoodDca.maximumExecutions} cycles. Each due run takes a fresh quote and rechecks allowance, balance, gas, slippage, and emergency stop.`, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, toolsUsed: ["create_automation_strategy" as const], missionPreview: null, pumpTokenIntelligence: null, pumpDiscoverySnapshot: null, pumpTradePreview: null, limitOrderPreview: null, evmSwapProposal: null, automationStrategy: strategy };
    }
    const directRobinhoodBridge = parseDirectRobinhoodBridge(input.prompt, input.walletScope, input.evmChainKey);
    if (directRobinhoodBridge !== null && input.mode === "mission" && input.walletAddress !== null && this.#evmBridgePreparation !== null) {
      const now = new Date();
      const contract = EvmBridgeContractSchema.parse({
        id: crypto.randomUUID(),
        provider: "relay",
        sourceChainId: BRIDGE_ROBINHOOD_CHAIN_ID,
        sourceChainKey: "robinhood",
        sourceAssetAddress: BRIDGE_ROBINHOOD_USDG_ADDRESS,
        sourceAssetSymbol: "USDG",
        sourceAssetDecimals: 6,
        sourceWallet: input.walletAddress,
        destination: {
          kind: "solana",
          chainId: BRIDGE_SOLANA_CHAIN_ID,
          chainKey: "solana",
          assetAddress: BRIDGE_SOLANA_USDC_MINT,
          assetSymbol: "USDC",
          assetDecimals: 6,
          recipient: directRobinhoodBridge.recipient,
        },
        amountIn: directRobinhoodBridge.amountRaw,
        minimumDestinationAmount: directRobinhoodBridge.minimumDestinationAmount,
        maximumNetworkFeeWei: "10000000000000000",
        maximumTotalFeeUsd: 10,
        slippageBps: 50,
        deadline: new Date(now.getTime() + 20 * 60_000).toISOString(),
        timeoutSeconds: 3_600,
        refundPolicy: "relay-origin-refund",
        createdAt: now.toISOString(),
      });
      let prepared: { quote: EvmBridgeQuote; preflight: EvmBridgePreflight };
      try {
        prepared = await this.#evmBridgePreparation.prepare(contract);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : "The Relay bridge preflight could not be completed.";
        const userMessage = detail === "EVM source wallet token balance does not cover the bridge amount"
          ? `Robinhood bridge was not prepared because the session wallet does not have enough USDG for ${directRobinhoodBridge.displayAmount} USDG. No approval, signature, or broadcast was created. Reduce the amount or fund the exact Robinhood wallet bound to this session, then request a fresh bridge quote.`
          : `Robinhood bridge was blocked safely: ${detail} No approval, signature, or broadcast was created.`;
        return localChatResult(userMessage, ["bridge_quote" as const]);
      }
      return {
        ...localChatResult(
          `Robinhood USDG → Solana USDC bridge quote is ready. ${input.permission === "full" ? "Full Access will dispatch the exact locally preflighted source steps and then wait for independent Solana settlement verification." : "Review the exact source step before signing."}`,
          ["bridge_quote" as const],
        ),
        evmBridgePreparation: { ...prepared, contract },
      };
    }
    if (false && isUnsupportedRobinhoodAutomationPrompt(input.prompt, input.walletScope, input.evmChainKey)) {
      return {
        model: this.#model(),
        text: "Robinhood Chain DCA and TP/SL automation are not implemented yet. No swap was prepared, signed, or broadcast. This desktop release currently supports a one-time Robinhood USDG ↔ ETH swap; automated EVM execution needs its own scheduler, price monitor, exact allowance handling, and receipt reconciliation before it can be enabled safely.",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        toolsUsed: [],
        missionPreview: null,
        pumpTokenIntelligence: null,
        pumpDiscoverySnapshot: null,
        pumpTradePreview: null,
        limitOrderPreview: null,
        evmSwapProposal: null,
      };
    }
    const directDca = parseDirectSolanaDca(input.prompt, input.walletScope);
    if (directDca !== null && input.sessionId && input.walletAddress && this.#automationManager !== null) {
      const strategy = this.#automationManager.createDca({
        sessionId: input.sessionId,
        walletAddress: input.walletAddress,
        inputMint: directDca.inputMint,
        outputMint: directDca.outputMint,
        orderAmountRaw: directDca.orderAmountRaw,
        maximumTotalRaw: directDca.maximumTotalRaw,
        intervalSeconds: directDca.intervalSeconds,
        maximumExecutions: directDca.maximumExecutions,
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      });
      return {
        model: this.#model(),
        text: `DCA ${directDca.inputSymbol} → ${directDca.outputSymbol} created: ${directDca.displayAmount} ${directDca.inputSymbol} every ${directDca.intervalSeconds} seconds, maximum ${directDca.maximumExecutions} cycles.`,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        toolsUsed: ["create_automation_strategy" as const],
        missionPreview: null,
        pumpTokenIntelligence: null,
        pumpDiscoverySnapshot: null,
        pumpTradePreview: null,
        limitOrderPreview: null,
        evmSwapProposal: null,
        automationStrategy: strategy,
      };
    }
    const directRobinhoodExit = parseDirectRobinhoodExit(input.prompt, input.walletScope, input.evmChainKey);
    if (directRobinhoodExit !== null && input.sessionId && input.walletAddress && this.#automationManager !== null) {
      const strategy = this.#automationManager.createExit({
        sessionId: input.sessionId, walletAddress: input.walletAddress, chainKey: "robinhood",
        inputMint: directRobinhoodExit.inputToken, outputMint: directRobinhoodExit.outputToken,
        amountRaw: directRobinhoodExit.amountRaw, entryPriceUsd: directRobinhoodExit.entryPriceUsd,
        takeProfitPriceUsd: directRobinhoodExit.takeProfitPriceUsd, stopLossPriceUsd: directRobinhoodExit.stopLossPriceUsd,
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      });
      return { model: this.#model(), text: `Robinhood TP/SL ${directRobinhoodExit.inputSymbol} → ${directRobinhoodExit.outputSymbol} created. The local monitor will use fresh USD price evidence and a fresh Uniswap preflight only if a trigger is reached.`, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, toolsUsed: ["create_automation_strategy" as const], missionPreview: null, pumpTokenIntelligence: null, pumpDiscoverySnapshot: null, pumpTradePreview: null, limitOrderPreview: null, evmSwapProposal: null, automationStrategy: strategy };
    }
    const directSolanaSwap = parseDirectSolanaSwap(input.prompt, input.walletScope);
    if (directSolanaSwap !== null && input.mode === "mission" && input.walletAddress !== null && this.#readService !== null) {
      const settings = input.transactionSettings ?? this.#transactionSettings.get();
      const preview = await new MissionPolicyService(this.#readService, { get: () => settings }).preview({
        goal: `Swap ${directSolanaSwap.displayAmount} ${directSolanaSwap.inputSymbol} to ${directSolanaSwap.outputSymbol}`,
        walletAddress: input.walletAddress,
        inputMint: directSolanaSwap.inputMint,
        outputMint: directSolanaSwap.outputMint,
        inputAmount: directSolanaSwap.inputAmount,
        maxSlippageBps: settings.defaultSlippageBps,
        deadlineAt: new Date(Date.now() + Math.max(settings.defaultDeadlineMinutes, 5) * 60_000).toISOString(),
        stopConditions: ["Stop if policy, balance, quote, fee, or simulation check fails"],
      });
      return {
        model: this.#model(),
        text: preview.status === "ready-for-review"
          ? `Swap ${directSolanaSwap.inputSymbol} → ${directSolanaSwap.outputSymbol} is ready for deterministic preflight.`
          : `Swap ${directSolanaSwap.inputSymbol} → ${directSolanaSwap.outputSymbol} was blocked by local policy before signing. Review the failed check on the card; no transaction was signed or broadcast.`,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        toolsUsed: ["mission_contract_preview" as const],
        missionPreview: preview,
        pumpTokenIntelligence: null,
        pumpDiscoverySnapshot: null,
        pumpTradePreview: null,
        limitOrderPreview: null,
        evmSwapProposal: null,
      };
    }
    const directExit = parseDirectSolanaExit(input.prompt, input.walletScope);
    if (directExit !== null && input.sessionId && input.walletAddress && this.#automationManager !== null) {
      const strategy = this.#automationManager.createExit({
        sessionId: input.sessionId,
        walletAddress: input.walletAddress,
        inputMint: directExit.inputMint,
        outputMint: directExit.outputMint,
        amountRaw: directExit.amountRaw,
        entryPriceUsd: directExit.entryPriceUsd,
        takeProfitPriceUsd: directExit.takeProfitPriceUsd,
        stopLossPriceUsd: directExit.stopLossPriceUsd,
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      });
      const conditions = [
        directExit.takeProfitPriceUsd === null ? null : `TP $${directExit.takeProfitPriceUsd}`,
        directExit.stopLossPriceUsd === null ? null : `SL $${directExit.stopLossPriceUsd}`,
      ].filter((value): value is string => value !== null).join(", ");
      return {
        model: this.#model(),
        text: `TP/SL ${directExit.inputSymbol} → ${directExit.outputSymbol} created for ${directExit.displayAmount} ${directExit.inputSymbol}: ${conditions}. The local desktop monitor will prepare and dispatch the bounded Full Access swap only when a trigger is reached.`,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        toolsUsed: ["create_automation_strategy" as const],
        missionPreview: null,
        pumpTokenIntelligence: null,
        pumpDiscoverySnapshot: null,
        pumpTradePreview: null,
        limitOrderPreview: null,
        evmSwapProposal: null,
        automationStrategy: strategy,
      };
    }
    const directEvmSwap = parseDirectRobinhoodSwap(input.prompt, input.walletScope, input.evmChainKey);
    if (directEvmSwap !== null && input.mode === "mission" && input.walletAddress !== null && this.#evmSwapQuotes !== null) {
      const settings = input.transactionSettings ?? this.#transactionSettings.get();
      const proposal = await this.#evmSwapQuotes.quote({
        walletAddress: input.walletAddress,
        chainKey: "robinhood",
        sellToken: directEvmSwap.sellToken,
        buyToken: directEvmSwap.buyToken,
        sellAmount: directEvmSwap.sellAmount,
        slippageBps: Math.min(settings.defaultSlippageBps, settings.maxSlippageBps, 100),
      });
      return {
        model: this.#model(),
        text: `Robinhood ${directEvmSwap.sellSymbol} → ${directEvmSwap.buySymbol} quote prepared for review. No transaction was signed or submitted.`,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        toolsUsed: ["robinhood_swap_quote" as const],
        missionPreview: null,
        pumpTokenIntelligence: null,
        pumpDiscoverySnapshot: null,
        pumpTradePreview: null,
        limitOrderPreview: null,
        evmSwapProposal: proposal,
      };
    }
    const { pumpScope, intent, walletScope, sessionId, ...providerInput } = input;
    return { model: this.#model(), ...(await callOpenRouterChat({ apiKey, model: this.#model(), ...providerInput, tools: await this.#tools(input.walletAddress, input.mode, pumpScope, intent, walletScope, input.transactionSettings ?? this.#transactionSettings.get(), sessionId, input.permission) })) };
  }

  async #tools(walletAddress: string | null, mode: "agent" | "mission", pumpScope: PumpAiScope | undefined, intent: SessionIntent | undefined, walletScope: SessionWalletScope | undefined, transactionSettings: TransactionSettings, sessionId?: string, permission?: "restricted" | "full"): Promise<ReadOnlyAiTool[]> {
    const tools: ReadOnlyAiTool[] = [];
    if (walletScope === "evm" && mode === "mission" && walletAddress !== null && this.#evmSwapQuotes !== null) {
      tools.push({
        name: "robinhood_swap_quote",
        description: `Create a typed quote-only Robinhood Chain Mainnet EVM swap proposal for the selected encrypted wallet. Known release-pinned aliases are ETH=${UNISWAP_NATIVE_TOKEN_ADDRESS} (18 decimals) and USDG=${BRIDGE_ROBINHOOD_USDG_ADDRESS} (6 decimals); resolve those symbols without asking the user for contracts. Other assets require exact user-supplied contracts. The runtime verifies contracts against the active registry and applies the configured slippage policy. This never signs or broadcasts.`,
        parameters: {
          type: "object",
          properties: {
            sellToken: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
            buyToken: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
            sellAmount: { type: "string", pattern: "^[1-9][0-9]*$" },
            slippageBps: { type: "integer", minimum: 0, maximum: 100 },
          },
          required: ["sellToken", "buyToken", "sellAmount"],
          additionalProperties: false,
        },
        execute: async (argumentsValue) => {
          const quote = toolEvmSwapQuote(argumentsValue, transactionSettings);
          if (permission === "full" && sessionId && this.#fullAccessEvmAssets !== null) {
            this.#fullAccessEvmAssets.assertPairAuthorized(sessionId, quote.sellToken, quote.buyToken);
          }
          return this.#evmSwapQuotes!.quote({ walletAddress, chainKey: "robinhood", ...quote });
        },
      });
    }
    if (this.#readService === null) return tools;
    const missionPolicy = new MissionPolicyService(this.#readService, { get: () => transactionSettings });
    // Sessions created before the wallet-first migration have no walletScope.
    // Keep those historical sessions readable, but do not expose legacy Pump
    // trading tools in new Solana wallet sessions.
    const legacyUnscopedSession = walletScope === undefined && intent === undefined;
    const allowsSolanaRead = walletScope === "solana" || legacyUnscopedSession || intent === "research" || intent === "solana-swap" || intent === "legacy-pump-pilot";
    const allowsWalletRead = allowsSolanaRead && walletAddress !== null;
    const allowsJupiter = allowsSolanaRead && await this.#keystore.getSecret("jupiter-api-key") !== null;
    const allowsSwapPreview = allowsSolanaRead && mode === "mission" && pumpScope === undefined && walletAddress !== null && allowsJupiter;
    const allowsLegacyPump = pumpScope !== undefined || intent === "legacy-pump-pilot" || legacyUnscopedSession;
    if (allowsWalletRead) tools.push({
      name: "wallet_portfolio",
      description: "Read the selected registered Solana Mainnet wallet's finalized SOL and SPL-token balances. This never signs or sends a transaction.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => this.#readService!.portfolio(walletAddress),
    });
    if (allowsWalletRead) tools.push({
      name: "wallet_activity",
      description: "Read up to 10 recent finalized transaction signatures for the selected registered Solana Mainnet wallet, including success status, slot, time, memo, and explorer URL. This never signs or sends a transaction.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => this.#readService!.activity(walletAddress, 10),
    });
    if (allowsJupiter) tools.push({
      name: "jupiter_prices",
      description: "Read current USD price evidence for up to 20 Solana token mint addresses from Jupiter Price API V3.",
      parameters: { type: "object", properties: { mints: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 } }, required: ["mints"], additionalProperties: false },
      execute: async (argumentsValue) => {
        const mints = toolMints(argumentsValue);
        return Object.fromEntries(await this.#readService!.prices(mints));
      },
    });
    if (allowsSwapPreview) tools.push({
      name: "mission_contract_preview",
      description: "Create a deterministic, non-executable Mainnet swap mission preview for the selected wallet. Call only when token mints, raw amount, and intent came explicitly from the user. maxSlippageBps and deadlineAt may be omitted to use the user's local Transaction Settings defaults. Convert any user-supplied relative deadline using the exact current UTC timestamp in the system message; deadlineAt must be the resulting absolute ISO-8601 UTC timestamp. The runtime checks wallet registration, token pair, uint64 raw amount, maximum 300 bps guarded slippage, deadline, finalized balance, and a transaction-free Jupiter quote.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", minLength: 1, maxLength: 400 },
          inputMint: { type: "string", minLength: 32, maxLength: 44 },
          outputMint: { type: "string", minLength: 32, maxLength: 44 },
          inputAmount: { type: "string", pattern: "^[1-9][0-9]*$" },
          maxSlippageBps: { type: "integer", minimum: 0, maximum: 10000 },
          deadlineAt: { type: "string", format: "date-time", description: "Absolute ISO-8601 UTC timestamp calculated from the exact current UTC time in the system message when the user supplied a relative deadline." },
          stopConditions: { type: "array", items: { type: "string", minLength: 1, maxLength: 160 }, minItems: 1, maxItems: 8 },
        },
        required: ["goal", "inputMint", "outputMint", "inputAmount", "stopConditions"],
        additionalProperties: false,
      },
      execute: async (argumentsValue) => missionPolicy.preview({ walletAddress, ...toolMissionDraft(argumentsValue, transactionSettings) }),
    });
    if (allowsLegacyPump && mode === "mission" && (pumpScope === undefined || pumpScope.kind === "exact-mint") && walletAddress !== null && allowsJupiter) tools.push({
      name: "pump_trade_contract_preview",
      description: "Create a deterministic proposal-only Pump.fun/PumpSwap Mainnet buy or sell contract for one exact mint. Requires every explicit field from the user. The runtime verifies the registered wallet, official active Pump curve or canonical PumpSwap pool, mint/freeze authorities, top-ten concentration, finalized reserves, balance, maximum SOL exposure, guarded slippage, deadline, and a transaction-free route quote. This never builds, signs, or broadcasts.",
      parameters: { type: "object", properties: {
        goal: { type: "string", minLength: 1, maxLength: 400 }, side: { type: "string", enum: ["buy", "sell"] }, tokenMint: { type: "string", minLength: 32, maxLength: 44 },
        inputAmount: { type: "string", pattern: "^[1-9][0-9]*$" }, maxSolExposureLamports: { type: "string", pattern: "^[0-9]+$" }, minimumOutputAmount: { type: "string", pattern: "^[1-9][0-9]*$" },
        maxSlippageBps: { type: "integer", minimum: 0, maximum: 300 }, deadlineAt: { type: "string", format: "date-time" },
        stopConditions: { type: "array", items: { type: "string", minLength: 1, maxLength: 160 }, minItems: 1, maxItems: 8 },
      }, required: ["goal", "side", "tokenMint", "inputAmount", "maxSolExposureLamports", "minimumOutputAmount", "maxSlippageBps", "deadlineAt", "stopConditions"], additionalProperties: false },
      execute: async (argumentsValue) => {
        const draft = toolPumpTradeDraft(argumentsValue, transactionSettings);
        if (pumpScope?.kind === "exact-mint" && !pumpScope.allowedMints.includes(draft.tokenMint)) {
          throw new Error("Pump trade mint is outside this exact-mint session scope");
        }
        return missionPolicy.pumpTradePreview({ walletAddress, ...draft });
      },
    });
    if (allowsLegacyPump && mode === "mission" && pumpScope === undefined && walletAddress !== null && allowsJupiter) tools.push({
      name: "limit_order_contract_preview",
      description: "Create a deterministic, non-executable Jupiter Trigger V2 single limit-order preview for the selected Solana Mainnet wallet. Call only when the user explicitly supplied both mints, raw input amount, trigger mint, above/below condition, and USD trigger price. maxSlippageBps and expiresAt may be omitted to use the user's local Transaction Settings defaults. The runtime verifies the registered wallet, finalized balance, guarded 300 bps slippage, expiry, pair, and Jupiter's current $10 minimum. This tool never authenticates a Jupiter vault, deposits, signs, or creates an order.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", minLength: 1, maxLength: 400 }, inputMint: { type: "string", minLength: 32, maxLength: 44 }, outputMint: { type: "string", minLength: 32, maxLength: 44 },
          inputAmount: { type: "string", pattern: "^[1-9][0-9]*$" }, triggerMint: { type: "string", minLength: 32, maxLength: 44 }, triggerCondition: { type: "string", enum: ["above", "below"] },
          triggerPriceUsd: { type: "number", exclusiveMinimum: 0 }, maxSlippageBps: { type: "integer", minimum: 0, maximum: 10000 }, expiresAt: { type: "string", format: "date-time" },
        },
        required: ["goal", "inputMint", "outputMint", "inputAmount", "triggerMint", "triggerCondition", "triggerPriceUsd"], additionalProperties: false,
      },
      execute: async (argumentsValue) => missionPolicy.limitOrderPreview({ walletAddress, ...toolLimitOrderDraft(argumentsValue, transactionSettings) }),
    });
    if (allowsJupiter) tools.push({
      name: "jupiter_token_search",
      description: "Search Jupiter Tokens V2 by Solana mint, symbol, or name. Returns bounded token metadata, verification status, organic score, price, market cap, holder count, and tags as read-only evidence. Verification is not a guarantee of safety.",
      parameters: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 100 } }, required: ["query"], additionalProperties: false },
      execute: async (argumentsValue) => this.#readService!.tokenSearch(toolTokenQuery(argumentsValue)),
    });
    if (allowsLegacyPump && (pumpScope === undefined || pumpScope.allowedMints.length > 0)) tools.push({
      name: "pump_token_analysis",
      description: "Verify read-only Pump.fun and canonical PumpSwap evidence for one exact Solana mint using finalized RPC, official program ownership, deterministic PDAs, mint authorities, largest-account concentration, and a size-specific reserve-only buy/sell-back path. referenceBuyLamports is a SOL analysis amount, not authorization. This tool cannot buy, sell, sign, or broadcast.",
      parameters: {
        type: "object",
        properties: {
          mint: { type: "string", minLength: 32, maxLength: 44 },
          referenceBuyLamports: { type: "string", pattern: "^[1-9][0-9]*$" },
        },
        required: ["mint"],
        additionalProperties: false,
      },
      execute: async (argumentsValue) => {
        const analysis = toolPumpAnalysis(argumentsValue);
        if (pumpScope !== undefined && !pumpScope.allowedMints.includes(analysis.mint)) {
          throw new Error("Pump token mint is outside this session scope");
        }
        return this.#readService!.pumpTokenAnalysis(analysis.mint, analysis.referenceBuyLamports);
      },
    });
    if (allowsLegacyPump && pumpScope?.kind === "discovery") tools.push({
      name: "pump_recent_candidates",
      description: "Run one bounded manual scan of recent finalized transactions touching the official Pump program, then independently verify up to five exact mints with canonical Pump/PumpSwap state and deterministic research eligibility. This is incomplete read-only evidence, not a real-time index, ranking, recommendation, or authorization.",
      parameters: {
        type: "object",
        properties: {
          signatureLimit: { type: "integer", minimum: 1, maximum: 10 },
          candidateLimit: { type: "integer", minimum: 1, maximum: 5 },
          referenceBuyLamports: { type: "string", pattern: "^[1-9][0-9]*$" },
        },
        additionalProperties: false,
      },
      execute: async (argumentsValue) => this.#readService!.recentPumpCandidates({
        ...toolPumpDiscovery(argumentsValue),
        untilSignature: pumpScope.discoveryCursor ?? null,
      }),
    });
    if (allowsJupiter) tools.push({
      name: "jupiter_swap_quote",
      description: "Preview a current Jupiter Swap V2 route on Solana Mainnet. Requires input mint, output mint, and a positive amount in the input token's smallest unit. This deliberately omits the wallet/taker, returns no transaction, and can never sign or execute a swap.",
      parameters: {
        type: "object",
        properties: {
          inputMint: { type: "string", minLength: 32, maxLength: 44 },
          outputMint: { type: "string", minLength: 32, maxLength: 44 },
          amount: { type: "string", pattern: "^[1-9][0-9]*$" },
        },
        required: ["inputMint", "outputMint", "amount"],
        additionalProperties: false,
      },
      execute: async (argumentsValue) => {
        const quote = toolSwapQuote(argumentsValue);
        return this.#readService!.swapQuote(quote.inputMint, quote.outputMint, quote.amount);
      },
    });
    if (await this.#keystore.getSecret("tavily-api-key") !== null) tools.push({
      name: "tavily_search",
      description: "Search current public web and finance information using Tavily. Results are untrusted external evidence and may be incomplete.",
      parameters: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 400 } }, required: ["query"], additionalProperties: false },
      execute: async (argumentsValue) => this.#readService!.search(toolQuery(argumentsValue)),
    });
    if (this.#automationManager !== null) {
      const activeWalletAddress = walletAddress || "primary-wallet";
      tools.push({
        name: "create_automation_strategy",
        description: "Create an autonomous automation strategy such as DCA or Exit strategy (Take Profit / Stop Loss).",
        parameters: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["DCA", "EXIT"] },
            outputMint: { type: "string" },
            inputMint: { type: "string" },
            orderAmountRaw: { type: "string" },
            maximumTotalRaw: { type: "string" },
            intervalSeconds: { type: "number" },
            maximumExecutions: { type: "number" },
            amountRaw: { type: "string" },
            entryPriceUsd: { type: "number" },
            takeProfitPriceUsd: { type: "number" },
            stopLossPriceUsd: { type: "number" },
            trailingStopPercent: { type: "number" },
            expiresAt: { type: "string" },
          },
          required: ["kind"],
        },
        execute: async (argumentsValue: unknown) => {
          const args = normalizeAutomationArguments(argumentsValue);
          if (!sessionId) throw new Error("Automation requires an active session binding.");
          if (args.kind === "DCA") {
            const inputMint = args.inputMint || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const outputMint = args.outputMint || "So11111111111111111111111111111111111111112";
            return this.#automationManager!.createDca({
              sessionId,
              walletAddress: activeWalletAddress,
              inputMint,
              outputMint,
              orderAmountRaw: args.orderAmountRaw || "500000",
              maximumTotalRaw: args.maximumTotalRaw || "1000000",
              intervalSeconds: args.intervalSeconds || 600,
              maximumExecutions: args.maximumExecutions || 2,
              expiresAt: args.expiresAt || new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
            });
          } else {
            return this.#automationManager!.createExit({
              sessionId,
              walletAddress: activeWalletAddress,
              inputMint: args.inputMint || "So11111111111111111111111111111111111111112",
              outputMint: args.outputMint,
              amountRaw: args.amountRaw || "1000000",
              entryPriceUsd: args.entryPriceUsd || 100,
              takeProfitPriceUsd: args.takeProfitPriceUsd || null,
              stopLossPriceUsd: args.stopLossPriceUsd || null,
              trailingStopPercent: args.trailingStopPercent || null,
              expiresAt: args.expiresAt || new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
            });
          }
        },
      });
      tools.push({
        name: "cancel_automation_strategy",
        description: "Cancel an active automation strategy by strategy ID.",
        parameters: {
          type: "object",
          properties: {
            strategyId: { type: "string" },
          },
          required: ["strategyId"],
        },
        execute: async (args: any) => {
          return this.#automationManager!.setStatus(args.strategyId, "CANCEL");
        },
      });
    }
    return tools;
  }

  #model(): string {
    const value = this.#settings.getSetting(SETTING_KEY);
    if (typeof value !== "object" || value === null) return DEFAULT_OPENROUTER_MODEL;
    const model = (value as { model?: unknown }).model;
    return typeof model === "string" && model.length > 0 && model.length <= 192 ? model : DEFAULT_OPENROUTER_MODEL;
  }
}

function toolEvmSwapQuote(value: unknown, settings: TransactionSettings): { sellToken: string; buyToken: string; sellAmount: string; slippageBps: number } {
  if (typeof value !== "object" || value === null) throw new Error("EVM swap fields are required");
  const input = value as Record<string, unknown>;
  const slippageBps = input.slippageBps === undefined
    ? Math.min(settings.defaultSlippageBps, 100)
    : input.slippageBps;
  if (typeof input.sellToken !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(input.sellToken)
    || typeof input.buyToken !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(input.buyToken)
    || input.sellToken.toLowerCase() === input.buyToken.toLowerCase()
    || typeof input.sellAmount !== "string" || !/^[1-9]\d*$/u.test(input.sellAmount) || input.sellAmount.length > 78
    || typeof slippageBps !== "number" || !Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > Math.min(settings.maxSlippageBps, 100)) {
    throw new Error("EVM swap fields are invalid or exceed the configured slippage policy");
  }
  return { sellToken: input.sellToken, buyToken: input.buyToken, sellAmount: input.sellAmount, slippageBps };
}

type RobinhoodTokenSymbol = "ETH" | "USDG";

const ROBINHOOD_NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";
const ROBINHOOD_USDG_TOKEN = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

function parseDirectRobinhoodDca(prompt: string, walletScope: SessionWalletScope | undefined, chainKey: EvmChainKey | undefined): {
  inputToken: string; outputToken: string; inputSymbol: RobinhoodTokenSymbol; outputSymbol: RobinhoodTokenSymbol;
  orderAmountRaw: string; maximumTotalRaw: string; intervalSeconds: number; maximumExecutions: number; displayAmount: string;
} | null {
  if (walletScope !== "evm" || (chainKey ?? "robinhood") !== "robinhood" || !/\bdca\b/iu.test(prompt)) return null;
  const pair = /([0-9]+(?:[.,][0-9]+)?)\s*(usdg|eth)\s+(?:ke|to)\s+(usdg|eth)\b/iu.exec(prompt);
  const cadence = /(?:setiap|every)\s+([0-9]+)\s*(detik|seconds?|sec|s|menit|minutes?|min|m|jam|hours?|hr|h)\b/iu.exec(prompt);
  const cycles = /(?:selama\s+)?([0-9]+)\s*(?:kali|times?|cycles?|x)\b/iu.exec(prompt);
  if (!pair || !cadence || !cycles) return null;
  const inputSymbol = pair[2]!.toUpperCase() as RobinhoodTokenSymbol;
  const outputSymbol = pair[3]!.toUpperCase() as RobinhoodTokenSymbol;
  if (inputSymbol === outputSymbol) return null;
  const displayAmount = pair[1]!.replace(",", ".");
  const raw = decimalToRawAmount(displayAmount, inputSymbol === "ETH" ? 18 : 6);
  const unit = cadence[2]!.toLowerCase();
  const intervalSeconds = Number(cadence[1]) * (/^(?:jam|hours?|hr|h)$/u.test(unit) ? 3600 : /^(?:menit|minutes?|min|m)$/u.test(unit) ? 60 : 1);
  const maximumExecutions = Number(cycles[1]);
  if (raw === null || intervalSeconds < 60 || intervalSeconds > 31_536_000 || !Number.isInteger(maximumExecutions) || maximumExecutions < 1 || maximumExecutions > 365) return null;
  return { inputToken: inputSymbol === "ETH" ? ROBINHOOD_NATIVE_TOKEN : ROBINHOOD_USDG_TOKEN, outputToken: outputSymbol === "ETH" ? ROBINHOOD_NATIVE_TOKEN : ROBINHOOD_USDG_TOKEN, inputSymbol, outputSymbol, orderAmountRaw: raw, maximumTotalRaw: (BigInt(raw) * BigInt(maximumExecutions)).toString(), intervalSeconds, maximumExecutions, displayAmount };
}

function parseDirectRobinhoodExit(prompt: string, walletScope: SessionWalletScope | undefined, chainKey: EvmChainKey | undefined): {
  inputToken: string; outputToken: string; inputSymbol: RobinhoodTokenSymbol; outputSymbol: RobinhoodTokenSymbol; amountRaw: string;
  entryPriceUsd: number; takeProfitPriceUsd: number | null; stopLossPriceUsd: number | null;
} | null {
  if (walletScope !== "evm" || (chainKey ?? "robinhood") !== "robinhood" || !/\b(?:tp|take\s*profit|sl|stop\s*loss)\b/iu.test(prompt)) return null;
  const pair = /([0-9]+(?:[.,][0-9]+)?)\s*(usdg|eth)\s+(?:ke|to)\s+(usdg|eth)\b/iu.exec(prompt);
  const entry = /\bentry\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:usd|\$)?/iu.exec(prompt);
  const take = /\b(?:tp|take\s*profit)\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:usd|\$)?/iu.exec(prompt);
  const stop = /\b(?:sl|stop\s*loss)\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:usd|\$)?/iu.exec(prompt);
  if (!pair || !entry || (!take && !stop)) return null;
  const inputSymbol = pair[2]!.toUpperCase() as RobinhoodTokenSymbol;
  const outputSymbol = pair[3]!.toUpperCase() as RobinhoodTokenSymbol;
  if (inputSymbol === outputSymbol) return null;
  const entryPriceUsd = Number(entry[1]!.replace(",", "."));
  const takeProfitPriceUsd = take ? Number(take[1]!.replace(",", ".")) : null;
  const stopLossPriceUsd = stop ? Number(stop[1]!.replace(",", ".")) : null;
  const amountRaw = decimalToRawAmount(pair[1]!.replace(",", "."), inputSymbol === "ETH" ? 18 : 6);
  if (amountRaw === null || !Number.isFinite(entryPriceUsd) || entryPriceUsd <= 0 || (takeProfitPriceUsd !== null && takeProfitPriceUsd <= entryPriceUsd) || (stopLossPriceUsd !== null && (stopLossPriceUsd <= 0 || stopLossPriceUsd >= entryPriceUsd))) return null;
  return { inputToken: inputSymbol === "ETH" ? ROBINHOOD_NATIVE_TOKEN : ROBINHOOD_USDG_TOKEN, outputToken: outputSymbol === "ETH" ? ROBINHOOD_NATIVE_TOKEN : ROBINHOOD_USDG_TOKEN, inputSymbol, outputSymbol, amountRaw, entryPriceUsd, takeProfitPriceUsd, stopLossPriceUsd };
}

function isUnsupportedRobinhoodAutomationPrompt(
  prompt: string,
  walletScope: SessionWalletScope | undefined,
  chainKey: EvmChainKey | undefined,
): boolean {
  return walletScope === "evm"
    && (chainKey ?? "robinhood") === "robinhood"
    && /\b(?:dca|tp|take\s*profit|sl|stop\s*loss|trailing\s*stop)\b/iu.test(prompt);
}

const SOLANA_NATIVE_MINT = "So11111111111111111111111111111111111111112";
const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_JUP_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
type SupportedSolanaSymbol = "SOL" | "USDC" | "JUP";

function parseDirectSolanaDca(
  prompt: string,
  walletScope: SessionWalletScope | undefined,
): {
  inputMint: string;
  outputMint: string;
  inputSymbol: "SOL" | "USDC";
  outputSymbol: "SOL" | "USDC";
  orderAmountRaw: string;
  maximumTotalRaw: string;
  intervalSeconds: number;
  maximumExecutions: number;
  displayAmount: string;
} | null {
  if (walletScope !== "solana" || !/\bdca\b/iu.test(prompt)) return null;
  const pair = /([0-9]+(?:[.,][0-9]+)?)\s*(sol|usdc)\s+(?:ke|to)\s+(sol|usdc)\b/iu.exec(prompt);
  const cadence = /(?:setiap|every)\s+([0-9]+)\s*(detik|seconds?|sec|s|menit|minutes?|min|m|jam|hours?|hr|h)\b/iu.exec(prompt);
  const cycles = /(?:selama\s+)?([0-9]+)\s*(?:kali|times?|cycles?|x)\b/iu.exec(prompt);
  if (!pair || !cadence || !cycles) return null;
  const inputSymbol = pair[2]!.toUpperCase() as "SOL" | "USDC";
  const outputSymbol = pair[3]!.toUpperCase() as "SOL" | "USDC";
  if (inputSymbol === outputSymbol) return null;
  const displayAmount = pair[1]!.replace(",", ".");
  const orderAmountRaw = decimalToRawAmount(displayAmount, inputSymbol === "SOL" ? 9 : 6);
  const cadenceValue = Number(cadence[1]);
  const cadenceUnit = cadence[2]!.toLowerCase();
  const intervalMultiplier = /^(?:jam|hours?|hr|h)$/u.test(cadenceUnit)
    ? 3_600
    : /^(?:menit|minutes?|min|m)$/u.test(cadenceUnit)
      ? 60
      : 1;
  const intervalSeconds = cadenceValue * intervalMultiplier;
  const maximumExecutions = Number(cycles[1]);
  if (orderAmountRaw === null || !Number.isInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 31_536_000
    || !Number.isInteger(maximumExecutions) || maximumExecutions < 1 || maximumExecutions > 365) return null;
  return {
    inputMint: inputSymbol === "SOL" ? SOLANA_NATIVE_MINT : SOLANA_USDC_MINT,
    outputMint: outputSymbol === "SOL" ? SOLANA_NATIVE_MINT : SOLANA_USDC_MINT,
    inputSymbol,
    outputSymbol,
    orderAmountRaw,
    maximumTotalRaw: (BigInt(orderAmountRaw) * BigInt(maximumExecutions)).toString(),
    intervalSeconds,
    maximumExecutions,
    displayAmount,
  };
}

function parseDirectSolanaExit(
  prompt: string,
  walletScope: SessionWalletScope | undefined,
): {
  inputMint: string;
  outputMint: string;
  inputSymbol: "SOL" | "USDC";
  outputSymbol: "SOL" | "USDC";
  amountRaw: string;
  displayAmount: string;
  entryPriceUsd: number;
  takeProfitPriceUsd: number | null;
  stopLossPriceUsd: number | null;
} | null {
  if (walletScope !== "solana" || !/\b(?:tp|take\s*profit|sl|stop\s*loss)\b/iu.test(prompt)) return null;
  const pair = /([0-9]+(?:[.,][0-9]+)?)\s*(sol|usdc)\s+(?:ke|to)\s+(sol|usdc)\b/iu.exec(prompt);
  const entry = /\bentry\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:usd|\$)?/iu.exec(prompt);
  const take = /\b(?:tp|take\s*profit)\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:usd|\$)?/iu.exec(prompt);
  const stop = /\b(?:sl|stop\s*loss)\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:usd|\$)?/iu.exec(prompt);
  if (!pair || !entry || (!take && !stop)) return null;
  const inputSymbol = pair[2]!.toUpperCase() as "SOL" | "USDC";
  const outputSymbol = pair[3]!.toUpperCase() as "SOL" | "USDC";
  if (inputSymbol === outputSymbol) return null;
  const displayAmount = pair[1]!.replace(",", ".");
  const amountRaw = decimalToRawAmount(displayAmount, inputSymbol === "SOL" ? 9 : 6);
  const entryPriceUsd = Number(entry[1]!.replace(",", "."));
  const takeProfitPriceUsd = take ? Number(take[1]!.replace(",", ".")) : null;
  const stopLossPriceUsd = stop ? Number(stop[1]!.replace(",", ".")) : null;
  if (amountRaw === null || !Number.isFinite(entryPriceUsd) || entryPriceUsd <= 0
    || (takeProfitPriceUsd !== null && (!Number.isFinite(takeProfitPriceUsd) || takeProfitPriceUsd <= entryPriceUsd))
    || (stopLossPriceUsd !== null && (!Number.isFinite(stopLossPriceUsd) || stopLossPriceUsd <= 0 || stopLossPriceUsd >= entryPriceUsd))) return null;
  return {
    inputMint: inputSymbol === "SOL" ? SOLANA_NATIVE_MINT : SOLANA_USDC_MINT,
    outputMint: outputSymbol === "SOL" ? SOLANA_NATIVE_MINT : SOLANA_USDC_MINT,
    inputSymbol,
    outputSymbol,
    amountRaw,
    displayAmount,
    entryPriceUsd,
    takeProfitPriceUsd,
    stopLossPriceUsd,
  };
}

function parseDirectSolanaSwap(
  prompt: string,
  walletScope: SessionWalletScope | undefined,
): {
  inputMint: string;
  outputMint: string;
  inputSymbol: SupportedSolanaSymbol;
  outputSymbol: SupportedSolanaSymbol;
  inputAmount: string;
  displayAmount: string;
} | null {
  if (walletScope !== "solana" || /\bdca\b/iu.test(prompt)) return null;
  const match = /\b(?:swap|tukar)\s+([0-9]+(?:[.,][0-9]+)?)\s+(sol|usdc|jup)\s+(?:ke|to)\s+(sol|usdc|jup)\b/iu.exec(prompt);
  if (match === null) return null;
  const inputSymbol = match[2]!.toUpperCase() as SupportedSolanaSymbol;
  const outputSymbol = match[3]!.toUpperCase() as SupportedSolanaSymbol;
  if (inputSymbol === outputSymbol) return null;
  const displayAmount = match[1]!.replace(",", ".");
  const inputAmount = decimalToRawAmount(displayAmount, inputSymbol === "SOL" ? 9 : 6);
  if (inputAmount === null) return null;
  const mintFor = (symbol: SupportedSolanaSymbol) => symbol === "SOL"
    ? SOLANA_NATIVE_MINT
    : symbol === "USDC"
      ? SOLANA_USDC_MINT
      : SOLANA_JUP_MINT;
  return {
    inputMint: mintFor(inputSymbol),
    outputMint: mintFor(outputSymbol),
    inputSymbol,
    outputSymbol,
    inputAmount,
    displayAmount,
  };
}

function normalizeAutomationArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("Automation parameters are required");
  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...source };
  normalized.kind = source.kind ?? source.type;
  normalized.orderAmountRaw = source.orderAmountRaw ?? source.amount;
  normalized.maximumExecutions = source.maximumExecutions ?? source.count;
  if (source.intervalSeconds === undefined && typeof source.interval === "string") {
    const match = /^([1-9]\d*)\s*(s|m|h)$/iu.exec(source.interval.trim());
    if (match) {
      const multiplier = match[2]!.toLowerCase() === "h" ? 3_600 : match[2]!.toLowerCase() === "m" ? 60 : 1;
      normalized.intervalSeconds = Number(match[1]) * multiplier;
    }
  }
  if (normalized.maximumTotalRaw === undefined
    && typeof normalized.orderAmountRaw === "string" && /^[1-9]\d*$/u.test(normalized.orderAmountRaw)
    && (typeof normalized.maximumExecutions === "number" || typeof normalized.maximumExecutions === "string")) {
    const count = Number(normalized.maximumExecutions);
    if (Number.isInteger(count) && count > 0) normalized.maximumTotalRaw = (BigInt(normalized.orderAmountRaw) * BigInt(count)).toString();
  }
  if (typeof normalized.maximumExecutions === "string" && /^\d+$/u.test(normalized.maximumExecutions)) normalized.maximumExecutions = Number(normalized.maximumExecutions);
  if (typeof normalized.intervalSeconds === "string" && /^\d+$/u.test(normalized.intervalSeconds)) normalized.intervalSeconds = Number(normalized.intervalSeconds);
  return normalized;
}

function parseDirectRobinhoodSwap(
  prompt: string,
  walletScope: SessionWalletScope | undefined,
  chainKey: EvmChainKey | undefined,
): { sellToken: string; buyToken: string; sellAmount: string; sellSymbol: RobinhoodTokenSymbol; buySymbol: RobinhoodTokenSymbol } | null {
  if (walletScope !== "evm" || (chainKey ?? "robinhood") !== "robinhood") return null;
  const match = /\b(?:swap|tukar)\s+([0-9]+(?:[.,][0-9]+)?)\s+(eth|usdg)\s+(?:ke|to)\s+(eth|usdg)\b/iu.exec(prompt);
  if (match === null) return null;
  const sellSymbol = match[2]!.toUpperCase() as RobinhoodTokenSymbol;
  const buySymbol = match[3]!.toUpperCase() as RobinhoodTokenSymbol;
  if (sellSymbol === buySymbol) return null;
  const decimals = sellSymbol === "ETH" ? 18 : 6;
  const sellAmount = decimalToRawAmount(match[1]!.replace(",", "."), decimals);
  if (sellAmount === null) return null;
  return {
    sellToken: sellSymbol === "ETH" ? UNISWAP_NATIVE_TOKEN_ADDRESS : BRIDGE_ROBINHOOD_USDG_ADDRESS,
    buyToken: buySymbol === "ETH" ? UNISWAP_NATIVE_TOKEN_ADDRESS : BRIDGE_ROBINHOOD_USDG_ADDRESS,
    sellAmount,
    sellSymbol,
    buySymbol,
  };
}

function parseDirectRobinhoodBridge(
  prompt: string,
  walletScope: SessionWalletScope | undefined,
  chainKey: EvmChainKey | undefined,
): { amountRaw: string; minimumDestinationAmount: string; recipient: string; displayAmount: string } | null {
  if (walletScope !== "evm" || (chainKey ?? "robinhood") !== "robinhood") return null;
  if (!/\bbridge\b/iu.test(prompt) || !/\b(?:usdg)\b/iu.test(prompt) || !/\b(?:solana|sol)\b/iu.test(prompt)) return null;
  const amount = /\b([0-9]+(?:[.,][0-9]+)?)\s*usdg\b/iu.exec(prompt)?.[1]?.replace(",", ".") ?? null;
  const recipient = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/u.exec(prompt)?.[1] ?? null;
  if (amount === null || recipient === null) return null;
  const amountRaw = decimalToRawAmount(amount, 6);
  if (amountRaw === null) return null;
  // Cross-chain fees can materially exceed a same-chain swap fee for small
  // amounts. Keep the default bounded but conservative; Relay still rejects a
  // route below it and the exact quote is always displayed before dispatch.
  const requestedMinimum = /\b(?:minimum|min)\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:usdc)?\b/iu.exec(prompt)?.[1]?.replace(",", ".") ?? null;
  const minimumDestinationAmount = requestedMinimum === null
    ? ((BigInt(amountRaw) * 90n) / 100n).toString()
    : decimalToRawAmount(requestedMinimum, 6);
  if (minimumDestinationAmount === null || BigInt(minimumDestinationAmount) === 0n || BigInt(minimumDestinationAmount) > BigInt(amountRaw)) return null;
  return { amountRaw, minimumDestinationAmount, recipient, displayAmount: amount };
}

function parseDirectAuthorizedRobinhoodSwap(
  prompt: string,
  walletScope: SessionWalletScope | undefined,
  chainKey: EvmChainKey | undefined,
  sessionId: string,
  assets: FullAccessEvmAssetAuthorizationService,
): { sellToken: string; buyToken: string; sellAmount: string; sellSymbol: string; buySymbol: string } | null {
  if (walletScope !== "evm" || (chainKey ?? "robinhood") !== "robinhood") return null;
  const match = /\b(?:swap|tukar)\s+([0-9]+(?:[.,][0-9]+)?)\s+(eth|usdg|0x[0-9a-fA-F]{40})\s+(?:ke|to)\s+(eth|usdg|0x[0-9a-fA-F]{40})\b/iu.exec(prompt);
  if (match === null) return null;
  const resolve = (value: string) => value.toLowerCase() === "eth"
    ? assets.find(sessionId, UNISWAP_NATIVE_TOKEN_ADDRESS)
    : value.toLowerCase() === "usdg"
      ? assets.find(sessionId, BRIDGE_ROBINHOOD_USDG_ADDRESS)
      : assets.find(sessionId, value);
  const sell = resolve(match[2]!);
  const buy = resolve(match[3]!);
  if (sell === null || buy === null || sell.address === buy.address) return null;
  const sellAmount = decimalToRawAmount(match[1]!.replace(",", "."), sell.decimals);
  if (sellAmount === null) return null;
  return { sellToken: sell.address, buyToken: buy.address, sellAmount, sellSymbol: sell.symbol, buySymbol: buy.symbol };
}

function decimalToRawAmount(value: string, decimals: number): string | null {
  if (!/^\d+(?:\.\d+)?$/u.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) return null;
  const raw = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/u, "");
  return /^[1-9]\d*$/u.test(raw) ? raw : null;
}

function parseFullAccessAssetRequest(prompt: string): string | null {
  if (!/\b(?:authorize|authorise|allow|add|izinkan|tambahkan)\b/iu.test(prompt) || !/\b(?:asset|token|contract|kontrak)\b/iu.test(prompt)) return null;
  return /\b(0x[0-9a-fA-F]{40})\b/u.exec(prompt)?.[1] ?? null;
}

function parseFullAccessAssetConfirmation(prompt: string): string | null {
  return /^\s*AUTHORIZE\s+FULL\s+ACCESS\s+ASSET\s+([0-9a-f-]{36})\s*$/iu.exec(prompt)?.[1] ?? null;
}

function localChatResult(text: string, toolsUsed: ReadOnlyAiTool["name"][], evmAssetAuthorizationReview?: { id: string; address: string; symbol: string; decimals: number; verifiedAt: string; expiresAt: string }) {
  return {
    model: "local-policy",
    text,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    toolsUsed,
    missionPreview: null,
    pumpTokenIntelligence: null,
    pumpDiscoverySnapshot: null,
    pumpTradePreview: null,
    limitOrderPreview: null,
    evmSwapProposal: null,
    ...(evmAssetAuthorizationReview ? { evmAssetAuthorizationReview } : {}),
  };
}

function toolLimitOrderDraft(value: unknown, settings = DEFAULT_TRANSACTION_SETTINGS): { goal: string; inputMint: string; outputMint: string; inputAmount: string; triggerMint: string; triggerCondition: "above" | "below"; triggerPriceUsd: number; maxSlippageBps: number; expiresAt: string } {
  if (typeof value !== "object" || value === null) throw new Error("Limit order fields are required");
  const input = value as Record<string, unknown>;
  const maxSlippageBps = input.maxSlippageBps === undefined ? settings.defaultSlippageBps : input.maxSlippageBps;
  const expiresAt = input.expiresAt === undefined ? new Date(Date.now() + Math.max(settings.defaultDeadlineMinutes, 15) * 60_000).toISOString() : input.expiresAt;
  if (typeof input.goal !== "string" || input.goal.trim().length < 1 || input.goal.length > 400
    || typeof input.inputMint !== "string" || input.inputMint.length < 32 || input.inputMint.length > 44
    || typeof input.outputMint !== "string" || input.outputMint.length < 32 || input.outputMint.length > 44
    || typeof input.inputAmount !== "string" || !/^[1-9]\d*$/u.test(input.inputAmount) || input.inputAmount.length > 20
    || typeof input.triggerMint !== "string" || input.triggerMint.length < 32 || input.triggerMint.length > 44
    || (input.triggerCondition !== "above" && input.triggerCondition !== "below")
    || typeof input.triggerPriceUsd !== "number" || !Number.isFinite(input.triggerPriceUsd) || input.triggerPriceUsd <= 0
    || typeof maxSlippageBps !== "number" || !Number.isInteger(maxSlippageBps) || maxSlippageBps < 0 || maxSlippageBps > settings.maxSlippageBps
    || typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))) throw new Error("Limit order fields are invalid or exceed the configured maximum slippage");
  return { goal: input.goal.trim(), inputMint: input.inputMint, outputMint: input.outputMint, inputAmount: input.inputAmount, triggerMint: input.triggerMint, triggerCondition: input.triggerCondition, triggerPriceUsd: input.triggerPriceUsd, maxSlippageBps, expiresAt };
}

function toolMints(value: unknown): string[] {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { mints?: unknown }).mints)) throw new Error("Token mints are required");
  const mints = (value as { mints: unknown[] }).mints;
  if (mints.length < 1 || mints.length > 20 || mints.some((mint) => typeof mint !== "string" || mint.length < 32 || mint.length > 44)) throw new Error("Token mints are invalid");
  return mints as string[];
}

function toolQuery(value: unknown): string {
  if (typeof value !== "object" || value === null) throw new Error("Search query is required");
  const query = (value as { query?: unknown }).query;
  if (typeof query !== "string" || query.trim().length < 1 || query.length > 400) throw new Error("Search query is invalid");
  return query.trim();
}

function toolTokenQuery(value: unknown): string {
  if (typeof value !== "object" || value === null) throw new Error("Token search query is required");
  const query = (value as { query?: unknown }).query;
  if (typeof query !== "string" || query.trim().length < 1 || query.length > 100) throw new Error("Token search query is invalid");
  return query.trim();
}

function toolPumpAnalysis(value: unknown): { mint: string; referenceBuyLamports: string } {
  if (typeof value !== "object" || value === null) throw new Error("Pump token mint is required");
  const { mint, referenceBuyLamports } = value as { mint?: unknown; referenceBuyLamports?: unknown };
  if (typeof mint !== "string" || mint.length < 32 || mint.length > 44 || !/^[1-9A-HJ-NP-Za-km-z]+$/u.test(mint)) {
    throw new Error("Pump token mint is invalid");
  }
  const normalizedReference = referenceBuyLamports === undefined ? "1000000" : referenceBuyLamports;
  if (typeof normalizedReference !== "string" || !/^[1-9]\d*$/u.test(normalizedReference)) {
    throw new Error("Pump reference buy amount must be a positive lamport value");
  }
  return { mint, referenceBuyLamports: normalizedReference };
}

function toolPumpDiscovery(value: unknown): { signatureLimit?: number; candidateLimit?: number; referenceBuyLamports?: string } {
  if (typeof value !== "object" || value === null) throw new Error("Pump scanner parameters are invalid");
  const input = value as { signatureLimit?: unknown; candidateLimit?: unknown; referenceBuyLamports?: unknown };
  if (input.signatureLimit !== undefined && (typeof input.signatureLimit !== "number" || !Number.isInteger(input.signatureLimit) || input.signatureLimit < 1 || input.signatureLimit > 10)) {
    throw new Error("Pump scanner signature limit must be between 1 and 10");
  }
  if (input.candidateLimit !== undefined && (typeof input.candidateLimit !== "number" || !Number.isInteger(input.candidateLimit) || input.candidateLimit < 1 || input.candidateLimit > 5)) {
    throw new Error("Pump scanner candidate limit must be between 1 and 5");
  }
  if (input.referenceBuyLamports !== undefined && (typeof input.referenceBuyLamports !== "string" || !/^[1-9]\d*$/u.test(input.referenceBuyLamports))) {
    throw new Error("Pump scanner reference buy amount is invalid");
  }
  return {
    ...(input.signatureLimit === undefined ? {} : { signatureLimit: input.signatureLimit }),
    ...(input.candidateLimit === undefined ? {} : { candidateLimit: input.candidateLimit }),
    ...(input.referenceBuyLamports === undefined ? {} : { referenceBuyLamports: input.referenceBuyLamports }),
  };
}

function toolPumpTradeDraft(value: unknown, settings = DEFAULT_TRANSACTION_SETTINGS): { goal: string; side: "buy" | "sell"; tokenMint: string; inputAmount: string; maxSolExposureLamports: string; minimumOutputAmount: string; maxSlippageBps: number; deadlineAt: string; stopConditions: string[] } {
  if (typeof value !== "object" || value === null) throw new Error("Pump trade proposal fields are required");
  const input = value as Record<string, unknown>;
  const stopConditions = input.stopConditions;
  if (typeof input.goal !== "string" || input.goal.trim().length < 1 || input.goal.length > 400
    || (input.side !== "buy" && input.side !== "sell")
    || typeof input.tokenMint !== "string" || input.tokenMint.length < 32 || input.tokenMint.length > 44 || !/^[1-9A-HJ-NP-Za-km-z]+$/u.test(input.tokenMint)
    || typeof input.inputAmount !== "string" || !/^[1-9]\d*$/u.test(input.inputAmount) || input.inputAmount.length > 20
    || typeof input.maxSolExposureLamports !== "string" || !/^\d+$/u.test(input.maxSolExposureLamports) || input.maxSolExposureLamports.length > 20
    || typeof input.minimumOutputAmount !== "string" || !/^[1-9]\d*$/u.test(input.minimumOutputAmount) || input.minimumOutputAmount.length > 20
    || typeof input.maxSlippageBps !== "number" || !Number.isInteger(input.maxSlippageBps) || input.maxSlippageBps < 0 || input.maxSlippageBps > settings.maxSlippageBps
    || typeof input.deadlineAt !== "string" || !Number.isFinite(Date.parse(input.deadlineAt))
    || !Array.isArray(stopConditions) || stopConditions.length < 1 || stopConditions.length > 8 || stopConditions.some((condition) => typeof condition !== "string" || condition.trim().length < 1 || condition.length > 160)) {
    throw new Error("Pump trade proposal fields are invalid or exceed the configured maximum slippage");
  }
  return { goal: input.goal.trim(), side: input.side, tokenMint: input.tokenMint, inputAmount: input.inputAmount, maxSolExposureLamports: input.maxSolExposureLamports, minimumOutputAmount: input.minimumOutputAmount, maxSlippageBps: input.maxSlippageBps, deadlineAt: input.deadlineAt, stopConditions: stopConditions as string[] };
}

function toolSwapQuote(value: unknown): { inputMint: string; outputMint: string; amount: string } {
  if (typeof value !== "object" || value === null) throw new Error("Swap quote parameters are required");
  const input = value as { inputMint?: unknown; outputMint?: unknown; amount?: unknown };
  if (typeof input.inputMint !== "string" || input.inputMint.length < 32 || input.inputMint.length > 44
    || typeof input.outputMint !== "string" || input.outputMint.length < 32 || input.outputMint.length > 44
    || typeof input.amount !== "string" || !/^[1-9]\d*$/u.test(input.amount) || input.amount.length > 20) {
    throw new Error("Swap quote parameters are invalid");
  }
  return { inputMint: input.inputMint, outputMint: input.outputMint, amount: input.amount };
}

function toolMissionDraft(value: unknown, settings = DEFAULT_TRANSACTION_SETTINGS): { goal: string; inputMint: string; outputMint: string; inputAmount: string; maxSlippageBps: number; deadlineAt: string; stopConditions: string[] } {
  if (typeof value !== "object" || value === null) throw new Error("Mission contract fields are required");
  const input = value as Record<string, unknown>;
  const stopConditions = input.stopConditions;
  const maxSlippageBps = input.maxSlippageBps === undefined ? settings.defaultSlippageBps : input.maxSlippageBps;
  const deadlineAt = input.deadlineAt === undefined ? new Date(Date.now() + settings.defaultDeadlineMinutes * 60_000).toISOString() : input.deadlineAt;
  if (typeof input.goal !== "string" || input.goal.trim().length < 1 || input.goal.length > 400
    || typeof input.inputMint !== "string" || input.inputMint.length < 32 || input.inputMint.length > 44
    || typeof input.outputMint !== "string" || input.outputMint.length < 32 || input.outputMint.length > 44
    || typeof input.inputAmount !== "string" || !/^[1-9]\d*$/u.test(input.inputAmount) || input.inputAmount.length > 20
    || typeof maxSlippageBps !== "number" || !Number.isInteger(maxSlippageBps) || maxSlippageBps < 0 || maxSlippageBps > settings.maxSlippageBps
    || typeof deadlineAt !== "string" || !Number.isFinite(Date.parse(deadlineAt))
    || !Array.isArray(stopConditions) || stopConditions.length < 1 || stopConditions.length > 8
    || stopConditions.some((condition) => typeof condition !== "string" || condition.trim().length < 1 || condition.length > 160)) {
    throw new Error("Mission contract fields are invalid or exceed the configured maximum slippage");
  }
  return { goal: input.goal.trim(), inputMint: input.inputMint, outputMint: input.outputMint, inputAmount: input.inputAmount, maxSlippageBps, deadlineAt, stopConditions: stopConditions as string[] };
}
