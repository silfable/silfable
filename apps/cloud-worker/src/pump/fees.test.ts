import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculatePumpFeePreview, type PumpCurveStateEvidence } from "./fees.js";

describe("Pump.fun Fee Guard (Cloud Worker)", () => {
  const mockEvidence: PumpCurveStateEvidence = {
    virtualTokenReserves: "1000000000000",
    virtualQuoteReserves: "30000000000",
    realTokenReserves: "800000000000",
    tokenTotalSupply: "1000000000000000",
    feeSchedule: {
      protocolFeeBps: "100", // 1%
      creatorFeeBps: "50",   // 0.5%
      buybackAllocationBps: "0",
      tiers: [],
    },
  };

  it("calculates fees accurately for a normal buy", () => {
    const preview = calculatePumpFeePreview({
      side: "buy",
      rawInputAmount: "1000000000", // 1 SOL
      maxTotalFeeBps: 200, // Max 2%
      evidence: mockEvidence,
    });

    assert.equal(preview.totalTradingFeeBps, 150); // 1.5% total
    assert.equal(preview.allowed, true);
    assert.equal(preview.classification, "reasonable");
  });

  it("rejects trades if protocol + creator fees exceed maxTotalFeeBps", () => {
    const preview = calculatePumpFeePreview({
      side: "buy",
      rawInputAmount: "1000000000",
      maxTotalFeeBps: 100, // Max 1% allowed, but actual is 1.5%
      evidence: mockEvidence,
    });

    assert.equal(preview.allowed, false);
  });
});
