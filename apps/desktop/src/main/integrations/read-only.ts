import { createHash } from "node:crypto";

import { address as solanaAddress, getAddressDecoder, getAddressEncoder, getBase58Encoder, getProgramDerivedAddress } from "@solana/kit";
import { PumpDiscoverySnapshotSchema, PumpTokenIntelligenceSchema, type JupiterSwapQuotePreview, type PortfolioAsset, type PortfolioSnapshot, type PumpDiscoverySnapshot, type PumpTokenIntelligence, type WalletActivitySnapshot } from "@silfable/contracts";

import type { SecretName } from "../storage/keystore.js";
import { evaluatePumpResearchEligibility } from "../pump/research-eligibility.js";
import { writeSafeAuditLog } from "../telemetry/safe-audit-log.js";
import { ProviderCircuitBreaker } from "./provider-circuit-breaker.js";
import { ProviderRateBudget } from "./provider-rate-budget.js";

const MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_SWAP_PROGRAM_ID = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const PUMP_BONDING_CURVE_DISCRIMINATOR = createHash("sha256").update("account:BondingCurve").digest().subarray(0, 8);
const PUMP_GLOBAL_DISCRIMINATOR = createHash("sha256").update("account:Global").digest().subarray(0, 8);
const PUMP_SWAP_POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]);
const PUMP_INSTRUCTION_DISCRIMINATORS = new Map<string, { signal: PumpActivitySignal; mintAccountIndex: number }>([
  ["24,30,200,40,5,28,7,119", { signal: "token-created", mintAccountIndex: 0 }],
  ["102,6,61,18,1,218,235,234", { signal: "curve-buy", mintAccountIndex: 2 }],
  ["56,252,116,8,158,223,205,95", { signal: "curve-buy", mintAccountIndex: 2 }],
  ["51,230,133,164,1,127,131,173", { signal: "curve-sell", mintAccountIndex: 2 }],
  ["155,234,231,146,236,158,162,30", { signal: "migration-observed", mintAccountIndex: 2 }],
]);
const PUMP_EVENT_DISCRIMINATORS = new Map<string, { signal: PumpActivitySignal; mintOffset: number | "after-create-strings" }>([
  ["27,114,169,77,222,235,99,118", { signal: "create-event", mintOffset: "after-create-strings" }],
  ["189,219,127,211,78,230,97,238", { signal: "trade-event", mintOffset: 8 }],
  ["95,114,97,156,212,46,152,8", { signal: "complete-event", mintOffset: 40 }],
  ["189,233,93,185,92,148,234,148", { signal: "migration-event", mintOffset: 40 }],
]);
const TOKEN_PROGRAMS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
] as const;
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/u;
const RAW_AMOUNT_PATTERN = /^[1-9]\d*$/u;
const MAX_U64 = 18_446_744_073_709_551_615n;

type Fetch = typeof globalThis.fetch;
type Sleep = (delayMs: number) => Promise<void>;
type SecretReader = { getSecret(name: SecretName): Promise<string | null> };
type WalletRegistry = { listWallets(): Promise<Array<{ address: string; primary: boolean }>> };

type PricePoint = { usdPrice: number; createdAt: string | null; blockId: number | null };
type RawPortfolio = {
  address: string;
  slot: number;
  solLamports: string;
  assets: Array<{ mint: string; amount: string; decimals: number }>;
};
export type UnsignedSwapOrder = { transaction: string; requestId: string; lastValidBlockHeight: string | null; outAmount: string; router: string; mode: string };
export type RawSimulationResult = {
  slot: number;
  err: unknown;
  logs: string[];
  unitsConsumed: number | null;
  feeLamports: number | null;
  accountCreationFundingLamports: number | null;
  estimatedWalletOutflowLamports: string | null;
};
export type JupiterExecutionResult = { status: "Success" | "Failed"; signature: string | null; code: number | null; totalInputAmount: string | null; totalOutputAmount: string | null; error: string | null };
export type SignatureVerification = {
  state: "finalized" | "confirmed" | "processed" | "not-found" | "failed";
  slot: number | null;
  error: string | null;
  verifiedAt: string;
};
export type TransactionSettlement = {
  slot: number;
  feeLamports: number;
  walletPreLamports: string;
  walletPostLamports: string;
};
export type PumpTransactionSettlement = TransactionSettlement & {
  tokenMint: string;
  tokenPreRawAmount: string;
  tokenPostRawAmount: string;
  tokenRawDelta: string;
  accountCreationFundingLamports: number;
};
export type PumpLaunchTransactionSettlement = TransactionSettlement & {
  mintAddress: string;
  accountCreationFundingLamports: number;
  walletOutflowLamports: string;
};

export type TavilyEvidence = {
  query: string;
  answer: string | null;
  results: Array<{ title: string; url: string; content: string; score: number }>;
};

export type JupiterTokenEvidence = {
  query: string;
  tokens: Array<{
    mint: string;
    name: string;
    symbol: string;
    decimals: number;
    isVerified: boolean;
    organicScore: number | null;
    organicScoreLabel: string | null;
    usdPrice: number | null;
    marketCapUsd: number | null;
    holderCount: number | null;
    tags: string[];
  }>;
  verifiedAt: string;
};

export type PumpTokenEvidence = PumpTokenIntelligence;
export type PumpActivitySignal = PumpDiscoverySnapshot["candidates"][number]["signals"][number];

export class MainnetReadService {
  readonly #fetch: Fetch;
  readonly #sleep: Sleep;
  #rpcUrl: string;
  readonly #secrets: SecretReader;
  readonly #wallets: WalletRegistry;
  readonly #jupiterCircuit: ProviderCircuitBreaker;
  readonly #jupiterRateBudget: ProviderRateBudget;
  readonly #solanaRpcRateBudget: ProviderRateBudget;

