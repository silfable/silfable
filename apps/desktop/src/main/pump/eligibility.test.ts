import assert from "node:assert/strict";
import test from "node:test";

import type { PumpSimulationArtifact } from "@silfable/contracts";

import { evaluatePumpTradeEligibility } from "./eligibility.js";
import type { PumpFeePreview } from "./fees.js";
import { PUMP_PROGRAM_ID } from "./inspector.js";
import type { PumpExecutableQuoteEvidence } from "./quote.js";
import { DEFAULT_PUMP_RISK_SETTINGS, evaluatePumpProposalRisk } from "./risk-settings.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";

const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const NOW = new Date("2026-07-22T12:00:00.000Z");

test("Pump trade eligibility allows AI ranking only after every deterministic gate passes", () => {
  const evidence = evaluatePumpTradeEligibility(input());
  assert.equal(evidence.status, "eligible");
  assert.equal(evidence.rankingAllowed, true);
  assert.equal(evidence.executionAllowed, false);
  assert.equal(evidence.checks.length, 14);
  assert.equal(evidence.checks.every((check) => check.passed), true);
});

test("Pump trade eligibility blocks stale state and non-allowlisted simulation programs", () => {
  const stale = input();
  stale.state = { ...stale.state, verifiedAt: "2026-07-22T11:57:00.000Z" };
  stale.simulation = { ...stale.simulation, invokedPrograms: [...stale.simulation.invokedPrograms, "BPFLoaderUpgradeab1e11111111111111111111111"] };
  const evidence = evaluatePumpTradeEligibility(stale);
  assert.equal(evidence.status, "blocked");
  assert.equal(evidence.rankingAllowed, false);
  assert.equal(evidence.checks.find((check) => check.id === "state-freshness")?.passed, false);
  assert.equal(evidence.checks.find((check) => check.id === "program-allowlist")?.passed, false);
});

function input() {
  const state: PumpV2FinalizedBuildEvidence = {
    mint: MINT,
    tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    creator: "5L5k7gtNLbeXdzpvNrFshg1E1id1ceUDfc6vPUTxp98q",
    mintSecurity: { initialized: true, mintAuthority: null, freezeAuthority: null },
    feeRecipients: ["62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"],
    buybackFeeRecipients: ["5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD"],
    curve: { virtualTokenReserves: "1000000000000000", virtualQuoteReserves: "1000000", realTokenReserves: "800000000000000", tokenTotalSupply: "1000000000000000", mayhemMode: false },
    feeSchedule: { source: "fee-config", protocolFeeBps: "95", creatorFeeBps: "30", buybackAllocationBps: "5000", tiers: [] },
    slot: 500,
    commitment: "finalized",
    verifiedAt: "2026-07-22T11:59:30.000Z",
  };
  const fee: PumpFeePreview = {
    side: "buy", marketCapQuoteRaw: "1000000", protocolFeeBps: 95, creatorFeeBps: 30,
    totalTradingFeeBps: 125, buybackAllocationBps: 5000, grossQuoteAmount: "1000000",
    netCurveQuoteAmount: "987653", protocolFeeQuoteAmount: "9383", creatorFeeQuoteAmount: "2963",
    totalTradingFeeQuoteAmount: "12346", expectedTokenAmount: "100000", classification: "reasonable",
    maxTotalFeeBps: 500, allowed: true, networkFeeLamports: null, rentLamports: null, disclosure: "Finalized fee evidence.",
  };
  const quote: PumpExecutableQuoteEvidence = {
    kind: "exact-finalized", side: "buy", inputAmount: "1000000", expectedOutputAmount: "100000",
    minimumOutputAmount: "99500", approvedMinimumOutputAmount: "99000", maxSlippageBps: 50,
    stateSlot: 500, derivedAt: "2026-07-22T11:59:31.000Z",
  };
  const risk = evaluatePumpProposalRisk({
    side: "buy", inputAmount: "1000000", maxSlippageBps: 50, walletSolLamports: "100000000",
    maxNetworkFeeLamports: 200000, settings: DEFAULT_PUMP_RISK_SETTINGS,
    usage: { dailySpendLamports: "0", perTokenExposureLamports: "0", totalExposureLamports: "0", openPositions: 0, transactionsThisHour: 0 },
  }, NOW);
  const simulation: PumpSimulationArtifact = {
    status: "passed", simulationSlot: 501, unitsConsumed: 120000, networkFeeLamports: 5000,
    rentLamports: 0, networkFeePercent: 0.5, totalKnownFeeLamports: "17346", feeRisk: "reasonable",
    invokedPrograms: [PUMP_PROGRAM_ID], logs: [], error: null, transactionSigned: false,
    broadcastAttempted: false, simulatedAt: NOW.toISOString(),
  };
  return { side: "buy" as const, tokenMint: MINT, inputAmount: "1000000", state, fee, quote, risk, simulation, now: NOW };
}
