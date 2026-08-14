import assert from "node:assert/strict";
import { test } from "node:test";

import type { Hex } from "viem";

import type { EvmExecutionReceipt } from "./evm-kyber-execution.js";
import { EvmReceiptReconciliationService } from "./evm-reconciliation.js";

const UNKNOWN: EvmExecutionReceipt = {
  id: crypto.randomUUID(),
  chainKey: "robinhood",
  chainId: 4663,
  transactionHash: `0x${"12".repeat(32)}` as Hex,
  wallet: "0x1111111111111111111111111111111111111111",
  kind: "swap",
  status: "unknown",
  tokenIn: "0x2222222222222222222222222222222222222222",
  tokenOut: "0x3333333333333333333333333333333333333333",
  amountIn: "100",
  expectedAmountOut: "99",
  minimumAmountOut: "98",
  networkFeeWei: "21000",
  broadcastAt: "2026-07-30T00:00:00.000Z",
  reconciledAt: "2026-07-30T00:00:00.000Z",
};

test("EVM receipt reconciliation reads a known hash without broadcasting", async () => {
  const saved: EvmExecutionReceipt[] = [];
  const service = new EvmReceiptReconciliationService({
    async list() { return [UNKNOWN]; },
    async save(receipt) { saved.push(receipt); },
  });
  let reads = 0;
  const reconciled = await service.reconcilePending(async ({ chainKey, chainId }) => {
    assert.equal(chainKey, "robinhood");
    assert.equal(chainId, 4663);
    return {
      async getReceiptStatus(hash) {
        reads += 1;
        assert.equal(hash, UNKNOWN.transactionHash);
        return "success";
      },
    };
  }, new Date("2026-07-30T01:00:00.000Z"));

  assert.equal(reads, 1);
  assert.equal(reconciled[0]?.status, "confirmed");
  assert.equal(saved[0]?.reconciledAt, "2026-07-30T01:00:00.000Z");
});

test("unresolved EVM receipt remains unknown without a write", async () => {
  const saved: EvmExecutionReceipt[] = [];
  const service = new EvmReceiptReconciliationService({
    async list() { return [UNKNOWN]; },
    async save(receipt) { saved.push(receipt); },
  });
  const reconciled = await service.reconcilePending(async () => ({
    async getReceiptStatus() { return null; },
  }));
  assert.deepEqual(reconciled, []);
  assert.deepEqual(saved, []);
});
