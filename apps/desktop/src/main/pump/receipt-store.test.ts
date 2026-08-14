import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { PumpExecutionReceipt } from "@silfable/contracts";

import { RuntimeDatabase } from "../storage/database.js";
import { EncryptedPumpReceiptService } from "./receipt-store.js";

class MemorySecrets {
  value: string | null = null;
  async getSecret() { return this.value; }
  async setSecret(_name: "pump-receipt-store-key", value: string) { this.value = value; }
}

const WALLET = "11111111111111111111111111111111";
const TOKEN_A = "So11111111111111111111111111111111111111112";

function mockReceipt(id: string): PumpExecutionReceipt {
  return {
    id,
    previewId: "00000000-0000-4000-8000-000000000099",
    signature: "1".repeat(64),
    walletAddress: WALLET,
    tokenMint: TOKEN_A,
    side: "buy",
    status: "finalized",
    slot: 434_000_000,
    networkFeeLamports: 5000,
    accountCreationFundingLamports: 2039280,
    walletLamportDelta: "-1002044280",
    tokenRawDelta: "1000000",
    actualInputAmount: "1000000000",
    actualOutputAmount: "1000000",
    chainVerification: "finalized",
    signingSource: "future-local-signer",
    broadcastAttempted: true,
    reconciledAt: "2026-07-22T12:00:00.000Z",
  };
}

test("encrypted Pump receipt store saves, retrieves, lists receipts and survives reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-pump-receipt-store-"));
  const path = join(directory, "runtime.sqlite3");
  const secrets = new MemorySecrets();
  try {
    const database = await RuntimeDatabase.open(path);
    const store = new EncryptedPumpReceiptService(database, secrets);

    const r1 = mockReceipt("00000000-0000-4000-8000-000000000001");
    const r2 = mockReceipt("00000000-0000-4000-8000-000000000002");
    r2.reconciledAt = "2026-07-22T12:05:00.000Z";

    await store.saveReceipt(r1);
    await store.saveReceipt(r2);

    const fetchedR1 = await store.getReceipt(r1.id);
    assert.deepEqual(fetchedR1, r1);

    const all = await store.listReceipts();
    assert.equal(all.length, 2);
    assert.equal(all[0]!.id, r2.id); // sorted DESC by reconciledAt/updatedAt

    const rawFile = await readFile(path, "utf8");
    assert.equal(rawFile.includes(r1.signature), false);
    assert.equal(rawFile.includes(r1.walletAddress), false);

    database.close();

    // Reopen database
    const reopenedDb = await RuntimeDatabase.open(path);
    const reopenedStore = new EncryptedPumpReceiptService(reopenedDb, secrets);
    const restoredR1 = await reopenedStore.getReceipt(r1.id);
    assert.deepEqual(restoredR1, r1);
    reopenedDb.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
