import assert from "node:assert/strict";
import { test } from "node:test";

import type { PumpFeePreview } from "./fees.js";
import { derivePumpExecutableQuote } from "./quote.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";

test("fresh Pump buy quote applies slippage and never weakens the approved minimum", () => {
  const quote = derivePumpExecutableQuote({ side: "buy", inputAmount: "1000000", approvedMinimumOutputAmount: "980000", maxSlippageBps: 100, evidence: evidence(), feePreview: feePreview("1000000", "1000000"), now: new Date("2026-07-22T00:00:00.000Z") });
  assert.equal(quote.expectedOutputAmount, "1000000");
  assert.equal(quote.minimumOutputAmount, "990000");
  assert.equal(quote.stateSlot, 500);
});

test("fresh Pump sell quote keeps a stricter user-approved minimum", () => {
  const quote = derivePumpExecutableQuote({ side: "sell", inputAmount: "1000000", approvedMinimumOutputAmount: "995000", maxSlippageBps: 100, evidence: evidence(), feePreview: feePreview(null, "1000000") });
  assert.equal(quote.minimumOutputAmount, "995000");
});

test("fresh Pump quote blocks an approved minimum above current finalized output", () => {
  assert.throws(() => derivePumpExecutableQuote({ side: "buy", inputAmount: "1000000", approvedMinimumOutputAmount: "1000001", maxSlippageBps: 100, evidence: evidence(), feePreview: feePreview("1000000", "1000000") }), /exceeds the fresh/u);
});

function feePreview(expectedTokenAmount: string | null, netCurveQuoteAmount: string): PumpFeePreview {
  return { side: expectedTokenAmount === null ? "sell" : "buy", marketCapQuoteRaw: "1", protocolFeeBps: 95, creatorFeeBps: 30, totalTradingFeeBps: 125, buybackAllocationBps: 5000, grossQuoteAmount: "1000000", netCurveQuoteAmount, protocolFeeQuoteAmount: "9500", creatorFeeQuoteAmount: "3000", totalTradingFeeQuoteAmount: "12500", expectedTokenAmount, classification: "reasonable", maxTotalFeeBps: 500, allowed: true, networkFeeLamports: null, rentLamports: null, disclosure: "test" };
}

function evidence(): PumpV2FinalizedBuildEvidence {
  return { mint: "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump", tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", mintSecurity: { initialized: true, mintAuthority: null, freezeAuthority: null }, creator: "5L5k7gtNLbeXdzpvNrFshg1E1id1ceUDfc6vPUTxp98q", feeRecipients: ["62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"], buybackFeeRecipients: ["5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD"], curve: { virtualTokenReserves: "1", virtualQuoteReserves: "1", realTokenReserves: "1", tokenTotalSupply: "1", mayhemMode: false }, feeSchedule: { source: "fee-config", protocolFeeBps: "95", creatorFeeBps: "30", buybackAllocationBps: "5000", tiers: [] }, slot: 500, commitment: "finalized", verifiedAt: "2026-07-22T00:00:00.000Z" };
}