  constructor(input: {
    secrets: SecretReader;
    wallets: WalletRegistry;
    fetch?: Fetch;
    rpcUrl?: string;
    sleep?: Sleep;
    jupiterCircuit?: ProviderCircuitBreaker;
    jupiterRateBudget?: ProviderRateBudget;
    solanaRpcRateBudget?: ProviderRateBudget;
  }) {
    this.#secrets = input.secrets;
    this.#wallets = input.wallets;
    this.#fetch = input.fetch ?? globalThis.fetch;
    this.#sleep = input.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.#rpcUrl = input.rpcUrl ?? MAINNET_RPC_URL;
    this.#jupiterCircuit = input.jupiterCircuit ?? new ProviderCircuitBreaker({
      name: "Jupiter provider",
      failureThreshold: 3,
      cooldownMs: 30_000,
    });
    this.#jupiterRateBudget = input.jupiterRateBudget ?? new ProviderRateBudget({
      name: "Jupiter provider",
      limit: 120,
      windowMs: 60_000,
    });
    this.#solanaRpcRateBudget = input.solanaRpcRateBudget ?? new ProviderRateBudget({
      name: "Solana RPC",
      limit: 240,
      windowMs: 60_000,
    });
    if (!this.#rpcUrl.startsWith("https://")) throw new Error("Mainnet RPC must use HTTPS");
  }

  updateRpcUrl(url?: string): void {
    const nextUrl = url || MAINNET_RPC_URL;
    if (!nextUrl.startsWith("https://")) throw new Error("Mainnet RPC must use HTTPS");
    this.#rpcUrl = nextUrl;
  }

  async health(): Promise<"healthy" | "degraded" | "offline"> {
    try {
      const result = await this.#rpc("getHealth", []);
      return result === "ok" ? "healthy" : "degraded";
    } catch {
      return "offline";
    }
  }

  async portfolio(address: string): Promise<PortfolioSnapshot> {
    await this.#assertRegisteredWallet(address);
    const raw = await this.#readPortfolio(address);
    const apiKey = await this.#secrets.getSecret("jupiter-api-key");
    const mints = [SOL_MINT, ...raw.assets.map((asset) => asset.mint)].slice(0, 100);
    const prices = apiKey === null ? new Map<string, PricePoint>() : await this.prices(mints).catch(() => new Map<string, PricePoint>());
    const solBalance = amountToUi(raw.solLamports, 9);
    const solUsdPrice = prices.get(SOL_MINT)?.usdPrice ?? null;
    const assets: PortfolioAsset[] = raw.assets.slice(0, 100).map((asset) => {
      const uiAmount = amountToUi(asset.amount, asset.decimals);
      const usdPrice = prices.get(asset.mint)?.usdPrice ?? null;
      return { ...asset, uiAmount, usdPrice, usdValue: multiplyUsd(uiAmount, usdPrice) };
    });
    const values = [multiplyUsd(solBalance, solUsdPrice), ...assets.map((asset) => asset.usdValue)].filter((value): value is number => value !== null);
    return {
      address,
      slot: raw.slot,
      solBalance,
      solUsdPrice,
      totalUsd: values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0),
      assets,
      verifiedAt: new Date().toISOString(),
    };
  }

  async activity(address: string, limit = 10): Promise<WalletActivitySnapshot> {
    await this.#assertRegisteredWallet(address);
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("Activity limit is invalid");
    const body = await this.#rpc("getSignaturesForAddress", [address, { commitment: "finalized", limit }]);
    if (!Array.isArray(body)) throw new Error("Solana returned invalid wallet activity");
    const entries = body.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const value = entry as { signature?: unknown; slot?: unknown; err?: unknown; blockTime?: unknown; memo?: unknown };
      if (typeof value.signature !== "string" || !SIGNATURE_PATTERN.test(value.signature)
        || typeof value.slot !== "number" || !Number.isSafeInteger(value.slot) || value.slot < 0) return [];
      const blockTime = typeof value.blockTime === "number" && Number.isSafeInteger(value.blockTime) && value.blockTime >= 0 && value.blockTime <= 10_000_000_000
        ? new Date(value.blockTime * 1_000).toISOString()
        : null;
      return [{
        signature: value.signature,
        slot: value.slot,
        status: value.err === null || value.err === undefined ? "success" as const : "failed" as const,
        blockTime,
        memo: typeof value.memo === "string" ? value.memo.slice(0, 280) : null,
        explorerUrl: `https://explorer.solana.com/tx/${value.signature}`,
      }];
    }).slice(0, limit);
    return { address, entries, verifiedAt: new Date().toISOString() };
  }

  async prices(mints: string[]): Promise<Map<string, PricePoint>> {
    return await this.#withJupiterCircuit(async () => {
      const unique = [...new Set(mints)].filter((mint) => ADDRESS_PATTERN.test(mint)).slice(0, 100);
      if (unique.length === 0) return new Map();
      const apiKey = await this.#secrets.getSecret("jupiter-api-key");
      if (apiKey === null) throw new Error("Jupiter is not configured");
      const response = await this.#fetch(`https://api.jup.ag/price/v3?ids=${encodeURIComponent(unique.join(","))}`, {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      const body: unknown = await response.json();
      if (!response.ok || typeof body !== "object" || body === null || Array.isArray(body)) throw new Error(`Jupiter price request failed (${response.status})`);
      const prices = new Map<string, PricePoint>();
      for (const mint of unique) {
        const entry = (body as Record<string, unknown>)[mint];
        if (typeof entry !== "object" || entry === null) continue;
        const value = entry as { usdPrice?: unknown; createdAt?: unknown; blockId?: unknown };
        if (typeof value.usdPrice !== "number" || !Number.isFinite(value.usdPrice) || value.usdPrice < 0) continue;
        prices.set(mint, {
          usdPrice: value.usdPrice,
          createdAt: typeof value.createdAt === "string" ? value.createdAt.slice(0, 64) : null,
          blockId: typeof value.blockId === "number" && Number.isInteger(value.blockId) && value.blockId >= 0 ? value.blockId : null,
        });
      }
      return prices;
    });
  }

  async swapQuote(inputMint: string, outputMint: string, amount: string): Promise<JupiterSwapQuotePreview> {
    return await this.#withJupiterCircuit(async () => this.#swapQuote(inputMint, outputMint, amount));
  }

  async #swapQuote(inputMint: string, outputMint: string, amount: string): Promise<JupiterSwapQuotePreview> {
    validateSwapInput(inputMint, outputMint, amount);
    const apiKey = await this.#secrets.getSecret("jupiter-api-key");
    if (apiKey === null) throw new Error("Jupiter is not configured");
    const query = new URLSearchParams({ inputMint, outputMint, amount });
    const response = await this.#fetch(`https://api.jup.ag/swap/v2/order?${query.toString()}`, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== "object" || body === null || Array.isArray(body)) throw new Error(`Jupiter swap quote failed (${response.status})`);
    const value = body as {
      transaction?: unknown;
      outAmount?: unknown;
      router?: unknown;
      mode?: unknown;
      feeBps?: unknown;
      feeMint?: unknown;
    };
    if (value.transaction !== null) throw new Error("Jupiter returned an unexpected transaction for a quote-only request");
    if (typeof value.outAmount !== "string" || !/^\d+$/u.test(value.outAmount)
      || typeof value.router !== "string" || value.router.length < 1 || value.router.length > 64
      || typeof value.mode !== "string" || value.mode.length < 1 || value.mode.length > 32) {
      throw new Error("Jupiter returned an invalid swap quote");
    }
    const feeBps = typeof value.feeBps === "number" && Number.isInteger(value.feeBps) && value.feeBps >= 0 && value.feeBps <= 10_000
      ? value.feeBps
      : null;
    const feeMint = typeof value.feeMint === "string" && ADDRESS_PATTERN.test(value.feeMint) ? value.feeMint : null;
    return { inputMint, outputMint, inAmount: amount, outAmount: value.outAmount, router: value.router, mode: value.mode, feeBps, feeMint, quoteOnly: true, verifiedAt: new Date().toISOString() };
  }

  async buildUnsignedSwapOrder(
    inputMint: string,
    outputMint: string,
    amount: string,
    taker: string,
    slippageBps: number,
    priority?: "economy" | "standard" | "fast"
  ): Promise<UnsignedSwapOrder> {
    return await this.#withJupiterCircuit(async () => this.#buildUnsignedSwapOrder(
      inputMint,
      outputMint,
      amount,
      taker,
      slippageBps,
      priority,
    ));
  }

  async #buildUnsignedSwapOrder(
    inputMint: string,
    outputMint: string,
    amount: string,
    taker: string,
    slippageBps: number,
    priority?: "economy" | "standard" | "fast",
  ): Promise<UnsignedSwapOrder> {
    validateSwapInput(inputMint, outputMint, amount);
    if (!ADDRESS_PATTERN.test(taker)) throw new Error("Swap taker is invalid");
    await this.#assertRegisteredWallet(taker);
    if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 300) throw new Error("Swap slippage is outside the guarded limit");
    const apiKey = await this.#secrets.getSecret("jupiter-api-key");
    if (apiKey === null) throw new Error("Jupiter is not configured");
    const query = new URLSearchParams({ inputMint, outputMint, amount, taker, slippageBps: String(slippageBps) });
    if (priority && ["economy", "standard", "fast"].includes(priority)) {
      query.set("priorityLevel", priority);
    }
    const response = await this.#fetch(`https://api.jup.ag/swap/v2/order?${query.toString()}`, {
      headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(15_000),
    });
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== "object" || body === null || Array.isArray(body)) throw new Error(`Jupiter transaction preview failed (${response.status})`);
    const value = body as { transaction?: unknown; requestId?: unknown; lastValidBlockHeight?: unknown; outAmount?: unknown; router?: unknown; mode?: unknown };
    if (typeof value.transaction !== "string" || value.transaction.length < 4 || value.transaction.length > 2_000
      || typeof value.requestId !== "string" || value.requestId.length < 1 || value.requestId.length > 200
      || typeof value.outAmount !== "string" || !/^\d+$/u.test(value.outAmount)
      || typeof value.router !== "string" || value.router.length < 1 || value.router.length > 64
      || typeof value.mode !== "string" || value.mode.length < 1 || value.mode.length > 32) throw new Error("Jupiter returned an invalid unsigned transaction preview");
    validateBase64Transaction(value.transaction);
    const lastValidBlockHeight = typeof value.lastValidBlockHeight === "string" && /^\d+$/u.test(value.lastValidBlockHeight)
      ? value.lastValidBlockHeight
      : typeof value.lastValidBlockHeight === "number" && Number.isSafeInteger(value.lastValidBlockHeight) && value.lastValidBlockHeight >= 0
        ? String(value.lastValidBlockHeight)
        : null;
    return { transaction: value.transaction, requestId: value.requestId, lastValidBlockHeight, outAmount: value.outAmount, router: value.router, mode: value.mode };
  }

  async simulateUnsignedTransaction(
    transaction: string,
    walletScope?: { walletAddress: string; solInputLamports: string | null },
  ): Promise<RawSimulationResult> {
    validateBase64Transaction(transaction);
    if (
      walletScope !== undefined
      && (
        !ADDRESS_PATTERN.test(walletScope.walletAddress)
        || (walletScope.solInputLamports !== null && !/^\d+$/u.test(walletScope.solInputLamports))
      )
    ) {
      throw new Error("Simulation wallet scope is invalid");
    }
    const walletBefore = walletScope === undefined
      ? null
      : parseContextValue(await this.#rpc("getBalance", [
        walletScope.walletAddress,
        { commitment: "confirmed" },
      ]));
    if (
      walletBefore !== null
      && (
        typeof walletBefore.value !== "number"
        || !Number.isSafeInteger(walletBefore.value)
        || walletBefore.value < 0
      )
    ) {
      throw new Error("Solana returned an invalid pre-simulation wallet balance");
    }
    const simulationConfig = {
      encoding: "base64" as const,
      commitment: "confirmed" as const,
      replaceRecentBlockhash: true,
      sigVerify: false,
      innerInstructions: true,
      ...(walletScope === undefined || walletBefore === null
        ? {}
        : {
          minContextSlot: walletBefore.slot,
          accounts: {
            encoding: "base64" as const,
            addresses: [walletScope.walletAddress],
          },
        }),
    };
    const body = await this.#rpc("simulateTransaction", [transaction, simulationConfig]);
    if (typeof body !== "object" || body === null) throw new Error("Solana returned an invalid simulation result");
    const envelope = body as { context?: { slot?: unknown }; value?: unknown };
    if (typeof envelope.context?.slot !== "number" || !Number.isSafeInteger(envelope.context.slot) || envelope.context.slot < 0
      || typeof envelope.value !== "object" || envelope.value === null) throw new Error("Solana returned an invalid simulation result");
    const value = envelope.value as {
      err?: unknown;
      logs?: unknown;
      unitsConsumed?: unknown;
      fee?: unknown;
      accounts?: unknown;
    };
    const allLogs = Array.isArray(value.logs) ? value.logs.filter((log): log is string => typeof log === "string") : [];
    const logs = (allLogs.length <= 20 ? allLogs : [...allLogs.slice(0, 10), ...allLogs.slice(-10)]).map((log) => log.slice(0, 240));
    const feeLamports = typeof value.fee === "number" && Number.isSafeInteger(value.fee) && value.fee >= 0
      ? value.fee
      : null;
    const simulationError = value.err ?? null;
    const walletImpact = walletScope === undefined || walletBefore === null || simulationError !== null
      ? { accountCreationFundingLamports: null, estimatedWalletOutflowLamports: null }
      : simulatedWalletImpact(
        walletBefore.value as number,
        value.accounts,
        feeLamports,
        walletScope.solInputLamports,
      );
    return {
      slot: envelope.context.slot,
      err: simulationError,
      logs,
      unitsConsumed: typeof value.unitsConsumed === "number" && Number.isSafeInteger(value.unitsConsumed) && value.unitsConsumed >= 0 ? value.unitsConsumed : null,
      feeLamports,
      ...walletImpact,
    };
  }

  async executeSignedSwap(transaction: string, requestId: string, lastValidBlockHeight: string | null): Promise<JupiterExecutionResult> {
    return await this.#withJupiterCircuit(async () => this.#executeSignedSwap(transaction, requestId, lastValidBlockHeight));
  }

  async #executeSignedSwap(transaction: string, requestId: string, lastValidBlockHeight: string | null): Promise<JupiterExecutionResult> {
    validateBase64Transaction(transaction);
    if (requestId.length < 1 || requestId.length > 200) throw new Error("Jupiter request identifier is invalid");
    const apiKey = await this.#secrets.getSecret("jupiter-api-key");
    if (apiKey === null) throw new Error("Jupiter is not configured");
    const response = await this.#fetch("https://api.jup.ag/swap/v2/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ signedTransaction: transaction, requestId, ...(lastValidBlockHeight === null ? {} : { lastValidBlockHeight }) }),
      signal: AbortSignal.timeout(60_000),
    });
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== "object" || body === null || Array.isArray(body)) throw new Error(`Jupiter execution status is unknown (${response.status})`);
    const value = body as Record<string, unknown>;
    if (value.status !== "Success" && value.status !== "Failed") throw new Error("Jupiter returned an invalid execution result");
    const signature = typeof value.signature === "string" && SIGNATURE_PATTERN.test(value.signature) ? value.signature : null;
    return {
      status: value.status,
      signature,
      code: typeof value.code === "number" && Number.isInteger(value.code) ? value.code : null,
      totalInputAmount: typeof value.totalInputAmount === "string" && /^\d+$/u.test(value.totalInputAmount) ? value.totalInputAmount : null,
      totalOutputAmount: typeof value.totalOutputAmount === "string" && /^\d+$/u.test(value.totalOutputAmount) ? value.totalOutputAmount : null,
      error: typeof value.error === "string" && value.error.length > 0 ? value.error.slice(0, 500) : null,
    };
  }

  async verifyTransactionSignature(signature: string): Promise<SignatureVerification> {
    if (!SIGNATURE_PATTERN.test(signature)) throw new Error("Transaction signature is invalid");
    const body = await this.#rpc("getSignatureStatuses", [[signature], { searchTransactionHistory: true }]);
    if (typeof body !== "object" || body === null) throw new Error("Solana returned an invalid signature status");
    const envelope = body as { value?: unknown };
    if (!Array.isArray(envelope.value) || envelope.value.length !== 1) throw new Error("Solana returned an invalid signature status");
    const entry = envelope.value[0];
    const verifiedAt = new Date().toISOString();
    if (entry === null) return { state: "not-found", slot: null, error: null, verifiedAt };
    if (typeof entry !== "object") throw new Error("Solana returned an invalid signature status");
    const value = entry as { slot?: unknown; err?: unknown; confirmationStatus?: unknown };
    if (typeof value.slot !== "number" || !Number.isSafeInteger(value.slot) || value.slot < 0) throw new Error("Solana returned an invalid signature slot");
    if (value.err !== null && value.err !== undefined) {
      return { state: "failed", slot: value.slot, error: safeRpcError(value.err), verifiedAt };
    }
    if (value.confirmationStatus !== "processed" && value.confirmationStatus !== "confirmed" && value.confirmationStatus !== "finalized") {
      throw new Error("Solana returned an invalid confirmation status");
    }
    return { state: value.confirmationStatus, slot: value.slot, error: null, verifiedAt };
  }

  async transactionSettlement(signature: string, walletAddress: string): Promise<TransactionSettlement> {
    if (!SIGNATURE_PATTERN.test(signature)) throw new Error("Transaction signature is invalid");
    if (!ADDRESS_PATTERN.test(walletAddress)) throw new Error("Wallet address is invalid");
    const body = await this.#rpc("getTransaction", [signature, { commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
    if (typeof body !== "object" || body === null) throw new Error("Confirmed transaction details are not available yet");
    const value = body as { slot?: unknown; meta?: unknown; transaction?: unknown };
    const meta = value.meta as { fee?: unknown; preBalances?: unknown; postBalances?: unknown } | null;
    const transaction = value.transaction as { message?: { accountKeys?: unknown } } | null;
    if (typeof value.slot !== "number" || !Number.isSafeInteger(value.slot) || value.slot < 0 || meta === null || typeof meta !== "object"
      || typeof meta.fee !== "number" || !Number.isSafeInteger(meta.fee) || meta.fee < 0
      || !Array.isArray(meta.preBalances) || !Array.isArray(meta.postBalances) || !Array.isArray(transaction?.message?.accountKeys)) {
      throw new Error("Solana returned invalid transaction settlement details");
    }
    const keys = transaction.message.accountKeys.map((entry) => typeof entry === "string" ? entry : typeof entry === "object" && entry !== null && typeof (entry as { pubkey?: unknown }).pubkey === "string" ? (entry as { pubkey: string }).pubkey : "");
    const index = keys.indexOf(walletAddress);
    const pre = meta.preBalances[index];
    const post = meta.postBalances[index];
    if (index < 0 || typeof pre !== "number" || !Number.isSafeInteger(pre) || pre < 0 || typeof post !== "number" || !Number.isSafeInteger(post) || post < 0) {
      throw new Error("Selected wallet settlement was not present in the confirmed transaction");
    }
    return { slot: value.slot, feeLamports: meta.fee, walletPreLamports: String(pre), walletPostLamports: String(post) };
  }

  async pumpTransactionSettlement(signature: string, walletAddress: string, tokenMint: string): Promise<PumpTransactionSettlement> {
    if (!SIGNATURE_PATTERN.test(signature)) throw new Error("Transaction signature is invalid");
    if (!ADDRESS_PATTERN.test(walletAddress) || !ADDRESS_PATTERN.test(tokenMint)) throw new Error("Pump settlement scope is invalid");
    const body = await this.#rpc("getTransaction", [signature, { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
    if (typeof body !== "object" || body === null) throw new Error("Finalized Pump transaction details are not available yet");
    const value = body as { slot?: unknown; meta?: unknown; transaction?: unknown };
    const meta = value.meta as { fee?: unknown; preBalances?: unknown; postBalances?: unknown; preTokenBalances?: unknown; postTokenBalances?: unknown } | null;
    const transaction = value.transaction as { message?: { accountKeys?: unknown } } | null;
    if (!Number.isSafeInteger(value.slot) || (value.slot as number) < 1 || meta === null || typeof meta !== "object"
      || !Number.isSafeInteger(meta.fee) || (meta.fee as number) < 0 || !Array.isArray(meta.preBalances) || !Array.isArray(meta.postBalances)
      || !Array.isArray(meta.preTokenBalances) || !Array.isArray(meta.postTokenBalances) || !Array.isArray(transaction?.message?.accountKeys)) {
      throw new Error("Solana returned invalid finalized Pump settlement details");
    }
    const preBalances = meta.preBalances as unknown[];
    const postBalances = meta.postBalances as unknown[];
    const keys = transaction.message.accountKeys.map((entry) => typeof entry === "string" ? entry : typeof entry === "object" && entry !== null && typeof (entry as { pubkey?: unknown }).pubkey === "string" ? (entry as { pubkey: string }).pubkey : "");
    const walletIndex = keys.indexOf(walletAddress);
    const walletPre = preBalances[walletIndex];
    const walletPost = postBalances[walletIndex];
    if (walletIndex < 0 || !Number.isSafeInteger(walletPre) || (walletPre as number) < 0 || !Number.isSafeInteger(walletPost) || (walletPost as number) < 0) {
      throw new Error("Selected wallet settlement was not present in the finalized Pump transaction");
    }
    const preTokens = parseScopedTokenBalances(meta.preTokenBalances, walletAddress, tokenMint, keys.length);
    const postTokens = parseScopedTokenBalances(meta.postTokenBalances, walletAddress, tokenMint, keys.length);
    const preAmount = [...preTokens.values()].reduce((total, entry) => total + entry, 0n);
    const postAmount = [...postTokens.values()].reduce((total, entry) => total + entry, 0n);
    const funding = [...postTokens.keys()].filter((index) => !preTokens.has(index)).reduce((total, index) => {
      const pre = preBalances[index];
      const post = postBalances[index];
      if (!Number.isSafeInteger(pre) || !Number.isSafeInteger(post) || (pre as number) < 0 || (post as number) < (pre as number)) {
        throw new Error("Pump token-account creation funding is invalid");
      }
      return total + (post as number) - (pre as number);
    }, 0);
    return {
      slot: value.slot as number,
      feeLamports: meta.fee as number,
      walletPreLamports: String(walletPre),
      walletPostLamports: String(walletPost),
      tokenMint,
      tokenPreRawAmount: preAmount.toString(),
      tokenPostRawAmount: postAmount.toString(),
      tokenRawDelta: (postAmount - preAmount).toString(),
      accountCreationFundingLamports: funding,
    };
  }

  async tokenSearch(query: string): Promise<JupiterTokenEvidence> {
    const normalized = query.trim().slice(0, 100);
    if (normalized.length < 1) throw new Error("Token search query is empty");
    const apiKey = await this.#secrets.getSecret("jupiter-api-key");
    if (apiKey === null) throw new Error("Jupiter is not configured");
    const response = await this.#fetch(`https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(normalized)}`, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    const body: unknown = await response.json();
    if (!response.ok || !Array.isArray(body)) throw new Error(`Jupiter token search failed (${response.status})`);
    const tokens = body.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const value = entry as Record<string, unknown>;
      if (typeof value.id !== "string" || !ADDRESS_PATTERN.test(value.id)
        || typeof value.name !== "string" || value.name.length < 1
        || typeof value.symbol !== "string" || value.symbol.length < 1
        || typeof value.decimals !== "number" || !Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 18) return [];
      return [{
        mint: value.id,
        name: value.name.slice(0, 120),
        symbol: value.symbol.slice(0, 32),
        decimals: value.decimals,
        isVerified: value.isVerified === true,
        organicScore: boundedNumber(value.organicScore, 0, 100),
        organicScoreLabel: typeof value.organicScoreLabel === "string" ? value.organicScoreLabel.slice(0, 32) : null,
        usdPrice: boundedNumber(value.usdPrice, 0, Number.MAX_VALUE),
        marketCapUsd: boundedNumber(value.mcap, 0, Number.MAX_VALUE),
        holderCount: boundedInteger(value.holderCount, 0, Number.MAX_SAFE_INTEGER),
        tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 12).map((tag) => tag.slice(0, 48)) : [],
      }];
    }).slice(0, 20);
    return { query: normalized, tokens, verifiedAt: new Date().toISOString() };
  }

  async recentPumpCandidates(input: { signatureLimit?: number; candidateLimit?: number; referenceBuyLamports?: string; untilSignature?: string | null } = {}): Promise<PumpDiscoverySnapshot> {
    const signatureLimit = input.signatureLimit ?? 6;
    const candidateLimit = input.candidateLimit ?? 3;
    const referenceBuyLamports = input.referenceBuyLamports ?? "1000000";
    if (!Number.isInteger(signatureLimit) || signatureLimit < 1 || signatureLimit > 10) throw new Error("Pump scanner signature limit must be between 1 and 10");
    if (!Number.isInteger(candidateLimit) || candidateLimit < 1 || candidateLimit > 5) throw new Error("Pump scanner candidate limit must be between 1 and 5");
    if (!/^[1-9]\d*$/u.test(referenceBuyLamports)) throw new Error("Pump scanner reference buy amount is invalid");
    if (input.untilSignature !== undefined && input.untilSignature !== null && !SIGNATURE_PATTERN.test(input.untilSignature)) throw new Error("Pump scanner cursor signature is invalid");
    const signatureConfig = {
      commitment: "finalized" as const,
      limit: signatureLimit,
      ...(input.untilSignature ? { until: input.untilSignature } : {}),
    };
    const signatureBody = await this.#rpc("getSignaturesForAddress", [PUMP_PROGRAM_ID, signatureConfig]);
    if (!Array.isArray(signatureBody)) throw new Error("Solana returned invalid Pump program activity");
    const signatures = signatureBody.flatMap((entry) => parseFinalizedPumpSignature(entry)).slice(0, signatureLimit);
    const observed = new Map<string, { sourceSignature: string; sourceSlot: number; sourceBlockTime: string | null; signals: PumpActivitySignal[] }>();
    let decodedEvents = 0;
    for (const signature of signatures) {
      if (observed.size >= candidateLimit * 4) break;
      const transaction = await this.#rpc("getTransaction", [signature.signature, { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]).catch(() => null);
      const mintSignals = extractPumpMintSignals(transaction);
      const eventSignals = extractPumpEventSignals(transaction);
      decodedEvents += [...eventSignals.values()].reduce((total, signals) => total + signals.length, 0);
      for (const mint of extractPumpCandidateMints(transaction)) {
        if (!observed.has(mint)) observed.set(mint, {
          sourceSignature: signature.signature,
          sourceSlot: signature.slot,
          sourceBlockTime: signature.blockTime,
          signals: [...new Set<PumpActivitySignal>([
            ...(mintSignals.get(mint) ?? ["token-balance-observed"]),
            ...(eventSignals.get(mint) ?? []),
          ])],
        });
      }
    }
    const candidates: PumpDiscoverySnapshot["candidates"] = [];
    for (const [mint, source] of observed) {
      if (candidates.length >= candidateLimit) break;
      const intelligence = await this.pumpTokenAnalysis(mint, referenceBuyLamports).catch(() => null);
      if (intelligence === null || (!intelligence.accountVerified && !intelligence.pumpSwapPoolVerified)) continue;
      const lifecycleSignal: PumpActivitySignal = intelligence.venue === "pumpswap-migrated"
        ? "pumpswap-migrated"
        : intelligence.venue === "bonding-curve-complete"
          ? "curve-complete"
          : "curve-active";
      candidates.push({ mint, ...source, signals: [...new Set([...source.signals, lifecycleSignal])], intelligence });
    }
    return PumpDiscoverySnapshotSchema.parse({
      source: "recent-program-transactions",
      programId: PUMP_PROGRAM_ID,
      commitment: "finalized",
      scannedSignatures: signatures.length,
      observedMints: observed.size,
      decodedEvents,
      cursorSignature: signatures[0]?.signature ?? input.untilSignature ?? null,
      candidates,
      executionAllowed: false,
      disclosure: "A bounded incremental scan of finalized transactions touching the official Pump program. Instruction signals use the pinned Pump SDK IDL and lifecycle signals use independently verified account state. Coverage is incomplete and candidates are not recommendations, guarantees of safety, or executable authority.",
      scannedAt: new Date().toISOString(),
    });
  }

  async pumpTokenAnalysis(mint: string, referenceBuyLamports = "1000000"): Promise<PumpTokenEvidence> {
    if (!ADDRESS_PATTERN.test(mint)) throw new Error("Pump token mint is invalid");
    if (!/^[1-9]\d*$/u.test(referenceBuyLamports)) throw new Error("Pump reference buy amount is invalid");
    const referenceBuyInput = BigInt(referenceBuyLamports);
    if (referenceBuyInput < 10_000n || referenceBuyInput > 10_000_000_000n) {
      throw new Error("Pump reference buy amount must be between 0.00001 and 10 SOL");
    }
    const encoder = getAddressEncoder();
    const [bondingCurveAddress] = await getProgramDerivedAddress({
      programAddress: solanaAddress(PUMP_PROGRAM_ID),
      seeds: [new TextEncoder().encode("bonding-curve"), encoder.encode(solanaAddress(mint))],
    });
    const [globalAddress] = await getProgramDerivedAddress({
      programAddress: solanaAddress(PUMP_PROGRAM_ID),
      seeds: [new TextEncoder().encode("global")],
    });
    const [poolAuthority] = await getProgramDerivedAddress({
      programAddress: solanaAddress(PUMP_PROGRAM_ID),
      seeds: [new TextEncoder().encode("pool-authority"), encoder.encode(solanaAddress(mint))],
    });
    const [pumpSwapPoolAddress] = await getProgramDerivedAddress({
      programAddress: solanaAddress(PUMP_SWAP_PROGRAM_ID),
      seeds: [new TextEncoder().encode("pool"), new Uint8Array([0, 0]), encoder.encode(poolAuthority), encoder.encode(solanaAddress(mint)), encoder.encode(solanaAddress(SOL_MINT))],
    });
    const [curveResponse, poolResponse, mintResponse, largestResponse, globalResponse] = await Promise.all([
      this.#rpc("getAccountInfo", [bondingCurveAddress, { commitment: "finalized", encoding: "base64" }]).then(parseContextValue),
      this.#rpc("getAccountInfo", [pumpSwapPoolAddress, { commitment: "finalized", encoding: "base64" }]).then(parseContextValue),
      this.#rpc("getAccountInfo", [mint, { commitment: "finalized", encoding: "jsonParsed" }]).then(parseContextValue),
      this.#rpc("getTokenLargestAccounts", [mint, { commitment: "finalized" }]).then(parseContextValue),
      this.#rpc("getAccountInfo", [globalAddress, { commitment: "finalized", encoding: "base64" }]).then(parseContextValue),
    ]);
    const token = parseMintEvidence(mintResponse.value);
    const global = parsePumpGlobal(globalResponse.value);
    const pool = parseCanonicalPumpSwapPool(poolResponse.value, { poolAuthority: String(poolAuthority), mint });
    const [bondingCurveTokenAccount] = await getProgramDerivedAddress({
      programAddress: solanaAddress(ASSOCIATED_TOKEN_PROGRAM_ID),
      seeds: [
        encoder.encode(bondingCurveAddress),
        encoder.encode(solanaAddress(token.program)),
        encoder.encode(solanaAddress(mint)),
      ],
    });
    const concentration = parseLargestAccountConcentration(
      largestResponse.value,
      token.supply,
      new Set([String(bondingCurveTokenAccount), ...(pool === null ? [] : [pool.baseTokenAccount])]),
    );
    const liquidity = pool === null ? null : await Promise.all([
      this.#rpc("getTokenAccountBalance", [pool.baseTokenAccount, { commitment: "finalized" }]).then(parseContextValue),
      this.#rpc("getTokenAccountBalance", [pool.quoteTokenAccount, { commitment: "finalized" }]).then(parseContextValue),
    ]).then(([baseBalance, quoteBalance]) => {
      const baseAmount = parseTokenBalanceAmount(baseBalance.value);
      const quoteAmount = parseTokenBalanceAmount(quoteBalance.value);
      const effectiveQuoteAmount = BigInt(quoteAmount) + pool.virtualQuoteReserves;
      if (effectiveQuoteAmount < 0n) throw new Error("PumpSwap effective quote reserves are invalid");
      return { baseAmount, quoteAmount, effectiveQuoteAmount: String(effectiveQuoteAmount), slot: Math.max(baseBalance.slot, quoteBalance.slot) };
    });
    const poolVerified = pool !== null;
    const slot = Math.max(curveResponse.slot, poolResponse.slot, mintResponse.slot, largestResponse.slot, globalResponse.slot, liquidity?.slot ?? 0);
    const base = {
      mint,
      programId: PUMP_PROGRAM_ID,
      pumpSwapProgramId: PUMP_SWAP_PROGRAM_ID,
      bondingCurveAddress: String(bondingCurveAddress),
      pumpSwapPoolAddress: String(pumpSwapPoolAddress),
      pumpSwapPoolVerified: poolVerified,
      tokenProgram: token.program,
      decimals: token.decimals,
      mintSupply: token.supply,
      mintAuthority: token.mintAuthority,
      freezeAuthority: token.freezeAuthority,
      top10ConcentrationPercent: concentration,
      poolBaseTokenAccount: pool?.baseTokenAccount ?? null,
      poolQuoteTokenAccount: pool?.quoteTokenAccount ?? null,
      poolBaseReserves: liquidity?.baseAmount ?? null,
      poolQuoteReserves: liquidity?.quoteAmount ?? null,
      pumpSwapVirtualQuoteReserves: pool === null ? null : String(pool.virtualQuoteReserves),
      pumpSwapEffectiveQuoteReserves: liquidity?.effectiveQuoteAmount ?? null,
      slot,
      verifiedAt: new Date().toISOString(),
    } as const;
    const authorityWarnings = tokenRiskWarnings(token, concentration);
    if (curveResponse.value === null) return withPumpResearchEligibility({
      ...base,
      venue: poolVerified ? "pumpswap-migrated" : "unknown",
      bondingCurveExists: false,
      accountVerified: false,
      complete: null,
      virtualTokenReserves: null,
      virtualQuoteReserves: null,
      realTokenReserves: null,
      realQuoteReserves: null,
      tokenTotalSupply: null,
      metrics: pumpMetrics({ token, global, curve: null, pool: liquidity, referenceBuyInput }),
      warnings: [...authorityWarnings,
        poolVerified
          ? "A canonical PumpSwap pool was independently verified, but pool identity alone does not prove liquidity, sellability, or token safety."
          : "No Pump bonding-curve account or canonical PumpSwap pool was found. A missing curve does not prove migration or safety, and this mint is not verified as a Pump trading venue.",
        "No Pump.fun buy or sell transaction is authorized by this read-only analysis.",
      ],
    });
    if (typeof curveResponse.value !== "object") throw new Error("Solana returned an invalid Pump bonding-curve account");
    const account = curveResponse.value as { owner?: unknown; data?: unknown };
    if (account.owner !== PUMP_PROGRAM_ID) throw new Error("Canonical Pump bonding-curve PDA is not owned by the official Pump program");
    if (!Array.isArray(account.data) || typeof account.data[0] !== "string" || account.data[1] !== "base64") {
      throw new Error("Solana returned invalid Pump bonding-curve data");
    }
    const bytes = decodeCanonicalBase64(account.data[0]);
    if (bytes.length < 49 || !bytes.subarray(0, 8).equals(PUMP_BONDING_CURVE_DISCRIMINATOR)) {
      throw new Error("Pump bonding-curve discriminator is invalid");
    }
    const complete = bytes[48] === 1;
    const curve = {
      virtualTokenReserves: bytes.readBigUInt64LE(8),
      virtualQuoteReserves: bytes.readBigUInt64LE(16),
      realTokenReserves: bytes.readBigUInt64LE(24),
      realQuoteReserves: bytes.readBigUInt64LE(32),
      tokenTotalSupply: bytes.readBigUInt64LE(40),
      quoteMint: pumpCurveQuoteMint(bytes),
      complete,
    };
    return withPumpResearchEligibility({
      ...base,
      venue: poolVerified ? "pumpswap-migrated" : complete ? "bonding-curve-complete" : "bonding-curve-active",
      bondingCurveExists: true,
      accountVerified: true,
      complete,
      virtualTokenReserves: String(curve.virtualTokenReserves),
      virtualQuoteReserves: String(curve.virtualQuoteReserves),
      realTokenReserves: String(curve.realTokenReserves),
      realQuoteReserves: String(curve.realQuoteReserves),
      tokenTotalSupply: String(curve.tokenTotalSupply),
      metrics: pumpMetrics({ token, global, curve, pool: liquidity, referenceBuyInput }),
      warnings: [...authorityWarnings,
        "Canonical program ownership and curve state do not prove token quality, liquidity, sellability, or creator intent.",
        poolVerified
          ? "The canonical PumpSwap pool is verified; reserve liquidity and a fresh sell-path quote are still required before any proposal."
          : complete
          ? "The curve reports complete, but no canonical PumpSwap pool was verified; trading must remain blocked."
          : "The bonding curve is active, but direct Pump buy and sell execution is not enabled yet.",
        "Pump.fun-origin tokens are highly speculative. This evidence never authorizes a transaction.",
      ],
    });
  }

  async search(query: string): Promise<TavilyEvidence> {
    const normalized = query.trim().slice(0, 400);
    if (normalized.length === 0) throw new Error("Search query is empty");
    const apiKey = await this.#secrets.getSecret("tavily-api-key");
    if (apiKey === null) throw new Error("Tavily is not configured");
    const response = await this.#fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: normalized, search_depth: "basic", topic: "finance", include_answer: "basic", include_raw_content: false, max_results: 5 }),
      signal: AbortSignal.timeout(20_000),
    });
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== "object" || body === null) throw new Error(`Tavily search failed (${response.status})`);
    const value = body as { answer?: unknown; results?: unknown };
    const results = Array.isArray(value.results) ? value.results.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const result = entry as { title?: unknown; url?: unknown; content?: unknown; score?: unknown };
      if (typeof result.title !== "string" || typeof result.url !== "string" || !result.url.startsWith("https://")) return [];
      return [{
        title: result.title.slice(0, 240),
        url: result.url.slice(0, 2_048),
        content: typeof result.content === "string" ? result.content.slice(0, 2_000) : "",
        score: typeof result.score === "number" && Number.isFinite(result.score) ? Math.max(0, Math.min(1, result.score)) : 0,
      }];
    }).slice(0, 5) : [];
    return { query: normalized, answer: typeof value.answer === "string" ? value.answer.slice(0, 4_000) : null, results };
  }

  async #readPortfolio(address: string): Promise<RawPortfolio> {
    if (!ADDRESS_PATTERN.test(address)) throw new Error("Invalid Solana wallet address");
    const [balanceBody, ...tokenBodies] = await Promise.all([
      this.#rpc("getBalance", [address, { commitment: "finalized" }]),
      ...TOKEN_PROGRAMS.map((programId) => this.#rpc("getTokenAccountsByOwner", [address, { programId }, { commitment: "finalized", encoding: "jsonParsed" }])),
    ]);
    const balance = parseContextValue(balanceBody);
    if (typeof balance.value !== "number" || !Number.isSafeInteger(balance.value) || balance.value < 0) throw new Error("Solana returned an invalid balance");
    const aggregate = new Map<string, { amount: bigint; decimals: number }>();
    let slot = balance.slot;
    for (const body of tokenBodies) {
      const tokenResponse = parseContextValue(body);
      slot = Math.max(slot, tokenResponse.slot);
      if (!Array.isArray(tokenResponse.value)) throw new Error("Solana returned invalid token accounts");
      for (const entry of tokenResponse.value) {
        const parsed = parseTokenAccount(entry);
        if (parsed === null || parsed.amount === 0n) continue;
        const current = aggregate.get(parsed.mint);
        if (current && current.decimals !== parsed.decimals) throw new Error("Token decimals changed within one snapshot");
        aggregate.set(parsed.mint, { amount: (current?.amount ?? 0n) + parsed.amount, decimals: parsed.decimals });
      }
    }
    return {
      address,
      slot,
      solLamports: String(balance.value),
      assets: [...aggregate.entries()].map(([mint, value]) => ({ mint, amount: String(value.amount), decimals: value.decimals })).slice(0, 100),
    };
  }

  async #assertRegisteredWallet(address: string): Promise<void> {
    const wallets = await this.#wallets.listWallets();
    if (!wallets.some((wallet) => wallet.address === address)) throw new Error("Wallet is not registered on this device");
  }

  async pumpLaunchTransactionSettlement(
    signature: string,
    walletAddress: string,
    mintAddress: string,
  ): Promise<PumpLaunchTransactionSettlement> {
    if (!SIGNATURE_PATTERN.test(signature)) throw new Error("Transaction signature is invalid");
    if (!ADDRESS_PATTERN.test(walletAddress) || !ADDRESS_PATTERN.test(mintAddress)) {
      throw new Error("Token Launch settlement scope is invalid");
    }
    const body = await this.#rpc("getTransaction", [signature, {
      commitment: "finalized",
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
    }]);
    if (typeof body !== "object" || body === null) {
      throw new Error("Finalized Token Launch transaction details are not available yet");
    }
    const value = body as { slot?: unknown; meta?: unknown; transaction?: unknown; blockTime?: unknown };
    const meta = value.meta as { err?: unknown; fee?: unknown; preBalances?: unknown; postBalances?: unknown } | null;
    const transaction = value.transaction as { message?: { accountKeys?: unknown } } | null;
    if (
      !Number.isSafeInteger(value.slot)
      || (value.slot as number) < 1
      || meta === null
      || typeof meta !== "object"
      || meta.err !== null
      || !Number.isSafeInteger(meta.fee)
      || (meta.fee as number) < 0
      || !Array.isArray(meta.preBalances)
      || !Array.isArray(meta.postBalances)
      || !Array.isArray(transaction?.message?.accountKeys)
      || meta.preBalances.length !== meta.postBalances.length
      || meta.preBalances.length !== transaction.message.accountKeys.length
    ) {
      throw new Error("Solana returned invalid finalized Token Launch settlement details");
    }
    const keys = transaction.message.accountKeys.map((entry) => typeof entry === "string"
      ? entry
      : typeof entry === "object" && entry !== null && typeof (entry as { pubkey?: unknown }).pubkey === "string"
        ? (entry as { pubkey: string }).pubkey
        : "");
    const walletIndex = keys.indexOf(walletAddress);
    const mintIndex = keys.indexOf(mintAddress);
    const preBalances = meta.preBalances as unknown[];
    const postBalances = meta.postBalances as unknown[];
    const walletPre = preBalances[walletIndex];
    const walletPost = postBalances[walletIndex];
    const mintPre = preBalances[mintIndex];
    const mintPost = postBalances[mintIndex];
    if (
      walletIndex < 0
      || mintIndex < 0
      || !Number.isSafeInteger(walletPre)
      || (walletPre as number) < 0
      || !Number.isSafeInteger(walletPost)
      || (walletPost as number) < 0
      || !Number.isSafeInteger(mintPre)
      || (mintPre as number) !== 0
      || !Number.isSafeInteger(mintPost)
      || (mintPost as number) <= 0
      || (walletPost as number) > (walletPre as number)
    ) {
      throw new Error("Finalized Token Launch settlement does not prove creator outflow and a newly funded mint");
    }
    let accountCreationFundingLamports = 0;
    for (let index = 0; index < preBalances.length; index += 1) {
      if (index === walletIndex) continue;
      const pre = preBalances[index];
      const post = postBalances[index];
      if (!Number.isSafeInteger(pre) || !Number.isSafeInteger(post) || (pre as number) < 0 || (post as number) < 0) {
        throw new Error("Token Launch account funding evidence is invalid");
      }
      if ((pre as number) === 0 && (post as number) > 0) {
        accountCreationFundingLamports += post as number;
      }
    }
    if (!Number.isSafeInteger(accountCreationFundingLamports)) {
      throw new Error("Token Launch account funding exceeds the safe integer range");
    }
    return {
      slot: value.slot as number,
      feeLamports: meta.fee as number,
      walletPreLamports: String(walletPre),
      walletPostLamports: String(walletPost),
      mintAddress,
      accountCreationFundingLamports,
      walletOutflowLamports: String((walletPre as number) - (walletPost as number)),
    };
  }

  async #withJupiterCircuit<T>(operation: () => Promise<T>): Promise<T> {
    // Budget rejection happens before circuit accounting because it is a local
    // safety decision, not evidence that the provider failed.
    try {
      this.#jupiterRateBudget.consume();
    } catch (error) {
      writeSafeAuditLog("provider_budget_blocked", {
        operation: "jupiter_request",
        outcome: "blocked",
        code: "RATE_BUDGET",
      });
      throw error;
    }
    this.#jupiterCircuit.assertAvailable();
    try {
      const result = await operation();
      this.#jupiterCircuit.recordSuccess();
      return result;
    } catch (error) {
      this.#jupiterCircuit.recordFailure();
      throw error;
    }
  }

  async #rpc(method: string, params: unknown[]): Promise<unknown> {
    const isBroadcast = method === "sendTransaction";
    const maxRetries = isBroadcast ? 0 : 3;
    let delayMs = 500;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        try {
          this.#solanaRpcRateBudget.consume();
        } catch (error) {
          writeSafeAuditLog("provider_budget_blocked", {
            operation: "solana_rpc_request",
            outcome: "blocked",
            code: "RATE_BUDGET",
          });
          throw error;
        }
        const response = await this.#fetch(this.#rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
          signal: AbortSignal.timeout(15_000),
        });
        const body: unknown = await response.json();
        if (!response.ok || typeof body !== "object" || body === null) {
          if (attempt < maxRetries && (response.status === 429 || response.status >= 500)) {
            await this.#sleep(delayMs);
            delayMs *= 2;
            continue;
          }
          throw new Error(`Solana RPC failed (${response.status})`);
        }
        const envelope = body as { result?: unknown; error?: unknown };
        if (envelope.error !== undefined || envelope.result === undefined) throw new Error("Solana RPC returned an error");
        return envelope.result;
      } catch (err) {
        if (attempt < maxRetries && err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError" || err.message.includes("fetch failed"))) {
          await this.#sleep(delayMs);
          delayMs *= 2;
          continue;
        }
        throw err;
      }
    }
    throw new Error("Solana RPC failed after retries");
  }
}

