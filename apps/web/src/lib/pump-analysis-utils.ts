import type { PumpTokenIntelligence } from "@silfable/contracts";

export type PumpAnalysisIntent = {
  requested: boolean;
  mint: string | null;
  referenceBuyLamports: string;
};

export function resolvePumpAnalysisIntent(text: string): PumpAnalysisIntent {
  const requested = /\b(?:anal(?:isa|isis|y[sz]e)|review|riset|research|cek|periksa)\b/iu.test(text)
    && /\b(?:pump(?:\.fun)?|mint|token|koin|coin)\b/iu.test(text);
  const mint = requested ? text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/u)?.[0] ?? null : null;
  const sol = requested ? /(?:reference|referensi|ukuran|size)?\s*(\d+(?:[.,]\d+)?)\s*SOL\b/iu.exec(text) : null;
  const amount = sol ? Number(sol[1]!.replace(",", ".")) : 0.001;
  const referenceBuyLamports = Number.isFinite(amount) && amount > 0
    ? String(Math.round(amount * 1_000_000_000))
    : "1000000";
  return { requested, mint, referenceBuyLamports };
}

export function calculatePumpReferencePath(input: {
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
  const returned = sellOutput > input.inputAmount ? input.inputAmount : sellOutput;
  return {
    venue: input.venue,
    buyInputQuoteAmount: String(input.inputAmount),
    buyOutputTokenAmount: String(buyOutput),
    buyPriceImpactBps: bigintRatioBps(reserveInput, input.quoteReserves + reserveInput),
    sellInputTokenAmount: String(buyOutput),
    sellOutputQuoteAmount: String(sellOutput),
    sellPriceImpactBps: bigintRatioBps(buyOutput, baseAfterBuy + buyOutput),
    roundTripLossBps: bigintRatioBps(input.inputAmount - returned, input.inputAmount),
    estimateKind: "reserve-only",
    networkFeeLamports: null,
    rentLamports: null,
    disclosure: "Reserve-only round-trip evidence from the same finalized snapshot. Effective fees, slippage tolerance, network fee, and rent remain unavailable until an unsigned transaction is built and simulated.",
  };
}

function bigintRatioBps(numerator: bigint, denominator: bigint): number | null {
  if (numerator < 0n || denominator <= 0n) return null;
  return Number(numerator * 10_000_000n / denominator) / 1_000;
}
