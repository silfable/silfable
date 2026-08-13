import assert from "node:assert/strict";
import test from "node:test";

import { calculatePumpReferencePath, resolvePumpAnalysisIntent } from "./pump-analysis-utils";

const MINT = "So11111111111111111111111111111111111111112";

test("resolves an exact Pump analysis request and its reference SOL size", () => {
  const intent = resolvePumpAnalysisIntent(`Analisa token Pump.fun ${MINT} dengan reference 0.002 SOL`);
  assert.equal(intent.requested, true);
  assert.equal(intent.mint, MINT);
  assert.equal(intent.referenceBuyLamports, "2000000");
});

test("does not turn a Pump trade request into read-only analysis", () => {
  const intent = resolvePumpAnalysisIntent(`Beli token Pump.fun ${MINT} sebanyak 0.002 SOL`);
  assert.equal(intent.requested, false);
  assert.equal(intent.mint, null);
});

test("builds a deterministic reserve-only buy and sell-back path", () => {
  const path = calculatePumpReferencePath({
    quoteSymbol: "SOL",
    inputAmount: 1_000_000n,
    baseReserves: 1_000_000_000_000n,
    quoteReserves: 50_000_000_000n,
    availableBaseReserves: 900_000_000_000n,
    venue: "bonding-curve",
  });
  assert.equal(path.venue, "bonding-curve");
  assert.match(path.buyOutputTokenAmount ?? "", /^[1-9]\d*$/u);
  assert.match(path.sellOutputQuoteAmount ?? "", /^[1-9]\d*$/u);
  assert.equal(typeof path.buyPriceImpactBps, "number");
  assert.equal(path.networkFeeLamports, null);
});

test("blocks a reserve path when the venue is not SOL quoted", () => {
  const path = calculatePumpReferencePath({
    quoteSymbol: "USDC",
    inputAmount: 1_000_000n,
    baseReserves: 1_000_000n,
    quoteReserves: 1_000_000n,
    availableBaseReserves: 1_000_000n,
    venue: "pumpswap",
  });
  assert.equal(path.venue, "unavailable");
  assert.equal(path.buyOutputTokenAmount, null);
});