function parseContextValue(body: unknown): { slot: number; value: unknown } {
  if (typeof body !== "object" || body === null) throw new Error("Solana RPC context is invalid");
  const value = body as { context?: { slot?: unknown }; value?: unknown };
  const slot = value.context?.slot;
  if (typeof slot !== "number" || !Number.isSafeInteger(slot) || slot < 0 || !("value" in value)) throw new Error("Solana RPC context is invalid");
  return { slot, value: value.value };
}

function parseTokenAccount(entry: unknown): { mint: string; amount: bigint; decimals: number } | null {
  if (typeof entry !== "object" || entry === null) return null;
  const data = (entry as { account?: { data?: unknown } }).account?.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const info = (data as { parsed?: { info?: unknown } }).parsed?.info;
  if (typeof info !== "object" || info === null) return null;
  const value = info as { mint?: unknown; tokenAmount?: { amount?: unknown; decimals?: unknown } };
  if (typeof value.mint !== "string" || !ADDRESS_PATTERN.test(value.mint)
    || typeof value.tokenAmount?.amount !== "string" || !/^\d+$/u.test(value.tokenAmount.amount)
    || typeof value.tokenAmount.decimals !== "number" || !Number.isInteger(value.tokenAmount.decimals)
    || value.tokenAmount.decimals < 0 || value.tokenAmount.decimals > 18) return null;
  return { mint: value.mint, amount: BigInt(value.tokenAmount.amount), decimals: value.tokenAmount.decimals };
}

