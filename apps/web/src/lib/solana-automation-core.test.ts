import assert from "node:assert/strict";
import test from "node:test";
import { CreateSolanaAutomationSchema, SOL_MINT, USDC_MINT, decimalToRaw, evaluateAutomation } from "./solana-automation-core";

test("converts decimal token amounts without floating point", () => {
  assert.equal(decimalToRaw("0.0005", 9), 500_000n);
  assert.equal(decimalToRaw("1.25", 6), 1_250_000n);
});

test("validates a bounded DCA strategy", () => {
  const result = CreateSolanaAutomationSchema.safeParse({ kind: "DCA", common: { sessionId: "a".repeat(24), walletAddress: "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg", input: { mint: SOL_MINT, symbol: "SOL", decimals: 9 }, output: { mint: USDC_MINT, symbol: "USDC", decimals: 6 }, amount: "0.001", expiresInDays: 30 }, intervalSeconds: 3600, maximumExecutions: 5 });
  assert.equal(result.success, true);
});

test("exit triggers stop loss before take profit", () => {
  const result = evaluateAutomation({ kind: "EXIT", status: "ACTIVE", expiresAt: new Date("2030-01-01"), nextWakeAt: null, completedExecutions: 0, maximumExecutions: null, takeProfitPriceUsd: 150, stopLossPriceUsd: 90 }, new Date("2029-01-01"), 89);
  assert.equal(result, "STOP_LOSS");
});
