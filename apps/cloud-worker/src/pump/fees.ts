const BPS_DENOMINATOR = 10_000n;
const ONE_BILLION_TOKEN_RAW_SUPPLY = 1_000_000_000_000_000n;
const U64_MAX = 18_446_744_073_709_551_615n;

export type PumpCurveStateEvidence = {
  virtualTokenReserves: string;
  virtualQuoteReserves: string;
  realTokenReserves: string;
  tokenTotalSupply: string;
  mayhemMode?: boolean;
  feeSchedule: {
    protocolFeeBps: string;
    creatorFeeBps: string;
    buybackAllocationBps: string;
    tiers: Array<{
      marketCapQuoteThreshold: string;
      protocolFeeBps: string;
      creatorFeeBps: string;
    }>;
  };
};

export type PumpFeePreview = {
  side: "buy" | "sell";
  marketCapQuoteRaw: string;
  protocolFeeBps: number;
  creatorFeeBps: number;
  totalTradingFeeBps: number;
  buybackAllocationBps: number;
  grossQuoteAmount: string;
  netCurveQuoteAmount: string;
  protocolFeeQuoteAmount: string;
  creatorFeeQuoteAmount: string;
  totalTradingFeeQuoteAmount: string;
  expectedTokenAmount: string | null;
  classification: "reasonable" | "high" | "extreme";
  maxTotalFeeBps: number;
  allowed: boolean;
  disclosure: string;
};

export function calculatePumpFeePreview(input: {
  side: "buy" | "sell";
  rawInputAmount: string;
  maxTotalFeeBps: number;
  evidence: PumpCurveStateEvidence;
}): PumpFeePreview {
  const rawInput = positiveU64(input.rawInputAmount, "input amount");
  if (!Number.isInteger(input.maxTotalFeeBps) || input.maxTotalFeeBps < 1 || input.maxTotalFeeBps > 10_000) {
    throw new Error("Pump maximum total fee must be between 1 and 10000 bps");
  }
  const virtualToken = positive(input.evidence.virtualTokenReserves, "virtual token reserves");
  const virtualQuote = positive(input.evidence.virtualQuoteReserves, "virtual quote reserves");
  const supply = input.evidence.mayhemMode
    ? positive(input.evidence.tokenTotalSupply, "token total supply")
    : ONE_BILLION_TOKEN_RAW_SUPPLY;
  const marketCap = (virtualQuote * supply) / virtualToken;
  const selected = selectFeeTier(input.evidence, marketCap);
  const protocolFeeBps = safeBps(selected.protocolFeeBps, "protocol fee");
  const creatorFeeBps = safeBps(selected.creatorFeeBps, "creator fee");
  const buybackAllocationBps = safeBps(input.evidence.feeSchedule.buybackAllocationBps, "buyback allocation");
  const totalBps = protocolFeeBps + creatorFeeBps;
  if (totalBps > 10_000) throw new Error("Pump protocol and creator fees exceed 10000 bps");

  let grossQuote: bigint;
  let netQuote: bigint;
  let expectedToken: bigint | null;
  if (input.side === "buy") {
    grossQuote = rawInput;
    netQuote = ((grossQuote - 1n) * BPS_DENOMINATOR) / (BPS_DENOMINATOR + BigInt(totalBps));
    expectedToken = (netQuote * virtualToken) / (virtualQuote + netQuote);
    const realToken = positive(input.evidence.realTokenReserves, "real token reserves");
    if (expectedToken > realToken) expectedToken = realToken;
  } else {
    expectedToken = null;
    grossQuote = (rawInput * virtualQuote) / (virtualToken + rawInput);
    netQuote = grossQuote;
  }
  const protocolFee = ceilFee(netQuote, protocolFeeBps);
  const creatorFee = ceilFee(netQuote, creatorFeeBps);
  const totalFee = protocolFee + creatorFee;
  if (input.side === "sell") netQuote = grossQuote >= totalFee ? grossQuote - totalFee : 0n;
  const classification = totalBps <= 200 ? "reasonable" : totalBps <= 500 ? "high" : "extreme";

  return {
    side: input.side,
    marketCapQuoteRaw: marketCap.toString(),
    protocolFeeBps,
    creatorFeeBps,
    totalTradingFeeBps: totalBps,
    buybackAllocationBps,
    grossQuoteAmount: grossQuote.toString(),
    netCurveQuoteAmount: netQuote.toString(),
    protocolFeeQuoteAmount: protocolFee.toString(),
    creatorFeeQuoteAmount: creatorFee.toString(),
    totalTradingFeeQuoteAmount: totalFee.toString(),
    expectedTokenAmount: expectedToken?.toString() ?? null,
    classification,
    maxTotalFeeBps: input.maxTotalFeeBps,
    allowed: totalBps <= input.maxTotalFeeBps,
    disclosure: "Protocol and creator fees calculated from Pump curve state. Rejects execution if total fees exceed maxTotalFeeBps.",
  };
}

function selectFeeTier(evidence: PumpCurveStateEvidence, marketCap: bigint) {
  const tiers = evidence.feeSchedule.tiers
    .map((tier) => ({ ...tier, threshold: unsigned(tier.marketCapQuoteThreshold, "fee tier threshold") }))
    .sort((left, right) => (left.threshold < right.threshold ? -1 : left.threshold > right.threshold ? 1 : 0));
  if (tiers.length === 0) return evidence.feeSchedule;
  if (marketCap < tiers[0]!.threshold) return tiers[0]!;
  return tiers.reduce((selected, tier) => (marketCap >= tier.threshold ? tier : selected), tiers[0]!);
}

function ceilFee(amount: bigint, bps: number): bigint {
  if (bps === 0 || amount === 0n) return 0n;
  return (amount * BigInt(bps) + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR;
}

function positiveU64(value: string, label: string): bigint {
  const parsed = positive(value, label);
  if (parsed > U64_MAX) throw new Error(`Pump ${label} exceeds u64`);
  return parsed;
}

function positive(value: string, label: string): bigint {
  const parsed = unsigned(value, label);
  if (parsed === 0n) throw new Error(`Pump ${label} must be positive`);
  return parsed;
}

function unsigned(value: string, label: string): bigint {
  if (!/^\d+$/u.test(value)) throw new Error(`Pump ${label} is invalid`);
  return BigInt(value);
}

function safeBps(value: string, label: string): number {
  const parsed = unsigned(value, label);
  if (parsed > 10_000n) throw new Error(`Pump ${label} exceeds 10000 bps`);
  return Number(parsed);
}
