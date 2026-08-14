import assert from "node:assert/strict";
import { test } from "node:test";

import type { Hex } from "viem";

import type { RuntimeDatabase } from "../storage/database.js";
import type { EvmExecutionReceipt } from "./evm-kyber-execution.js";
import { EncryptedEvmReceiptService } from "./evm-receipt-store.js";

test("generic EVM receipts are encrypted and survive service restart", async () => {
  const records = new Map<string, {
    id: string;
    ciphertext: string;
    nonce: string;
    tag: string;
    updatedAt: string;
  }>();
  const database = {
    upsertEvmReceiptRecord(record: (typeof records extends Map<string, infer V> ? V : never)) {
      records.set(record.id, record);
    },
    listEvmReceiptRecords() {
      return [...records.values()];
    },
  } as unknown as RuntimeDatabase;
  let key: string | null = null;
  const secrets = {
    async getSecret() { return key; },
    async setSecret(_name: "evm-receipt-store-key", value: string) { key = value; },
  };
  const receipt: EvmExecutionReceipt = {
    id: crypto.randomUUID(),
    chainKey: "optimism",
    chainId: 10,
    transactionHash: `0x${"ab".repeat(32)}` as Hex,
    wallet: "0x1111111111111111111111111111111111111111",
    kind: "swap",
    status: "confirmed",
    tokenIn: "0x2222222222222222222222222222222222222222",
    tokenOut: "0x3333333333333333333333333333333333333333",
    amountIn: "100",
    expectedAmountOut: "99",
    minimumAmountOut: "98",
    networkFeeWei: "21000",
    broadcastAt: "2026-07-30T00:00:00.000Z",
    reconciledAt: "2026-07-30T00:01:00.000Z",
  };

  await new EncryptedEvmReceiptService(database, secrets).save(receipt);
  const stored = records.get(receipt.id);
  assert.ok(stored);
  assert.equal(stored.ciphertext.includes(receipt.transactionHash), false);
  assert.equal(stored.ciphertext.includes(receipt.wallet), false);

  const reopened = new EncryptedEvmReceiptService(database, secrets);
  assert.deepEqual(await reopened.list(), [receipt]);
});
