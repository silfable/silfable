import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RuntimeDatabase } from "../storage/database.js";
import { EncryptedRobinhoodReceiptService } from "./robinhood-receipt-store.js";

class MemorySecrets {
  value: string | null = null;
  async getSecret() { return this.value; }
  async setSecret(_name: "robinhood-receipt-store-key", value: string) { this.value = value; }
}

test("Robinhood execution receipts are encrypted, recoverable, and omit signed transactions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-robinhood-receipts-")); const path = join(directory, "runtime.sqlite3");
  const secrets = new MemorySecrets();
  const receipt = { id: "00000000-0000-4000-8000-000000000001", transactionHash: "0x1234" as const, wallet: "0x1111111111111111111111111111111111111111" as const, kind: "approval" as const, status: "confirmed" as const, reconciledAt: "2026-07-27T00:00:00.000Z" };
  try {
    const database = await RuntimeDatabase.open(path); const store = new EncryptedRobinhoodReceiptService(database, secrets);
    await store.save(receipt); assert.deepEqual(await store.get(receipt.id), receipt);
    assert.deepEqual(await store.list(), [receipt]); database.close();
    const disk = await readFile(path); assert.equal(disk.includes(Buffer.from(receipt.transactionHash)), false);
    const reopened = await RuntimeDatabase.open(path); assert.deepEqual(await new EncryptedRobinhoodReceiptService(reopened, secrets).get(receipt.id), receipt); reopened.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