function amountToUi(amount: string, decimals: number): string {
  const padded = amount.padStart(decimals + 1, "0");
  if (decimals === 0) return padded;
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/u, "");
  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
}

function multiplyUsd(amount: string, price: number | null): number | null {
  if (price === null) return null;
  const numeric = Number(amount);
  const value = numeric * price;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function validateSwapInput(inputMint: string, outputMint: string, amount: string): void {
  if (!ADDRESS_PATTERN.test(inputMint) || !ADDRESS_PATTERN.test(outputMint)) throw new Error("Swap token mint is invalid");
  if (inputMint === outputMint) throw new Error("Swap tokens must be different");
  if (!RAW_AMOUNT_PATTERN.test(amount) || BigInt(amount) > MAX_U64) throw new Error("Swap amount must be a positive raw token amount");
}

function validateBase64Transaction(value: string): Buffer {
  if (value.length < 4 || value.length > 2_000 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) throw new Error("Unsigned transaction encoding is invalid");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 1 || bytes.length > 1_232 || bytes.toString("base64") !== value) throw new Error("Unsigned transaction encoding is invalid");
  return bytes;
}

function decodeCanonicalBase64(value: string): Buffer {
  if (value.length < 4 || value.length > 8_192 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    throw new Error("Pump bonding-curve encoding is invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error("Pump bonding-curve encoding is invalid");
  return bytes;
}

function parseMintEvidence(value: unknown): { program: string; decimals: number; supply: string; mintAuthority: string | null; freezeAuthority: string | null } {
  if (typeof value !== "object" || value === null) throw new Error("Pump token mint account was not found");
  const account = value as { owner?: unknown; data?: { parsed?: { type?: unknown; info?: unknown } } };
  if (typeof account.owner !== "string" || !TOKEN_PROGRAMS.includes(account.owner as typeof TOKEN_PROGRAMS[number])
    || account.data?.parsed?.type !== "mint" || typeof account.data.parsed.info !== "object" || account.data.parsed.info === null) {
    throw new Error("Pump token mint account is invalid or uses an unsupported token program");
  }
  const info = account.data.parsed.info as { decimals?: unknown; supply?: unknown; mintAuthority?: unknown; freezeAuthority?: unknown };
  if (typeof info.decimals !== "number" || !Number.isInteger(info.decimals) || info.decimals < 0 || info.decimals > 18
    || typeof info.supply !== "string" || !/^\d+$/u.test(info.supply)) throw new Error("Pump token mint data is invalid");
  return {
    program: account.owner,
    decimals: info.decimals,
    supply: info.supply,
    mintAuthority: info.mintAuthority === null ? null : typeof info.mintAuthority === "string" && ADDRESS_PATTERN.test(info.mintAuthority) ? info.mintAuthority : null,
    freezeAuthority: info.freezeAuthority === null ? null : typeof info.freezeAuthority === "string" && ADDRESS_PATTERN.test(info.freezeAuthority) ? info.freezeAuthority : null,
  };
}

function parseLargestAccountConcentration(value: unknown, supply: string, excludedAccounts: ReadonlySet<string>): number | null {
  if (!Array.isArray(value) || supply === "0") return null;
  let total = 0n;
  let includedAccounts = 0;
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const { address, amount } = entry as { address?: unknown; amount?: unknown };
    if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)
      || typeof amount !== "string" || !/^\d+$/u.test(amount)) return null;
    if (excludedAccounts.has(address)) continue;
    total += BigInt(amount);
    includedAccounts += 1;
    if (includedAccounts === 10) break;
  }
  const basisPoints = (total * 10_000n) / BigInt(supply);
  return Number(basisPoints > 1_000_000n ? 1_000_000n : basisPoints) / 100;
}

