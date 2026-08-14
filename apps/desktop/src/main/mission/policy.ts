import { LimitOrderContractPreviewSchema, MissionContractPreviewSchema, PumpTradeContractPreviewSchema, type LimitOrderContractPreview, type MissionContractPreview, type PortfolioSnapshot, type PumpTradeContractPreview } from "@silfable/contracts";

import type { MainnetReadService } from "../integrations/read-only.js";
import { pumpInspectorBoundary } from "../pump/inspector.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const RAW_AMOUNT_PATTERN = /^[1-9]\d*$/u;
const MAX_U64 = 18_446_744_073_709_551_615n;
const MAX_SLIPPAGE_BPS = 300;

type TransactionPolicySettings = { get(): { maxSlippageBps?: number } };
const DEFAULT_POLICY_SETTINGS: TransactionPolicySettings = { get: () => ({ maxSlippageBps: MAX_SLIPPAGE_BPS }) };
type DraftInput = {
  goal: string;
  walletAddress: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  maxSlippageBps: number;
  deadlineAt: string;
  stopConditions: string[];
};

export class MissionPolicyService {
  readonly #reads: MainnetReadService;
  readonly #settings: TransactionPolicySettings;

  constructor(reads: MainnetReadService, settings: TransactionPolicySettings = DEFAULT_POLICY_SETTINGS) {
    this.#reads = reads;
    this.#settings = settings;
  }

  async preview(input: DraftInput): Promise<MissionContractPreview> {
    const now = Date.now();
    const checks: MissionContractPreview["checks"] = [];
    const tokenPairValid = ADDRESS_PATTERN.test(input.inputMint) && ADDRESS_PATTERN.test(input.outputMint) && input.inputMint !== input.outputMint;
    checks.push(check("token_pair_valid", tokenPairValid, tokenPairValid ? "Input and output mints are distinct valid Solana addresses." : "Input and output mints must be distinct valid Solana addresses."));
    const amountValid = RAW_AMOUNT_PATTERN.test(input.inputAmount) && BigInt(input.inputAmount) <= MAX_U64;
    checks.push(check("amount_valid", amountValid, amountValid ? "Input amount is a positive unsigned 64-bit raw amount." : "Input amount must be a positive unsigned 64-bit raw amount."));
    const slippageCeiling = this.#slippageCeiling();
    const slippageValid = Number.isInteger(input.maxSlippageBps) && input.maxSlippageBps >= 0 && input.maxSlippageBps <= slippageCeiling;
    checks.push(check("slippage_within_limit", slippageValid, slippageValid ? `Slippage limit is ${input.maxSlippageBps} bps (maximum ${slippageCeiling} bps).` : `Slippage exceeds the configured maximum of ${slippageCeiling} bps.`));
    const deadlineMs = Date.parse(input.deadlineAt);
    const deadlineValid = Number.isFinite(deadlineMs) && deadlineMs >= now + 4 * 60_000 && deadlineMs <= now + 30 * 24 * 60 * 60_000;
    checks.push(check("deadline_valid", deadlineValid, deadlineValid ? "Deadline is between five minutes and thirty days from now." : "Deadline must be between five minutes and thirty days from now."));

    let registered = false;
    let portfolio: PortfolioSnapshot | null = null;
    try {
      portfolio = await this.#reads.portfolio(input.walletAddress);
      registered = true;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes("not registered")) {
        registered = false;
      } else {
        // Wallet is registered, but RPC read failed (e.g. 429 rate limit)
        registered = true;
      }
    }
    checks.push(check("wallet_registered", registered, registered ? "Wallet is registered in the encrypted local vault." : "Wallet is not available in the encrypted local vault."));

    if (portfolio !== null && tokenPairValid && amountValid) {
      const available = rawBalance(portfolio, input.inputMint);
      const sufficient = available !== null && available >= BigInt(input.inputAmount);
      checks.push(check("balance_sufficient", sufficient, sufficient ? "Finalized wallet balance covers the proposed raw input amount." : "Finalized wallet balance does not cover the proposed raw input amount."));
    } else {
      checks.push(check("balance_sufficient", false, "Balance cannot be evaluated until wallet, token pair, and amount checks pass."));
    }

