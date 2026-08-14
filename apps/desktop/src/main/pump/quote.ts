import type { PumpFeePreview } from "./fees.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";

const BPS_DENOMINATOR = 10_000n;

export type PumpExecutableQuoteEvidence = {
  kind: "exact-finalized";
  side: "buy" | "sell";
  inputAmount: string;
  expectedOutputAmount: string;
  minimumOutputAmount: string;
  approvedMinimumOutputAmount: string;
  maxSlippageBps: number;
  stateSlot: number;
  derivedAt: string;
};

export function derivePumpExecutableQuote(input: {
  side: "buy" | "sell";
  inputAmount: string;
  approvedMinimumOutputAmount: string;
  maxSlippageBps: number;
  evidence: PumpV2FinalizedBuildEvidence;
  feePreview: PumpFeePreview;
  now?: Date;
}): PumpExecutableQuoteEvidence {
  if (!Number.isInteger(input.maxSlippageBps) || input.maxSlippageBps < 0 || input.maxSlippageBps > 3_000) {
    throw new Error("Pump executable quote slippage must be between 0 and 3000 bps");
  }
  if (input.evidence.mintSecurity.mintAuthority !== null || input.evidence.mintSecurity.freezeAuthority !== null) {
    throw new Error("Pump executable quote requires revoked mint and freeze authorities");
  }
  const expectedOutput = input.side === "buy"
    ? positive(input.feePreview.expectedTokenAmount, "expected token output")
    : positive(input.feePreview.netCurveQuoteAmount, "expected quote output");
  const approvedMinimum = positive(input.approvedMinimumOutputAmount, "approved minimum output");
  const slippageMinimum = expectedOutput * (BPS_DENOMINATOR - BigInt(input.maxSlippageBps)) / BPS_DENOMINATOR;
  if (slippageMinimum < 1n) throw new Error("Pump executable quote minimum output is zero");
  const minimumOutput = approvedMinimum > slippageMinimum ? approvedMinimum : slippageMinimum;
  if (minimumOutput > expectedOutput) {
    throw new Error("Pump approved minimum output exceeds the fresh finalized quote");
  }
  return {
    kind: "exact-finalized",
    side: input.side,
    inputAmount: positive(input.inputAmount, "input amount").toString(),
    expectedOutputAmount: expectedOutput.toString(),
    minimumOutputAmount: minimumOutput.toString(),
    approvedMinimumOutputAmount: approvedMinimum.toString(),
    maxSlippageBps: input.maxSlippageBps,
    stateSlot: input.evidence.slot,
    derivedAt: (input.now ?? new Date()).toISOString(),
  };
}

function positive(value: string | null, label: string): bigint {
  if (value === null || !/^[1-9]\d*$/u.test(value)) throw new Error(`Pump ${label} is invalid`);
  return BigInt(value);
}