type PumpGlobalEvidence = {
  initialRealTokenReserves: bigint;
  baseProtocolFeeBps: number;
  baseCreatorFeeBps: number;
};

function parsePumpGlobal(value: unknown): PumpGlobalEvidence | null {
  if (value === null) return null;
  if (typeof value !== "object") throw new Error("Solana returned an invalid Pump global account");
  const account = value as { owner?: unknown; data?: unknown };
  if (account.owner !== PUMP_PROGRAM_ID) throw new Error("Pump global account is not owned by the official Pump program");
  if (!Array.isArray(account.data) || typeof account.data[0] !== "string" || account.data[1] !== "base64") {
    throw new Error("Solana returned invalid Pump global data");
  }
  const bytes = decodeCanonicalBase64(account.data[0]);
  if (bytes.length < 162 || !bytes.subarray(0, 8).equals(PUMP_GLOBAL_DISCRIMINATOR)) {
    throw new Error("Pump global account discriminator or layout is invalid");
  }
  const baseProtocolFeeBps = Number(bytes.readBigUInt64LE(105));
  const baseCreatorFeeBps = Number(bytes.readBigUInt64LE(154));
  if (!Number.isSafeInteger(baseProtocolFeeBps) || baseProtocolFeeBps > 10_000
    || !Number.isSafeInteger(baseCreatorFeeBps) || baseCreatorFeeBps > 10_000) {
    throw new Error("Pump global base fee configuration is outside the supported range");
  }
  return {
    initialRealTokenReserves: bytes.readBigUInt64LE(89),
    baseProtocolFeeBps,
    baseCreatorFeeBps,
  };
}

