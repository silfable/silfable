export type SlippageCheckInput = {
  side: "buy" | "sell";
  expectedOutputAmount: string;
  minimumOutputAmount: string;
  slippageBps: number;
};

export type SlippageCheckResult = {
  valid: boolean;
  expectedOutputAmount: string;
  minimumOutputAmount: string;
  allowedSlippageBps: number;
  actualSlippageBps: number;
  reason?: string;
};

const BPS_DENOMINATOR = 10_000n;

export function validatePumpSlippage(input: SlippageCheckInput): SlippageCheckResult {
  const expected = BigInt(input.expectedOutputAmount);
  const minimum = BigInt(input.minimumOutputAmount);

  if (expected <= 0n) {
    throw new Error("Expected output amount must be positive");
  }

  if (minimum <= 0n) {
    throw new Error("Minimum output amount must be positive");
  }

  if (minimum > expected) {
    return {
      valid: false,
      expectedOutputAmount: input.expectedOutputAmount,
      minimumOutputAmount: input.minimumOutputAmount,
      allowedSlippageBps: input.slippageBps,
      actualSlippageBps: 0,
      reason: "Minimum output amount cannot exceed expected output amount",
    };
  }

  // Calculate actual slippage in Basis Points
  const diff = expected - minimum;
  const actualSlippageBps = Number((diff * BPS_DENOMINATOR) / expected);

  const valid = actualSlippageBps <= input.slippageBps;

  return {
    valid,
    expectedOutputAmount: input.expectedOutputAmount,
    minimumOutputAmount: input.minimumOutputAmount,
    allowedSlippageBps: input.slippageBps,
    actualSlippageBps,
    reason: valid
      ? undefined
      : `Actual slippage (${actualSlippageBps} bps) exceeds maximum allowed slippage (${input.slippageBps} bps)`,
  };
}