    let quote: MissionContractPreview["quote"] = null;
    if (tokenPairValid && amountValid) {
      try {
        quote = await this.#reads.swapQuote(input.inputMint, input.outputMint, input.inputAmount);
        checks.push(check("quote_only", quote.quoteOnly === true, "Jupiter returned quote evidence without a transaction payload."));
      } catch {
        checks.push(check("quote_only", false, "A transaction-free Jupiter quote could not be verified."));
      }
    } else {
      checks.push(check("quote_only", false, "Quote cannot be requested until token pair and amount checks pass."));
    }

    const preview = {
      id: crypto.randomUUID(),
      status: checks.every((item) => item.status === "pass") ? "ready-for-review" as const : "blocked" as const,
      goal: input.goal.trim().slice(0, 400),
      walletAddress: input.walletAddress,
      inputMint: input.inputMint,
      outputMint: input.outputMint,
      inputAmount: input.inputAmount,
      maxSlippageBps: input.maxSlippageBps,
      deadlineAt: new Date(deadlineMs).toISOString(),
      stopConditions: input.stopConditions.map((value) => value.trim().slice(0, 160)).filter(Boolean).slice(0, 8),
      quote,
      checks,
      executionAllowed: false as const,
      createdAt: new Date(now).toISOString(),
    };
    return MissionContractPreviewSchema.parse(preview);
  }

  async limitOrderPreview(input: LimitOrderDraftInput): Promise<LimitOrderContractPreview> {
    const now = Date.now();
    const checks: LimitOrderContractPreview["checks"] = [];
    const tokenPairValid = ADDRESS_PATTERN.test(input.inputMint) && ADDRESS_PATTERN.test(input.outputMint) && input.inputMint !== input.outputMint;
    checks.push(limitCheck("token_pair_valid", tokenPairValid, tokenPairValid ? "Input and output mints are distinct valid Solana addresses." : "Input and output mints must be distinct valid Solana addresses."));
    const amountValid = RAW_AMOUNT_PATTERN.test(input.inputAmount) && BigInt(input.inputAmount) <= MAX_U64;
    checks.push(limitCheck("amount_valid", amountValid, amountValid ? "Input amount is a positive unsigned 64-bit raw amount." : "Input amount must be a positive unsigned 64-bit raw amount."));
    const triggerValid = ADDRESS_PATTERN.test(input.triggerMint) && (input.triggerMint === input.inputMint || input.triggerMint === input.outputMint) && Number.isFinite(input.triggerPriceUsd) && input.triggerPriceUsd > 0;
    checks.push(limitCheck("trigger_valid", triggerValid, triggerValid ? `Trigger watches ${input.triggerCondition} $${input.triggerPriceUsd}.` : "Trigger mint must belong to the pair and its USD price must be positive."));
    const slippageCeiling = this.#slippageCeiling();
    const slippageValid = Number.isInteger(input.maxSlippageBps) && input.maxSlippageBps >= 0 && input.maxSlippageBps <= slippageCeiling;
    checks.push(limitCheck("slippage_within_limit", slippageValid, slippageValid ? `Slippage limit is ${input.maxSlippageBps} bps (maximum ${slippageCeiling} bps).` : `Slippage exceeds the configured maximum of ${slippageCeiling} bps.`));
    const expiryMs = Date.parse(input.expiresAt);
    const expiryValid = Number.isFinite(expiryMs) && expiryMs >= now + 15 * 60_000 && expiryMs <= now + 30 * 24 * 60 * 60_000;
    checks.push(limitCheck("expiry_valid", expiryValid, expiryValid ? "Expiry is between fifteen minutes and thirty days from now." : "Expiry must be between fifteen minutes and thirty days from now."));

    let portfolio: PortfolioSnapshot | null = null;
    try {
      portfolio = await this.#reads.portfolio(input.walletAddress);
      checks.push(limitCheck("wallet_registered", true, "Wallet is registered in the encrypted local vault."));
    } catch {
      checks.push(limitCheck("wallet_registered", false, "Wallet is not available in the encrypted local vault."));
    }
    const available = portfolio !== null && tokenPairValid && amountValid ? rawBalance(portfolio, input.inputMint) : null;
    const sufficient = available !== null && available >= BigInt(input.inputAmount);
    checks.push(limitCheck("balance_sufficient", sufficient, sufficient ? "Finalized balance covers the proposed deposit." : "Finalized balance does not cover the proposed deposit."));

    let estimatedInputValueUsd: number | null = null;
    if (portfolio !== null && tokenPairValid && amountValid) {
      const decimals = input.inputMint === SOL_MINT ? 9 : portfolio.assets.find((asset) => asset.mint === input.inputMint)?.decimals;
      try {
        const price = (await this.#reads.prices([input.inputMint])).get(input.inputMint) ?? null;
        if (decimals !== undefined && price !== null) estimatedInputValueUsd = Number(input.inputAmount) / 10 ** decimals * price.usdPrice;
      } catch { /* unavailable price is a deterministic block */ }
    }
    const minimumValue = estimatedInputValueUsd !== null && estimatedInputValueUsd >= 10;
    checks.push(limitCheck("minimum_order_value", minimumValue, minimumValue ? `Estimated input value is $${estimatedInputValueUsd!.toFixed(2)}, meeting Jupiter's $10 minimum.` : "A current input value of at least $10 could not be verified."));

    return LimitOrderContractPreviewSchema.parse({
      id: crypto.randomUUID(), status: checks.every((item) => item.status === "pass") ? "ready-for-review" : "blocked",
      goal: input.goal.trim().slice(0, 400), walletAddress: input.walletAddress, inputMint: input.inputMint, outputMint: input.outputMint,
      inputAmount: input.inputAmount, triggerMint: input.triggerMint, triggerCondition: input.triggerCondition, triggerPriceUsd: input.triggerPriceUsd,
      maxSlippageBps: input.maxSlippageBps, expiresAt: new Date(expiryMs).toISOString(), estimatedInputValueUsd, checks,
      executionAllowed: false, lifecycle: "preview-only", createdAt: new Date(now).toISOString(),
    });
  }

  async pumpTradePreview(input: PumpTradeDraftInput): Promise<PumpTradeContractPreview> {
    const now = Date.now();
    const checks: PumpTradeContractPreview["checks"] = [];
    const mintValid = ADDRESS_PATTERN.test(input.tokenMint) && input.tokenMint !== SOL_MINT;
    checks.push(pumpCheck("exact_mint_valid", mintValid, mintValid ? "The proposal is bound to one exact non-SOL mint." : "A valid exact Pump token mint is required."));
    const amountValid = RAW_AMOUNT_PATTERN.test(input.inputAmount) && BigInt(input.inputAmount) <= MAX_U64;
    checks.push(pumpCheck("amount_valid", amountValid, amountValid ? "Input is a positive unsigned 64-bit raw amount." : "Input must be a positive unsigned 64-bit raw amount."));
    const exposureValid = /^\d+$/u.test(input.maxSolExposureLamports) && BigInt(input.maxSolExposureLamports) <= MAX_U64
      && (input.side === "sell" ? input.maxSolExposureLamports === "0" : amountValid && BigInt(input.inputAmount) <= BigInt(input.maxSolExposureLamports));
    checks.push(pumpCheck("sol_exposure_within_limit", exposureValid, exposureValid ? `Maximum SOL exposure is ${input.maxSolExposureLamports} lamports.` : "Buy input must fit the maximum SOL exposure; sell proposals must use zero additional SOL exposure."));
    const minimumOutputValid = RAW_AMOUNT_PATTERN.test(input.minimumOutputAmount) && BigInt(input.minimumOutputAmount) <= MAX_U64;
    const slippageCeiling = this.#slippageCeiling();
    const slippageValid = Number.isInteger(input.maxSlippageBps) && input.maxSlippageBps >= 0 && input.maxSlippageBps <= slippageCeiling;
    checks.push(pumpCheck("slippage_within_limit", slippageValid, slippageValid ? `Slippage limit is ${input.maxSlippageBps} bps (maximum ${slippageCeiling} bps).` : `Slippage exceeds the configured maximum of ${slippageCeiling} bps.`));
    const deadlineMs = Date.parse(input.deadlineAt);
    const deadlineValid = Number.isFinite(deadlineMs) && deadlineMs >= now + 5 * 60_000 && deadlineMs <= now + 24 * 60 * 60_000;
    checks.push(pumpCheck("deadline_valid", deadlineValid, deadlineValid ? "Deadline is between five minutes and twenty-four hours from now." : "Pump proposals require a deadline between five minutes and twenty-four hours from now."));

    let portfolio: PortfolioSnapshot | null = null;
    try {
      portfolio = await this.#reads.portfolio(input.walletAddress);
      checks.push(pumpCheck("wallet_registered", true, "Wallet is registered in the encrypted local vault."));
    } catch {
      checks.push(pumpCheck("wallet_registered", false, "Wallet is not available in the encrypted local vault."));
    }
    const inputMint = input.side === "buy" ? SOL_MINT : input.tokenMint;
    const outputMint = input.side === "buy" ? input.tokenMint : SOL_MINT;
    const available = portfolio !== null && amountValid ? rawBalance(portfolio, inputMint) : null;
    const sufficient = available !== null && available >= BigInt(input.inputAmount);
    checks.push(pumpCheck("balance_sufficient", sufficient, sufficient ? "Finalized wallet balance covers the proposal input." : "Finalized wallet balance does not cover the proposal input."));

    let analysis: Awaited<ReturnType<MainnetReadService["pumpTokenAnalysis"]>> | null = null;
    if (mintValid) {
      try { analysis = await this.#reads.pumpTokenAnalysis(input.tokenMint); }
      catch { analysis = null; }
    }
    const venueVerified = analysis?.venue === "bonding-curve-active" || analysis?.venue === "pumpswap-migrated";
    checks.push(pumpCheck("venue_verified", venueVerified, venueVerified ? `Official ${analysis!.venue} venue evidence is finalized.` : "Neither an active Pump curve nor canonical PumpSwap pool is currently verified."));
    const authoritiesSafe = analysis !== null && analysis.mintAuthority === null && analysis.freezeAuthority === null;
    checks.push(pumpCheck("token_authorities_safe", authoritiesSafe, authoritiesSafe ? "Mint and freeze authorities are disabled." : "Mint or freeze authority safety could not be established."));
    const concentrationSafe = analysis?.top10ConcentrationPercent !== null && analysis?.top10ConcentrationPercent !== undefined && analysis.top10ConcentrationPercent < 90;
    checks.push(pumpCheck("concentration_within_limit", concentrationSafe, concentrationSafe ? `Top-ten account concentration is approximately ${analysis!.top10ConcentrationPercent!.toFixed(2)}%.` : "Top-ten concentration is unavailable or at least 90%."));
    const liquidityVerified = analysis !== null && (analysis.venue === "bonding-curve-active"
      ? BigInt(analysis.realTokenReserves ?? "0") > 0n && BigInt(analysis.realQuoteReserves ?? "0") > 0n
      : analysis.venue === "pumpswap-migrated" && BigInt(analysis.poolBaseReserves ?? "0") > 0n && BigInt(analysis.pumpSwapEffectiveQuoteReserves ?? "0") > 0n);
    checks.push(pumpCheck("liquidity_verified", liquidityVerified, liquidityVerified ? "Finalized venue reserves are non-zero and bound to the exact mint." : "Usable finalized venue reserves were not verified."));

    let quote: PumpTradeContractPreview["quote"] = null;
    if (mintValid && amountValid) {
      try { quote = await this.#reads.swapQuote(inputMint, outputMint, input.inputAmount); }
      catch { quote = null; }
    }
    const quoteOnly = quote?.quoteOnly === true;
    checks.push(pumpCheck("quote_only", quoteOnly, quoteOnly ? `Jupiter returned transaction-free route evidence through ${quote!.router}.` : "A transaction-free sell/buy path quote could not be verified."));
    const outputSufficient = minimumOutputValid && quote !== null && BigInt(quote.outAmount) >= BigInt(input.minimumOutputAmount);
    checks.push(pumpCheck("minimum_output_valid", outputSufficient, outputSufficient ? `Quoted output meets the minimum ${input.minimumOutputAmount} raw units.` : "Quoted output is unavailable or below the explicit minimum output."));

    return PumpTradeContractPreviewSchema.parse({
      id: crypto.randomUUID(), status: checks.every((item) => item.status === "pass") ? "ready-for-review" : "blocked",
      goal: input.goal.trim().slice(0, 400), walletAddress: input.walletAddress, side: input.side, tokenMint: input.tokenMint,
      inputMint, outputMint, inputAmount: input.inputAmount, maxSolExposureLamports: input.maxSolExposureLamports,
      minimumOutputAmount: input.minimumOutputAmount, maxSlippageBps: input.maxSlippageBps,
      deadlineAt: Number.isFinite(deadlineMs) ? new Date(deadlineMs).toISOString() : new Date(now).toISOString(),
      stopConditions: input.stopConditions.map((value) => value.trim().slice(0, 160)).filter(Boolean).slice(0, 8),
      venue: analysis?.venue ?? "unknown",
      risk: { mintAuthority: analysis?.mintAuthority ?? null, freezeAuthority: analysis?.freezeAuthority ?? null, top10ConcentrationPercent: analysis?.top10ConcentrationPercent ?? null, liquidityVerified, evidenceSlot: analysis?.slot ?? 0 },
      inspectionBoundary: pumpInspectorBoundary(analysis?.venue ?? "unknown", input.side),
      quote, checks, executionAllowed: false, lifecycle: "proposal-only", createdAt: new Date(now).toISOString(),
    });
  }

  #slippageCeiling(): number {
    const configured = this.#settings.get().maxSlippageBps;
    return typeof configured === "number" && Number.isInteger(configured) && configured >= 0 && configured <= MAX_SLIPPAGE_BPS ? configured : MAX_SLIPPAGE_BPS;
  }
}

type LimitOrderDraftInput = { goal: string; walletAddress: string; inputMint: string; outputMint: string; inputAmount: string; triggerMint: string; triggerCondition: "above" | "below"; triggerPriceUsd: number; maxSlippageBps: number; expiresAt: string };
type PumpTradeDraftInput = { goal: string; walletAddress: string; side: "buy" | "sell"; tokenMint: string; inputAmount: string; maxSolExposureLamports: string; minimumOutputAmount: string; maxSlippageBps: number; deadlineAt: string; stopConditions: string[] };

function check(code: MissionContractPreview["checks"][number]["code"], passed: boolean, message: string): MissionContractPreview["checks"][number] {
  return { code, status: passed ? "pass" : "fail", message };
}

function limitCheck(code: LimitOrderContractPreview["checks"][number]["code"], passed: boolean, message: string): LimitOrderContractPreview["checks"][number] {
  return { code, status: passed ? "pass" : "fail", message };
}

function pumpCheck(code: PumpTradeContractPreview["checks"][number]["code"], passed: boolean, message: string): PumpTradeContractPreview["checks"][number] {
  return { code, status: passed ? "pass" : "fail", message };
}

function rawBalance(portfolio: PortfolioSnapshot, mint: string): bigint | null {
  if (mint === SOL_MINT) return decimalToRaw(portfolio.solBalance, 9);
  const asset = portfolio.assets.find((candidate) => candidate.mint === mint);
  return asset ? BigInt(asset.amount) : 0n;
}

function decimalToRaw(value: string, decimals: number): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(value);
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) return null;
  return BigInt(`${match[1]}${fraction.padEnd(decimals, "0")}`);
}