function pumpCurveQuoteMint(bytes: Buffer): string {
  if (bytes.length < 115 || bytes.subarray(83, 115).every((value) => value === 0)) return SOL_MINT;
  return String(getAddressDecoder().decode(bytes.subarray(83, 115)));
}

function pumpMetrics(input: {
  token: ReturnType<typeof parseMintEvidence>;
  global: PumpGlobalEvidence | null;
  curve: { virtualTokenReserves: bigint; virtualQuoteReserves: bigint; realTokenReserves: bigint; realQuoteReserves: bigint; tokenTotalSupply: bigint; quoteMint: string; complete: boolean } | null;
  pool: { baseAmount: string; quoteAmount: string; effectiveQuoteAmount: string; slot: number } | null;
  referenceBuyInput: bigint;
}): PumpTokenIntelligence["metrics"] {
  const quoteMint = input.pool !== null ? SOL_MINT : input.curve?.quoteMint ?? null;
  const quoteSymbol = quoteMint === SOL_MINT ? "SOL" : quoteMint === USDC_MINT ? "USDC" : "unknown";
  const quoteDecimals = quoteSymbol === "SOL" ? 9 : quoteSymbol === "USDC" ? 6 : null;
  const tokenScale = 10 ** input.token.decimals;
  const quoteScale = quoteDecimals === null ? null : 10 ** quoteDecimals;
  const baseRaw = input.pool !== null ? BigInt(input.pool.baseAmount) : input.curve?.virtualTokenReserves ?? null;
  const quoteRaw = input.pool !== null ? BigInt(input.pool.effectiveQuoteAmount) : input.curve?.virtualQuoteReserves ?? null;
  const baseUi = baseRaw === null ? null : Number(baseRaw) / tokenScale;
  const quoteUi = quoteRaw === null || quoteScale === null ? null : Number(quoteRaw) / quoteScale;
  const spotPriceQuotePerToken = baseUi !== null && baseUi > 0 && quoteUi !== null ? quoteUi / baseUi : null;
  const supplyUi = Number(BigInt(input.token.supply)) / tokenScale;
  const estimatedMarketCapQuote = spotPriceQuotePerToken === null ? null : spotPriceQuotePerToken * supplyUi;
  const curveProgressPercent = input.pool !== null || input.curve?.complete === true
    ? 100
    : input.curve !== null && input.global !== null && input.global.initialRealTokenReserves > 0n
      ? Number((input.global.initialRealTokenReserves > input.curve.realTokenReserves
        ? input.global.initialRealTokenReserves - input.curve.realTokenReserves
        : 0n) * 1_000_000n / input.global.initialRealTokenReserves) / 10_000
      : null;
  const displayedQuoteRaw = input.pool !== null ? BigInt(input.pool.quoteAmount) : input.curve?.realQuoteReserves ?? null;
  const quoteReservesUi = displayedQuoteRaw === null || quoteScale === null ? null : Number(displayedQuoteRaw) / quoteScale;
  const referenceBuyInputLamports = String(input.referenceBuyInput);
  const referencePath = pumpReferencePath({
    quoteSymbol,
    inputAmount: input.referenceBuyInput,
    baseReserves: baseRaw,
    quoteReserves: quoteRaw,
    availableBaseReserves: input.pool !== null ? BigInt(input.pool.baseAmount) : input.curve?.realTokenReserves ?? null,
    venue: input.pool !== null ? "pumpswap" : input.curve !== null && !input.curve.complete ? "bonding-curve" : "unavailable",
  });
  const referenceBuyPriceImpactBps = referencePath.buyPriceImpactBps;
  return {
    quoteMint,
    quoteSymbol,
    spotPriceQuotePerToken: finiteMetric(spotPriceQuotePerToken),
    estimatedMarketCapQuote: finiteMetric(estimatedMarketCapQuote),
    curveProgressPercent: finiteMetric(curveProgressPercent === null ? null : Math.min(100, Math.max(0, curveProgressPercent))),
    quoteReservesUi: finiteMetric(quoteReservesUi),
    referenceBuyInputLamports,
    referenceBuyPriceImpactBps: finiteMetric(referenceBuyPriceImpactBps === null ? null : Math.min(10_000, Math.max(0, referenceBuyPriceImpactBps))),
    referencePath,
    priceImpactNote: referenceBuyPriceImpactBps === null
      ? "A deterministic size-specific reserve path is unavailable for this venue or quote mint."
      : "Size-specific buy and sell-back reserve estimates; effective fees, slippage tolerance, account creation, and transaction simulation are excluded.",
    baseProtocolFeeBps: input.global?.baseProtocolFeeBps ?? null,
    baseCreatorFeeBps: input.global?.baseCreatorFeeBps ?? null,
    feeNote: input.global === null
      ? "Base Pump fee configuration is unavailable; no transaction fee estimate is claimed."
      : "On-chain Pump global base fee configuration only; the effective v2 fee-program result, network fee, and rent require a fresh quote and simulation.",
  };
}

