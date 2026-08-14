import assert from "node:assert/strict";
import test from "node:test";

import {
  PumpSimulationArtifactSchema,
  PumpTradeContractPreviewSchema,
  type PumpEligibilityEvidence,
  type PumpRiskEvidence,
} from "@silfable/contracts";

import { evaluatePumpExecutionReadiness } from "./execution-readiness.js";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const WALLET = "11111111111111111111111111111111";
const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";

test("Pump execution readiness binds every persisted gate but grants no authority", () => {
  const readiness = evaluatePumpExecutionReadiness({ sessionWalletAddress: WALLET, sessionTokenMint: MINT, preview: preview(), simulation: simulation(), now: NOW });
  assert.equal(readiness.status, "ready-for-final-approval");
  assert.equal(readiness.checks.every((check) => check.passed), true);
  assert.equal(readiness.requiresMasterPassword, true);
  assert.equal(readiness.requiredConfirmation, "EXECUTE PUMP MAINNET");
  assert.equal(readiness.executionAllowed, false);
});

test("Pump execution readiness blocks stale evidence and a changed session mint", () => {
  const stale = simulation("2026-07-22T11:57:00.000Z");
  const readiness = evaluatePumpExecutionReadiness({ sessionWalletAddress: WALLET, sessionTokenMint: "So11111111111111111111111111111111111111112", preview: preview(), simulation: stale, now: NOW });
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.checks.find((check) => check.id === "exact-mint")?.passed, false);
  assert.equal(readiness.checks.find((check) => check.id === "freshness")?.passed, false);
  assert.equal(readiness.executionAllowed, false);
});

function preview() {
  return PumpTradeContractPreviewSchema.parse({
    id: "00000000-0000-4000-8000-000000000001", status: "ready-for-review", goal: "Review an exact Pump buy",
    walletAddress: WALLET, side: "buy", tokenMint: MINT,
    inputMint: "So11111111111111111111111111111111111111112", outputMint: MINT, inputAmount: "1000000",
    maxSolExposureLamports: "1000000", minimumOutputAmount: "1", maxSlippageBps: 50,
    deadlineAt: "2026-07-22T12:30:00.000Z", stopConditions: ["Stop on any policy failure"], venue: "bonding-curve-active",
    risk: { mintAuthority: null, freezeAuthority: null, top10ConcentrationPercent: 20, liquidityVerified: true, evidenceSlot: 500 },
    quote: null, checks: [{ code: "wallet_registered", status: "pass", message: "Wallet is registered." }],
    executionAllowed: false, lifecycle: "proposal-only", createdAt: "2026-07-22T11:59:00.000Z",
  });
}

function simulation(simulatedAt = NOW.toISOString()) {
  const riskChecks = ["slippage", "per-trade-spend", "daily-spend", "per-token-exposure", "total-exposure", "open-positions", "hourly-transactions", "sol-reserve"] as const;
  const eligibilityChecks = ["exact-mint-binding", "finalized-state", "token-program", "authorities-revoked", "active-curve", "reserves-available", "fee-tier", "quote-binding", "state-freshness", "sell-path", "risk-policy", "simulation-passed", "program-allowlist", "no-execution-authority"] as const;
  const riskEvidence: PumpRiskEvidence = {
    side: "buy", proposedSpendLamports: "1000000", walletBalanceLamports: "100000000", maxNetworkFeeLamports: 200000,
    projectedWalletBalanceLamports: "99000000", reserveFloorLamports: "20000000", usageSource: "no-execution-baseline",
    usage: { dailySpendLamports: "0", perTokenExposureLamports: "0", totalExposureLamports: "0", openPositions: 0, transactionsThisHour: 0 },
    limits: { maxTradingFeeBps: 500, maxSlippageBps: 300, maxSpendPerTradeLamports: "50000000", maxDailySpendLamports: "200000000", maxPerTokenExposureLamports: "100000000", maxTotalExposureLamports: "500000000", maxOpenPositions: 5, maxTransactionsPerHour: 10, minSolReserveLamports: "20000000" },
    checks: riskChecks.map((id) => ({ id, passed: true, message: `${id} passed.` })), passed: true, evaluatedAt: simulatedAt,
  };
  const eligibilityEvidence: PumpEligibilityEvidence = {
    status: "eligible", tokenMint: MINT, venue: "bonding-curve-active", stateSlot: 500, simulationSlot: 501,
    checks: eligibilityChecks.map((id) => ({ id, passed: true, message: `${id} passed.` })), rankingAllowed: true,
    executionAllowed: false, evaluatedAt: simulatedAt,
  };
  return PumpSimulationArtifactSchema.parse({
    status: "passed", simulationSlot: 501, unitsConsumed: 120000, networkFeeLamports: 5000, rentLamports: 0,
    networkFeePercent: 0.5, totalKnownFeeLamports: "17346", feeRisk: "reasonable", invokedPrograms: [], logs: [], error: null,
    riskEvidence, eligibilityEvidence, transactionSigned: false, broadcastAttempted: false, simulatedAt,
  });
}
