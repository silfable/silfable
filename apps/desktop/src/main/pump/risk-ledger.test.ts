import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { PumpRiskLedgerEvent } from "@silfable/contracts";

import { RuntimeDatabase } from "../storage/database.js";
import { PumpRiskLedgerService } from "./risk-ledger.js";

class MemorySecrets {
  value: string | null = null;
  async getSecret() { return this.value; }
  async setSecret(_name: "pump-risk-ledger-key", value: string) { this.value = value; }
}

const WALLET = "11111111111111111111111111111111";
const TOKEN_A = "So11111111111111111111111111111111111111112";
const TOKEN_B = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function receipt(input: Partial<PumpRiskLedgerEvent> & Pick<PumpRiskLedgerEvent, "id" | "signature" | "tokenMint" | "side" | "spendLamports" | "exposureDeltaLamports" | "finalizedAt">): PumpRiskLedgerEvent {
  return {
    walletAddress: WALLET,
    slot: 434_000_000,
    chainVerification: "finalized",
    ...input,
  };
}

test("encrypted Pump ledger derives rolling usage from finalized receipts and survives reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-pump-ledger-"));
  const path = join(directory, "runtime.sqlite3");
  const secrets = new MemorySecrets();
  const now = new Date("2026-07-22T12:00:00.000Z");
  try {
    const database = await RuntimeDatabase.open(path);
    const ledger = new PumpRiskLedgerService(database, secrets);
    await ledger.recordFinalized(receipt({ id: "00000000-0000-4000-8000-000000000001", signature: "1".repeat(64), tokenMint: TOKEN_A, side: "buy", spendLamports: "1000", exposureDeltaLamports: "1000", finalizedAt: "2026-07-22T11:50:00.000Z" }));
    await ledger.recordFinalized(receipt({ id: "00000000-0000-4000-8000-000000000002", signature: "2".repeat(64), tokenMint: TOKEN_B, side: "buy", spendLamports: "2000", exposureDeltaLamports: "2000", finalizedAt: "2026-07-22T10:00:00.000Z" }));
    await ledger.recordFinalized(receipt({ id: "00000000-0000-4000-8000-000000000003", signature: "3".repeat(64), tokenMint: TOKEN_A, side: "sell", spendLamports: "0", exposureDeltaLamports: "-400", finalizedAt: "2026-07-22T11:55:00.000Z" }));
    assert.deepEqual(await ledger.usageFor(TOKEN_A, now), {
      dailySpendLamports: "3000",
      perTokenExposureLamports: "600",
      totalExposureLamports: "2600",
      openPositions: 2,
      transactionsThisHour: 2,
    });
    database.close();

    const disk = await readFile(path);
    assert.equal(disk.includes(Buffer.from(TOKEN_A)), false);
    assert.equal(disk.includes(Buffer.from("1".repeat(64))), false);

    const reopened = await RuntimeDatabase.open(path);
    assert.equal((await new PumpRiskLedgerService(reopened, secrets).usageFor(TOKEN_A, now)).perTokenExposureLamports, "600");
    reopened.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Pump ledger is idempotent and rejects conflicting or impossible finalized receipts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-pump-ledger-guard-"));
  try {
    const database = await RuntimeDatabase.open(join(directory, "runtime.sqlite3"));
    const ledger = new PumpRiskLedgerService(database, new MemorySecrets());
    const buy = receipt({ id: "00000000-0000-4000-8000-000000000010", signature: "4".repeat(64), tokenMint: TOKEN_A, side: "buy", spendLamports: "1000", exposureDeltaLamports: "1000", finalizedAt: "2026-07-22T11:50:00.000Z" });
    await ledger.recordFinalized(buy);
    await ledger.recordFinalized(buy);
    assert.equal((await ledger.usageFor(TOKEN_A, new Date("2026-07-22T12:00:00.000Z"))).dailySpendLamports, "1000");
    await assert.rejects(ledger.recordFinalized({ ...buy, id: "00000000-0000-4000-8000-000000000011", spendLamports: "2000" }), /conflicting/u);
    await assert.rejects(ledger.recordFinalized(receipt({ id: "00000000-0000-4000-8000-000000000012", signature: "5".repeat(64), tokenMint: TOKEN_A, side: "sell", spendLamports: "0", exposureDeltaLamports: "-1001", finalizedAt: "2026-07-22T11:59:00.000Z" })), /below zero/u);
    database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("recordReceipt converts PumpExecutionReceipt into ledger event and records it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-pump-ledger-receipt-"));
  try {
    const database = await RuntimeDatabase.open(join(directory, "runtime.sqlite3"));
    const ledger = new PumpRiskLedgerService(database, new MemorySecrets());
    const execReceipt = {
      id: "00000000-0000-4000-8000-000000000050",
      previewId: "00000000-0000-4000-8000-000000000020",
      signature: "6".repeat(64),
      walletAddress: WALLET,
      tokenMint: TOKEN_A,
      side: "buy" as const,
      status: "finalized" as const,
      slot: 500_000,
      networkFeeLamports: 5000,
      accountCreationFundingLamports: 0,
      walletLamportDelta: "-5000000",
      tokenRawDelta: "100000",
      actualInputAmount: "4995000",
      actualOutputAmount: "100000",
      chainVerification: "finalized" as const,
      signingSource: "future-local-signer" as const,
      broadcastAttempted: true as const,
      reconciledAt: "2026-07-22T11:50:00.000Z",
    };
    await ledger.recordReceipt(execReceipt);
    const usage = await ledger.usageFor(TOKEN_A, new Date("2026-07-22T12:00:00.000Z"));
    assert.equal(usage.dailySpendLamports, "4995000");
    assert.equal(usage.perTokenExposureLamports, "4995000");
    database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