function pumpReferencePath(input: {
  quoteSymbol: "SOL" | "USDC" | "unknown";
  inputAmount: bigint;
  baseReserves: bigint | null;
  quoteReserves: bigint | null;
  availableBaseReserves: bigint | null;
  venue: "bonding-curve" | "pumpswap" | "unavailable";
}): PumpTokenIntelligence["metrics"]["referencePath"] {
  const unavailable = (reason: string): PumpTokenIntelligence["metrics"]["referencePath"] => ({
    venue: "unavailable",
    buyInputQuoteAmount: String(input.inputAmount),
    buyOutputTokenAmount: null,
    buyPriceImpactBps: null,
    sellInputTokenAmount: null,
    sellOutputQuoteAmount: null,
    sellPriceImpactBps: null,
    roundTripLossBps: null,
    estimateKind: "reserve-only",
    networkFeeLamports: null,
    rentLamports: null,
    disclosure: reason,
  });
  if (input.quoteSymbol !== "SOL") return unavailable("The selected venue is not SOL-quoted, so this SOL reference path is unavailable.");
  if (input.venue === "unavailable" || input.baseReserves === null || input.quoteReserves === null
    || input.baseReserves <= 0n || input.quoteReserves <= 0n) {
    return unavailable("Verified active reserves are unavailable. No buy or sell-path estimate is claimed.");
  }
  const curveAdjustment = input.venue === "bonding-curve" ? 1n : 0n;
  if (input.inputAmount <= curveAdjustment) return unavailable("The reference amount is too small for this venue formula.");
  const reserveInput = input.inputAmount - curveAdjustment;
  const buyOutput = reserveInput * input.baseReserves / (input.quoteReserves + reserveInput);
  if (buyOutput <= 0n || buyOutput >= input.baseReserves
    || (input.availableBaseReserves !== null && buyOutput > input.availableBaseReserves)) {
    return unavailable("The reference buy exceeds verified available token reserves.");
  }
  const baseAfterBuy = input.baseReserves - buyOutput;
  const quoteAfterBuy = input.quoteReserves + reserveInput;
  const sellOutput = buyOutput * quoteAfterBuy / (baseAfterBuy + buyOutput);
  const buyImpactBps = bigintRatioBps(reserveInput, input.quoteReserves + reserveInput);
  const sellImpactBps = bigintRatioBps(buyOutput, baseAfterBuy + buyOutput);
  const returned = sellOutput > input.inputAmount ? input.inputAmount : sellOutput;
  const roundTripLossBps = bigintRatioBps(input.inputAmount - returned, input.inputAmount);
  return {
    venue: input.venue,
    buyInputQuoteAmount: String(input.inputAmount),
    buyOutputTokenAmount: String(buyOutput),
    buyPriceImpactBps: buyImpactBps,
    sellInputTokenAmount: String(buyOutput),
    sellOutputQuoteAmount: String(sellOutput),
    sellPriceImpactBps: sellImpactBps,
    roundTripLossBps,
    estimateKind: "reserve-only",
    networkFeeLamports: null,
    rentLamports: null,
    disclosure: "Reserve-only round-trip evidence from the same finalized snapshot. Effective fee-program charges, slippage tolerance, network fee, and rent remain unavailable until an unsigned transaction is built and simulated.",
  };
}

function bigintRatioBps(numerator: bigint, denominator: bigint): number | null {
  if (numerator < 0n || denominator <= 0n) return null;
  return Number(numerator * 10_000_000n / denominator) / 1_000;
}

