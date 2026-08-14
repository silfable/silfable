import assert from "node:assert/strict";
import { test } from "node:test";

import { calculatePumpFeePreview } from "./fees.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";

test("Pump fee preview applies the finalized tier and preserves gross buy exposure", () => {
  const preview = calculatePumpFeePreview({ side: "buy", rawInputAmount: "1000000", maxTotalFeeBps: 500, evidence: evidence() });
  assert.equal(preview.protocolFeeBps, 95);
  assert.equal(preview.creatorFeeBps, 30);
  assert.equal(preview.totalTradingFeeBps, 125);
  assert.equal(preview.grossQuoteAmount, "1000000");
  assert.equal(preview.classification, "reasonable");
  assert.equal(preview.allowed, true);
  assert.equal(preview.networkFeeLamports, null);
  assert.equal(preview.rentLamports, null);
});

test("Pump fee preview blocks a finalized fee tier above the user ceiling", () => {
  const value = evidence();
  value.feeSchedule.tiers[0]!.protocolFeeBps = "450";
  value.feeSchedule.tiers[0]!.creatorFeeBps = "100";
  const preview = calculatePumpFeePreview({ side: "sell", rawInputAmount: "100000", maxTotalFeeBps: 500, evidence: value });
  assert.equal(preview.totalTradingFeeBps, 550);
  assert.equal(preview.classification, "extreme");
  assert.equal(preview.allowed, false);
});

test("Pump fee preview selects the highest threshold not exceeding market cap", () => {
  const value = evidence();
  value.feeSchedule.tiers = [
    { marketCapQuoteThreshold: "0", protocolFeeBps: "95", creatorFeeBps: "30" },
    { marketCapQuoteThreshold: "500000", protocolFeeBps: "80", creatorFeeBps: "20" },
  ];
  const preview = calculatePumpFeePreview({ side: "buy", rawInputAmount: "1000000", maxTotalFeeBps: 500, evidence: value });
  assert.equal(preview.marketCapQuoteRaw, "1000000");
  assert.equal(preview.totalTradingFeeBps, 100);
});

function evidence(): PumpV2FinalizedBuildEvidence {
  return {
    mint: "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump",
    tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    mintSecurity: { initialized: true, mintAuthority: null, freezeAuthority: null },
    creator: "5L5k7gtNLbeXdzpvNrFshg1E1id1ceUDfc6vPUTxp98q",
    feeRecipients: ["62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"],
    buybackFeeRecipients: ["5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD"],
    curve: { virtualTokenReserves: "1000000000000000", virtualQuoteReserves: "1000000", realTokenReserves: "800000000000000", tokenTotalSupply: "1000000000000000", mayhemMode: false },
    feeSchedule: { source: "fee-config", protocolFeeBps: "95", creatorFeeBps: "30", buybackAllocationBps: "0", tiers: [{ marketCapQuoteThreshold: "0", protocolFeeBps: "95", creatorFeeBps: "30" }] },
    slot: 1,
    commitment: "finalized",
    verifiedAt: "2026-07-22T00:00:00.000Z",
  };
}
