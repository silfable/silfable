import assert from "node:assert/strict";
import test from "node:test";

import { PumpResearchEligibilitySchema, type PumpTokenIntelligence } from "@silfable/contracts";

import { evaluatePumpResearchEligibility } from "./research-eligibility.js";

const NOW = new Date("2026-07-22T12:00:00.000Z");

test("Pump research eligibility permits ranking only after all read-only gates pass", () => {
  const result = evaluatePumpResearchEligibility(intelligence(), NOW);
  assert.equal(result.status, "eligible");
  assert.equal(result.rankingAllowed, true);
  assert.equal(result.executionAllowed, false);
  assert.equal(result.checks.length, 10);
  assert.equal(result.checks.every((check) => check.passed), true);
});

test("Pump research eligibility blocks concentrated, stale, and missing sell-path evidence", () => {
  const unsafe = intelligence();
  unsafe.top10ConcentrationPercent = 91;
  unsafe.verifiedAt = "2026-07-22T11:57:00.000Z";
  unsafe.metrics.referencePath.sellOutputQuoteAmount = null;
  const result = evaluatePumpResearchEligibility(unsafe, NOW);
  assert.equal(result.status, "blocked");
  assert.equal(result.rankingAllowed, false);
  assert.equal(result.checks.find((check) => check.id === "holder-concentration")?.passed, false);
  assert.equal(result.checks.find((check) => check.id === "reference-sell-path")?.passed, false);
  assert.equal(result.checks.find((check) => check.id === "freshness")?.passed, false);
});

test("Pump research eligibility contracts reject duplicated checks and inconsistent ranking", () => {
  const result = evaluatePumpResearchEligibility(intelligence(), NOW);
  assert.equal(PumpResearchEligibilitySchema.safeParse({ ...result, checks: result.checks.map(() => result.checks[0]) }).success, false);
  assert.equal(PumpResearchEligibilitySchema.safeParse({ ...result, rankingAllowed: false }).success, false);
});

function intelligence(): PumpTokenIntelligence {
  return {
    mint: "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump", programId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", pumpSwapProgramId: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    bondingCurveAddress: "11111111111111111111111111111111", pumpSwapPoolAddress: "11111111111111111111111111111111", venue: "bonding-curve-active", bondingCurveExists: true, accountVerified: true, pumpSwapPoolVerified: false, complete: false,
    virtualTokenReserves: "1000000000", virtualQuoteReserves: "30000000000", realTokenReserves: "700000000", realQuoteReserves: "1000000000", tokenTotalSupply: "1000000000",
    tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", decimals: 6, mintSupply: "1000000000", mintAuthority: null, freezeAuthority: null, top10ConcentrationPercent: 20,
    poolBaseTokenAccount: null, poolQuoteTokenAccount: null, poolBaseReserves: null, poolQuoteReserves: null, pumpSwapVirtualQuoteReserves: null, pumpSwapEffectiveQuoteReserves: null,
    metrics: { quoteMint: "So11111111111111111111111111111111111111112", quoteSymbol: "SOL", spotPriceQuotePerToken: 30, estimatedMarketCapQuote: 30000, curveProgressPercent: 10, quoteReservesUi: 30, referenceBuyInputLamports: "1000000", referenceBuyPriceImpactBps: 100,
      referencePath: { venue: "bonding-curve", buyInputQuoteAmount: "1000000", buyOutputTokenAmount: "35000", buyPriceImpactBps: 100, sellInputTokenAmount: "35000", sellOutputQuoteAmount: "980000", sellPriceImpactBps: 120, roundTripLossBps: 200, estimateKind: "reserve-only", networkFeeLamports: null, rentLamports: null, disclosure: "Read-only reserve estimate." },
      priceImpactNote: "Read-only estimate.", baseProtocolFeeBps: 100, baseCreatorFeeBps: 50, feeNote: "Simulation required." },
    slot: 500, warnings: ["Read-only."], verifiedAt: "2026-07-22T11:59:30.000Z",
  };
}