function finiteMetric(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function parseCanonicalPumpSwapPool(value: unknown, expected: { poolAuthority: string; mint: string }): { baseTokenAccount: string; quoteTokenAccount: string; virtualQuoteReserves: bigint } | null {
  if (value === null) return null;
  if (typeof value !== "object") throw new Error("Solana returned an invalid PumpSwap pool account");
  const account = value as { owner?: unknown; data?: unknown };
  if (account.owner !== PUMP_SWAP_PROGRAM_ID) throw new Error("Canonical PumpSwap pool PDA is not owned by the official PumpSwap program");
  if (!Array.isArray(account.data) || typeof account.data[0] !== "string" || account.data[1] !== "base64") throw new Error("Solana returned invalid PumpSwap pool data");
  const bytes = decodeCanonicalBase64(account.data[0]);
  if (bytes.length < 203 || !bytes.subarray(0, 8).equals(PUMP_SWAP_POOL_DISCRIMINATOR)) throw new Error("PumpSwap pool discriminator is invalid");
  const decoder = getAddressDecoder();
  const index = bytes.readUInt16LE(9);
  const creator = String(decoder.decode(bytes.subarray(11, 43)));
  const baseMint = String(decoder.decode(bytes.subarray(43, 75)));
  const quoteMint = String(decoder.decode(bytes.subarray(75, 107)));
  const baseTokenAccount = String(decoder.decode(bytes.subarray(139, 171)));
  const quoteTokenAccount = String(decoder.decode(bytes.subarray(171, 203)));
  if (index !== 0 || creator !== expected.poolAuthority || baseMint !== expected.mint || quoteMint !== SOL_MINT) {
    throw new Error("Canonical PumpSwap pool bindings do not match the requested mint");
  }
  return { baseTokenAccount, quoteTokenAccount, virtualQuoteReserves: bytes.length >= 261 ? readI128LE(bytes, 245) : 0n };
}

function parseTokenBalanceAmount(value: unknown): string {
  if (typeof value !== "object" || value === null || typeof (value as { amount?: unknown }).amount !== "string"
    || !/^\d+$/u.test((value as { amount: string }).amount)) throw new Error("PumpSwap vault balance is invalid");
  return (value as { amount: string }).amount;
}

function readI128LE(bytes: Buffer, offset: number): bigint {
  let value = 0n;
  for (let index = 15; index >= 0; index -= 1) value = (value << 8n) | BigInt(bytes[offset + index] ?? 0);
  return (value & (1n << 127n)) === 0n ? value : value - (1n << 128n);
}

function tokenRiskWarnings(token: { mintAuthority: string | null; freezeAuthority: string | null }, concentration: number | null): string[] {
  const warnings: string[] = [];
  if (token.mintAuthority !== null) warnings.push("Mint authority is still enabled; additional tokens may be minted.");
  if (token.freezeAuthority !== null) warnings.push("Freeze authority is still enabled; token accounts may be frozen.");
  if (concentration !== null && concentration >= 50) warnings.push(`The ten largest token accounts hold approximately ${concentration.toFixed(2)}% of supply; concentration risk is high.`);
  if (concentration === null) warnings.push("Largest-account concentration could not be established from finalized RPC evidence.");
  return warnings;
}

function parseFinalizedPumpSignature(value: unknown): Array<{ signature: string; slot: number; blockTime: string | null }> {
  if (typeof value !== "object" || value === null) return [];
  const entry = value as { signature?: unknown; slot?: unknown; blockTime?: unknown; err?: unknown; confirmationStatus?: unknown };
  if (typeof entry.signature !== "string" || !SIGNATURE_PATTERN.test(entry.signature)
    || typeof entry.slot !== "number" || !Number.isSafeInteger(entry.slot) || entry.slot < 0
    || entry.err !== null || entry.confirmationStatus !== "finalized") return [];
  const blockTime = typeof entry.blockTime === "number" && Number.isSafeInteger(entry.blockTime) && entry.blockTime >= 0 && entry.blockTime <= 10_000_000_000
    ? new Date(entry.blockTime * 1_000).toISOString()
    : null;
  return [{ signature: entry.signature, slot: entry.slot, blockTime }];
}

export function extractPumpCandidateMints(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  const transaction = value as { meta?: unknown };
  if (typeof transaction.meta !== "object" || transaction.meta === null) return [];
  const balances = (transaction.meta as { postTokenBalances?: unknown }).postTokenBalances;
  if (!Array.isArray(balances)) return [];
  return [...new Set(balances.flatMap((balance) => {
    if (typeof balance !== "object" || balance === null) return [];
    const mint = (balance as { mint?: unknown }).mint;
    return typeof mint === "string" && ADDRESS_PATTERN.test(mint) && mint !== SOL_MINT && mint !== USDC_MINT ? [mint] : [];
  }))].slice(0, 20);
}

export function extractPumpActivitySignals(value: unknown): PumpActivitySignal[] {
  return [...new Set(pumpTransactionInstructions(value).flatMap((instruction) => {
    const decoded = decodePumpInstruction(instruction);
    return decoded === null ? [] : [decoded.signal];
  }))];
}

export function extractPumpMintSignals(value: unknown): Map<string, PumpActivitySignal[]> {
  const result = new Map<string, PumpActivitySignal[]>(extractPumpCandidateMints(value).map((mint) => [mint, ["token-balance-observed"]]));
  for (const instruction of pumpTransactionInstructions(value)) {
    const decoded = decodePumpInstruction(instruction);
    if (decoded === null || typeof instruction !== "object" || instruction === null) continue;
    const accounts = (instruction as { accounts?: unknown }).accounts;
    const mint = Array.isArray(accounts) ? accounts[decoded.mintAccountIndex] : undefined;
    if (typeof mint !== "string" || !result.has(mint)) continue;
    result.set(mint, [...new Set<PumpActivitySignal>([...(result.get(mint) ?? []), decoded.signal])]);
  }
  return result;
}

export function extractPumpEventSignals(value: unknown): Map<string, PumpActivitySignal[]> {
  if (typeof value !== "object" || value === null) return new Map();
  const meta = (value as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return new Map();
  const logMessages = (meta as { logMessages?: unknown }).logMessages;
  if (!Array.isArray(logMessages)) return new Map();
  const result = new Map<string, PumpActivitySignal[]>();
  const executionStack: string[] = [];
  for (const rawLog of logMessages.slice(0, 1_000)) {
    if (typeof rawLog !== "string" || rawLog.length > 20_000) continue;
    const invoke = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke \[\d+\]$/u.exec(rawLog);
    if (invoke?.[1]) {
      executionStack.push(invoke[1]);
      continue;
    }
    if (/^Program [1-9A-HJ-NP-Za-km-z]{32,44} (?:success|failed:)/u.test(rawLog)) {
      executionStack.pop();
      continue;
    }
    if (executionStack.at(-1) !== PUMP_PROGRAM_ID || !rawLog.startsWith("Program data: ")) continue;
    const event = decodePumpEvent(rawLog.slice("Program data: ".length));
    if (event === null) continue;
    result.set(event.mint, [...new Set<PumpActivitySignal>([...(result.get(event.mint) ?? []), event.signal])]);
  }
  return result;
}

function parseScopedTokenBalances(value: unknown[], walletAddress: string, tokenMint: string, accountCount: number): Map<number, bigint> {
  const result = new Map<number, bigint>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) throw new Error("Pump token settlement entry is invalid");
    const balance = entry as { accountIndex?: unknown; mint?: unknown; owner?: unknown; uiTokenAmount?: unknown };
    if (!Number.isSafeInteger(balance.accountIndex) || (balance.accountIndex as number) < 0 || (balance.accountIndex as number) >= accountCount
      || typeof balance.mint !== "string" || !ADDRESS_PATTERN.test(balance.mint)
      || typeof balance.owner !== "string" || !ADDRESS_PATTERN.test(balance.owner)
      || typeof balance.uiTokenAmount !== "object" || balance.uiTokenAmount === null) {
      throw new Error("Pump token settlement entry is invalid");
    }
    const amount = (balance.uiTokenAmount as { amount?: unknown }).amount;
    if (typeof amount !== "string" || !/^\d+$/u.test(amount)) throw new Error("Pump token settlement amount is invalid");
    if (balance.owner === walletAddress && balance.mint === tokenMint) result.set(balance.accountIndex as number, BigInt(amount));
  }
  return result;
}

function decodePumpEvent(encoded: string): { mint: string; signal: PumpActivitySignal } | null {
  if (encoded.length < 12 || encoded.length > 20_000) return null;
  try {
    const bytes = decodeCanonicalBase64(encoded);
    if (bytes.length < 40) return null;
    const event = PUMP_EVENT_DISCRIMINATORS.get(Array.from(bytes.subarray(0, 8)).join(","));
    if (event === undefined) return null;
    let mintOffset = event.mintOffset;
    if (mintOffset === "after-create-strings") {
      mintOffset = 8;
      for (let index = 0; index < 3; index += 1) {
        if (mintOffset + 4 > bytes.length) return null;
        const length = bytes.readUInt32LE(mintOffset);
        if (length > 4_096 || mintOffset + 4 + length > bytes.length) return null;
        mintOffset += 4 + length;
      }
    }
    if (mintOffset + 32 > bytes.length) return null;
    const mint = String(getAddressDecoder().decode(bytes.subarray(mintOffset, mintOffset + 32)));
    return ADDRESS_PATTERN.test(mint) ? { mint, signal: event.signal } : null;
  } catch {
    return null;
  }
}

function decodePumpInstruction(instruction: unknown): { signal: PumpActivitySignal; mintAccountIndex: number } | null {
    if (typeof instruction !== "object" || instruction === null) return null;
    const item = instruction as { programId?: unknown; data?: unknown };
    if (item.programId !== PUMP_PROGRAM_ID || typeof item.data !== "string" || item.data.length > 500) return null;
    try {
      const bytes = getBase58Encoder().encode(item.data);
      if (bytes.length < 8) return null;
      return PUMP_INSTRUCTION_DISCRIMINATORS.get(Array.from(bytes.subarray(0, 8)).join(",")) ?? null;
    } catch {
      return null;
    }
}

function pumpTransactionInstructions(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null) return [];
  const envelope = value as { transaction?: unknown; meta?: unknown };
  const topLevel = typeof envelope.transaction === "object" && envelope.transaction !== null
    && typeof (envelope.transaction as { message?: unknown }).message === "object"
    && (envelope.transaction as { message: { instructions?: unknown } }).message !== null
    ? (envelope.transaction as { message: { instructions?: unknown } }).message.instructions
    : undefined;
  const innerGroups = typeof envelope.meta === "object" && envelope.meta !== null
    ? (envelope.meta as { innerInstructions?: unknown }).innerInstructions
    : undefined;
  return [
    ...(Array.isArray(topLevel) ? topLevel : []),
    ...(Array.isArray(innerGroups) ? innerGroups.flatMap((group) => {
      if (typeof group !== "object" || group === null) return [];
      const nested = (group as { instructions?: unknown }).instructions;
      return Array.isArray(nested) ? nested : [];
    }) : []),
  ];
}

function withPumpResearchEligibility(value: unknown): PumpTokenIntelligence {
  const intelligence = PumpTokenIntelligenceSchema.parse(value);
  return PumpTokenIntelligenceSchema.parse({
    ...intelligence,
    researchEligibility: evaluatePumpResearchEligibility(intelligence),
  });
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function safeRpcError(value: unknown): string {
  try { return JSON.stringify(value).slice(0, 500); }
  catch { return "Solana reported that the transaction failed"; }
}

function simulatedWalletImpact(
  walletPreLamports: number,
  accounts: unknown,
  feeLamports: number | null,
  solInputLamports: string | null,
): Pick<RawSimulationResult, "accountCreationFundingLamports" | "estimatedWalletOutflowLamports"> {
  if (!Array.isArray(accounts) || accounts.length !== 1) {
    throw new Error("Solana simulation omitted the selected wallet balance evidence");
  }
  const wallet = accounts[0];
  if (
    typeof wallet !== "object"
    || wallet === null
    || !Number.isSafeInteger((wallet as { lamports?: unknown }).lamports)
    || (wallet as { lamports: number }).lamports < 0
  ) {
    throw new Error("Solana returned invalid simulated wallet balance evidence");
  }
  const walletPostLamports = (wallet as { lamports: number }).lamports;
  const totalOutflow = BigInt(Math.max(walletPreLamports - walletPostLamports, 0));
  if (feeLamports === null) {
    return {
      accountCreationFundingLamports: null,
      estimatedWalletOutflowLamports: totalOutflow.toString(),
    };
  }
  const tradeInput = solInputLamports === null ? 0n : BigInt(solInputLamports);
  const residual = totalOutflow - BigInt(feeLamports) - tradeInput;
  if (residual > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Simulated account funding exceeds the supported range");
  }
  return {
    accountCreationFundingLamports: Number(residual > 0n ? residual : 0n),
    estimatedWalletOutflowLamports: totalOutflow.toString(),
  };
}
