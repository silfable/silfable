import assert from "node:assert/strict";
import test from "node:test";

import { RobinhoodReceiptReconciliationService } from "./robinhood-reconciliation.js";

const unknown = { id: "00000000-0000-4000-8000-000000000001", transactionHash: "0x1234" as const, wallet: "0x1111111111111111111111111111111111111111" as const, kind: "swap" as const, status: "unknown" as const, reconciledAt: "2026-07-27T00:00:00.000Z" };

test("Robinhood recovery reconciles a recorded hash without any rebroadcast capability", async () => {
  const saved: Array<{ status: string }> = [];
  const service = new RobinhoodReceiptReconciliationService({ list: async () => [unknown], save: async (receipt) => { saved.push(receipt); } });
  const result = await service.reconcilePending({ getReceiptStatus: async () => "success" }, new Date("2026-07-27T01:00:00.000Z"));
  assert.equal(result[0]!.status, "confirmed");
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.status, "confirmed");
});

test("Robinhood recovery leaves pending hashes untouched when a receipt is not available", async () => {
  const service = new RobinhoodReceiptReconciliationService({ list: async () => [unknown], save: async () => { throw new Error("must not save"); } });
  assert.deepEqual(await service.reconcilePending({ getReceiptStatus: async () => null }), []);
});
