export const ROBINHOOD_PILOT_POLICY = Object.freeze({
  maxTradeUsd: 10,
  maxDailyUsd: 50,
  maxSlippageBps: 100,
  maxGasWei: 1_000_000_000_000_000n, // 0.001 ETH
  allowedSymbols: ["AAPL", "TSLA", "NVDA"] as const,
});

/** Deterministic pilot scope. Full value/gas enforcement occurs on the final simulated transaction. */
export function assertRobinhoodPilotQuotePolicy(input: { sellSymbol: string; buySymbol: string; slippageBps: number }): void {
  if (!Number.isInteger(input.slippageBps) || input.slippageBps < 0 || input.slippageBps > ROBINHOOD_PILOT_POLICY.maxSlippageBps) {
    throw new Error(`Robinhood pilot slippage cannot exceed ${ROBINHOOD_PILOT_POLICY.maxSlippageBps} bps`);
  }
  const symbols = new Set(ROBINHOOD_PILOT_POLICY.allowedSymbols);
  if (!symbols.has(input.sellSymbol as typeof ROBINHOOD_PILOT_POLICY.allowedSymbols[number]) || !symbols.has(input.buySymbol as typeof ROBINHOOD_PILOT_POLICY.allowedSymbols[number])) {
    throw new Error(`Robinhood pilot is limited to: ${ROBINHOOD_PILOT_POLICY.allowedSymbols.join(", ")}`);
  }
}
