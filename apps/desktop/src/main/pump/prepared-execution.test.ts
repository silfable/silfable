import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  PumpRiskEvidence,
  PumpSimulationArtifact,
  PumpTradeContractPreview,
} from "@silfable/contracts";

import {
  evaluatePumpFinalRevalidation,
  PumpPreparedExecutionService,
} from "./prepared-execution.js";
import type { PumpV2ProductionSimulation } from "./production.js";

const SESSION = "00000000-0000-4000-8000-000000000010";
const PREVIEW = "00000000-0000-4000-8000-000000000020";
const WALLET = "AY8Ti7Tr7iUGksWJ7GjYy3vkE2YBv6qj9BnE8HtYCf8f";
const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";

test("prepared Pump transaction is one-time, session-bound, and expires closed", () => {
  const service = new PumpPreparedExecutionService();
  const now = new Date("2026-07-22T00:00:00.000Z");
  service.prepare({ sessionId: SESSION, preview: preview(), production: production(), simulation: simulation(), buildInput: buildInput(), now });
  assert.throws(() => service.consume({ sessionId: crypto.randomUUID(), preview: preview(), now }), /does not match/u);
  assert.throws(() => service.consume({ sessionId: SESSION, preview: preview(), now }), /expired/u);

  service.prepare({ sessionId: SESSION, preview: preview(), production: production(), simulation: simulation(), buildInput: buildInput(), now });
  assert.throws(() => service.consume({ sessionId: SESSION, preview: preview(), now: new Date(now.getTime() + 90_001) }), /expired/u);
});

test("final Pump revalidation proves fresh unsigned evidence without granting authority", () => {
  const service = new PumpPreparedExecutionService();
  const now = new Date("2026-07-22T00:00:00.000Z");
  service.prepare({ sessionId: SESSION, preview: preview(), production: production(), simulation: simulation(), buildInput: buildInput(), now });
  const prepared = service.consume({ sessionId: SESSION, preview: preview(), now: new Date(now.getTime() + 1_000) });
  const result = evaluatePumpFinalRevalidation({ prepared, preview: preview(), production: production(501), simulation: simulation(501), risk: risk(), now: new Date(now.getTime() + 2_000) });
  assert.equal(result.status, "ready-for-password");
  assert.equal(result.checks.length, 12);
  assert.equal(result.signingAttempted, false);
  assert.equal(result.broadcastAttempted, false);
  assert.equal(result.executionAllowed, false);
});

test("final prepared Pump transaction is digest-bound, one-time, and expires closed", () => {
  const service = new PumpPreparedExecutionService();
  const now = new Date("2026-07-22T00:00:00.000Z");
  service.prepare({ sessionId: SESSION, preview: preview(), production: production(), simulation: simulation(), buildInput: buildInput(), now });
  const initial = service.consume({ sessionId: SESSION, preview: preview(), now: new Date(now.getTime() + 1_000) });
  const finalProduction = production(501);
  const revalidation = evaluatePumpFinalRevalidation({
    prepared: initial,
    preview: preview(),
    production: finalProduction,
    simulation: simulation(501),
    risk: risk(),
    now: new Date(now.getTime() + 2_000),
  });
  service.prepareFinal({
    sessionId: SESSION,
    preview: preview(),
    production: finalProduction,
    revalidation,
    now: new Date(now.getTime() + 2_000),
  });
  const consumed = service.consumeFinal({
    sessionId: SESSION,
    preview: preview(),
    expectedDigest: revalidation.finalTransactionDigest,
    now: new Date(now.getTime() + 3_000),
  });
  assert.equal(consumed.revalidation.finalTransactionDigest, revalidation.finalTransactionDigest);
  assert.throws(() => service.consumeFinal({
    sessionId: SESSION,
    preview: preview(),
    expectedDigest: revalidation.finalTransactionDigest,
    now: new Date(now.getTime() + 3_001),
  }), /expired/u);
});

function buildInput() {
  return { side: "buy" as const, walletAddress: WALLET, tokenMint: MINT, inputAmount: "1000000", minimumOutputAmount: "100000", maxTotalFeeBps: 500, maxSlippageBps: 300, maxNetworkFeeLamports: 500_000, maxFeePercent: 5 };
}

