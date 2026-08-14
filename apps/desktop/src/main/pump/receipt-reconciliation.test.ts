import assert from "node:assert/strict";
import { test } from "node:test";

import type { PumpTradeContractPreview } from "@silfable/contracts";

import { PumpReceiptReconciliationService } from "./receipt-reconciliation.js";

const WALLET = "AY8Ti7Tr7iUGksWJ7GjYy3vkE2YBv6qj9BnE8HtYCf8f";
const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const SIGNATURE = "3".repeat(64);

test("finalized Pump buy reconciliation separates network fee and token-account funding", async () => {
  const service = new PumpReceiptReconciliationService({
    async verifyTransactionSignature() { return { state: "finalized", slot: 900, error: null, verifiedAt: "2026-07-22T00:01:00.000Z" }; },
    async pumpTransactionSettlement() { return { slot: 900, feeLamports: 5_000, walletPreLamports: "100000000", walletPostLamports: "97955000", tokenMint: MINT, tokenPreRawAmount: "0", tokenPostRawAmount: "250000", tokenRawDelta: "250000", accountCreationFundingLamports: 1_040_000 }; },
  });
  const receipt = await service.reconcile({ receiptId: crypto.randomUUID(), preview: preview("buy"), signature: SIGNATURE, now: new Date("2026-07-22T00:02:00.000Z") });
  assert.equal(receipt.actualInputAmount, "1000000");
  assert.equal(receipt.actualOutputAmount, "250000");
  assert.equal(receipt.networkFeeLamports, 5_000);
  assert.equal(receipt.accountCreationFundingLamports, 1_040_000);
});

test("Pump reconciliation rejects non-finalized and directionally impossible settlement", async () => {
  const pending = new PumpReceiptReconciliationService({
    async verifyTransactionSignature() { return { state: "confirmed", slot: 900, error: null, verifiedAt: "2026-07-22T00:01:00.000Z" }; },
    async pumpTransactionSettlement() { throw new Error("must not read settlement"); },
  });
  await assert.rejects(() => pending.reconcile({ receiptId: crypto.randomUUID(), preview: preview("buy"), signature: SIGNATURE }), /not finalized/u);

  const impossible = new PumpReceiptReconciliationService({
    async verifyTransactionSignature() { return { state: "finalized", slot: 900, error: null, verifiedAt: "2026-07-22T00:01:00.000Z" }; },
    async pumpTransactionSettlement() { return { slot: 900, feeLamports: 5_000, walletPreLamports: "100000000", walletPostLamports: "99000000", tokenMint: MINT, tokenPreRawAmount: "0", tokenPostRawAmount: "0", tokenRawDelta: "0", accountCreationFundingLamports: 0 }; },
  });
  await assert.rejects(() => impossible.reconcile({ receiptId: crypto.randomUUID(), preview: preview("buy"), signature: SIGNATURE }), /does not prove/u);
});

test("reconcileUnknownBroadcast correctly returns pending, failed, or finalized without throwing", async () => {
  const pendingService = new PumpReceiptReconciliationService({
    async verifyTransactionSignature() { return { state: "confirmed", slot: 900, error: null, verifiedAt: "2026-07-22T00:01:00.000Z" }; },
    async pumpTransactionSettlement() { throw new Error("must not call settlement for pending"); },
  });
  const pendingResult = await pendingService.reconcileUnknownBroadcast({ receiptId: crypto.randomUUID(), preview: preview("buy"), signature: SIGNATURE });
  assert.deepEqual(pendingResult, { status: "pending", error: null });

  const failedService = new PumpReceiptReconciliationService({
    async verifyTransactionSignature() { return { state: "failed", slot: 900, error: "BlockhashExpired", verifiedAt: "2026-07-22T00:01:00.000Z" }; },
    async pumpTransactionSettlement() { throw new Error("must not call settlement for failed"); },
  });
  const failedResult = await failedService.reconcileUnknownBroadcast({ receiptId: crypto.randomUUID(), preview: preview("buy"), signature: SIGNATURE });
  assert.deepEqual(failedResult, { status: "failed", error: "BlockhashExpired" });

  const finalizedService = new PumpReceiptReconciliationService({
    async verifyTransactionSignature() { return { state: "finalized", slot: 900, error: null, verifiedAt: "2026-07-22T00:01:00.000Z" }; },
    async pumpTransactionSettlement() { return { slot: 900, feeLamports: 5_000, walletPreLamports: "100000000", walletPostLamports: "97955000", tokenMint: MINT, tokenPreRawAmount: "0", tokenPostRawAmount: "250000", tokenRawDelta: "250000", accountCreationFundingLamports: 1_040_000 }; },
  });
  const finalizedResult = await finalizedService.reconcileUnknownBroadcast({ receiptId: crypto.randomUUID(), preview: preview("buy"), signature: SIGNATURE, now: new Date("2026-07-22T00:02:00.000Z") });
  assert.equal(finalizedResult.status, "finalized");
  if (finalizedResult.status === "finalized") {
    assert.equal(finalizedResult.receipt.actualInputAmount, "1000000");
    assert.equal(finalizedResult.receipt.actualOutputAmount, "250000");
  }
});


function preview(side: "buy" | "sell"): PumpTradeContractPreview {
  return {
    id: "00000000-0000-4000-8000-000000000020", status: "ready-for-review", lifecycle: "proposal-only", goal: "Pump trade", side, venue: "bonding-curve-active",
    walletAddress: WALLET, tokenMint: MINT, inputMint: side === "buy" ? "So11111111111111111111111111111111111111112" : MINT, outputMint: side === "buy" ? MINT : "So11111111111111111111111111111111111111112",
    inputAmount: "1000000", maxSolExposureLamports: "1000000", minimumOutputAmount: "100000", maxSlippageBps: 300, deadlineAt: "2026-07-22T01:00:00.000Z",
    stopConditions: ["Stop on failure"], risk: { mintAuthority: null, freezeAuthority: null, top10ConcentrationPercent: 20, liquidityVerified: true, evidenceSlot: 500 },
    quote: null, checks: [{ code: "exact_mint_valid", status: "pass", message: "Exact mint bound" }], executionAllowed: false, createdAt: "2026-07-22T00:00:00.000Z",
  };
}