function preview(): PumpTradeContractPreview {
  return {
    id: PREVIEW, status: "ready-for-review", lifecycle: "proposal-only", goal: "Buy exact Pump mint", side: "buy", venue: "bonding-curve-active",
    walletAddress: WALLET, tokenMint: MINT, inputMint: "So11111111111111111111111111111111111111112", outputMint: MINT, inputAmount: "1000000", maxSolExposureLamports: "1000000", minimumOutputAmount: "100000", maxSlippageBps: 300,
    deadlineAt: "2026-07-22T01:00:00.000Z", stopConditions: ["Stop on any policy failure"], quote: null,
    risk: { mintAuthority: null, freezeAuthority: null, top10ConcentrationPercent: 20, liquidityVerified: true, evidenceSlot: 500 },
    checks: [{ code: "exact_mint_valid", status: "pass", message: "Exact mint bound" }], executionAllowed: false, createdAt: "2026-07-22T00:00:00.000Z",
  };
}

function production(slot = 500): PumpV2ProductionSimulation {
  return {
    stateEvidence: { mint: MINT, slot, commitment: "finalized" },
    instruction: { plan: { walletAddress: WALLET } },
    unsignedTransaction: { serialized: Uint8Array.of(1, 2, slot % 255), signed: false, blockhashContextSlot: slot, lastValidBlockHeight: 1_000 },
    executableQuote: { side: "buy", inputAmount: "1000000", minimumOutputAmount: "100000", approvedMinimumOutputAmount: "100000", expectedOutputAmount: "110000", maxSlippageBps: 300, stateSlot: slot },
    simulation: simulation(slot),
    broadcastAttempted: false,
  } as unknown as PumpV2ProductionSimulation;
}

function simulation(slot = 500): PumpSimulationArtifact {
  return {
    status: "passed", simulationSlot: slot, unitsConsumed: 100_000, networkFeeLamports: 5_000, rentLamports: 0, networkFeePercent: 0.5,
    totalKnownFeeLamports: "5000", feeRisk: "reasonable", invokedPrograms: [], logs: [], error: null,
    riskEvidence: risk(), eligibilityEvidence: { status: "eligible", tokenMint: MINT, venue: "bonding-curve-active", stateSlot: slot, simulationSlot: slot, checks: eligibilityChecks(), rankingAllowed: true, executionAllowed: false, evaluatedAt: "2026-07-22T00:00:00.000Z" },
    executionReadiness: { status: "ready-for-final-approval", previewId: PREVIEW, walletAddress: WALLET, tokenMint: MINT, side: "buy", checks: readinessChecks(), requiresMasterPassword: true, requiredConfirmation: "EXECUTE PUMP MAINNET", executionAllowed: false, evaluatedAt: "2026-07-22T00:00:00.000Z", expiresAt: "2026-07-22T00:02:00.000Z" },
    transactionSigned: false, broadcastAttempted: false, simulatedAt: "2026-07-22T00:00:00.000Z",
  };
}

function risk(): PumpRiskEvidence {
  const ids = ["slippage", "per-trade-spend", "daily-spend", "per-token-exposure", "total-exposure", "open-positions", "hourly-transactions", "sol-reserve"] as const;
  return { side: "buy", proposedSpendLamports: "1000000", walletBalanceLamports: "100000000", maxNetworkFeeLamports: 500000, projectedWalletBalanceLamports: "98500000", reserveFloorLamports: "20000000", usageSource: "no-execution-baseline", usage: { dailySpendLamports: "0", perTokenExposureLamports: "0", totalExposureLamports: "0", openPositions: 0, transactionsThisHour: 0 }, limits: { maxTradingFeeBps: 500, maxSlippageBps: 300, maxSpendPerTradeLamports: "50000000", maxDailySpendLamports: "200000000", maxPerTokenExposureLamports: "100000000", maxTotalExposureLamports: "500000000", maxOpenPositions: 5, maxTransactionsPerHour: 10, minSolReserveLamports: "20000000" }, checks: ids.map((id) => ({ id, passed: true, message: "Pass" })), passed: true, evaluatedAt: "2026-07-22T00:00:00.000Z" };
}

function readinessChecks(): NonNullable<PumpSimulationArtifact["executionReadiness"]>["checks"] {
  const ids = ["session-binding", "exact-mint", "proposal-ready", "simulation-passed", "fee-guard", "eligibility", "risk-policy", "freshness", "unsigned", "no-broadcast"] as const;
  return ids.map((id) => ({ id, passed: true, message: "Pass" }));
}

function eligibilityChecks(): NonNullable<PumpSimulationArtifact["eligibilityEvidence"]>["checks"] {
  const ids = ["exact-mint-binding", "finalized-state", "token-program", "authorities-revoked", "active-curve", "reserves-available", "fee-tier", "quote-binding", "state-freshness", "sell-path", "risk-policy", "simulation-passed", "program-allowlist", "no-execution-authority"] as const;
  return ids.map((id) => ({ id, passed: true, message: "Pass" }));
}
