import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RuntimeDatabase } from "../storage/database.js";
import { AutonomousJobStore } from "./autonomous-job-store.js";

class Secrets {
  value: string | null = null;
  async getSecret(): Promise<string | null> { return this.value; }
  async setSecret(_name: string, value: string): Promise<void> { this.value = value; }
}

const WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";

test("autonomous jobs are immutable, encrypted, idempotent, and pause on unknown state", async () => {
  const path = join(tmpdir(), `silfable-autonomous-job-${randomUUID()}.sqlite`);
  const database = await RuntimeDatabase.open(path);
  const store = new AutonomousJobStore(database, new Secrets() as any);
  try {
    const input = {
      sessionId: randomUUID(), walletAddress: WALLET, walletScope: "solana" as const, chainKey: "solana" as const,
      kind: "SOLANA_SWAP" as const, capability: "SOLANA_SWAP" as const,
      policySnapshot: { maxSlippageBps: 50, maxFeeUsd: 1 },
      pinnedParameters: { inputMint: "So11111111111111111111111111111111111111112", outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amountRaw: "1000000" },
    };
    const job = await store.create(input);
    assert.equal(job.state, "DRAFT");
    assert.equal((await store.audit(job.id)).map((event) => event.event).join(","), "CREATED");
    await assert.rejects(() => store.create(input), /identical autonomous job/u);
    const armed = await store.arm(job.id, randomUUID());
    assert.equal(armed.state, "ARMED");
    const paused = await store.pause(job.id, "preflight quote changed");
    assert.equal(paused.state, "PAUSED");
    const bytes = await readFile(path);
    assert.equal(bytes.includes(Buffer.from(WALLET, "utf8")), false);
    assert.equal(bytes.includes(Buffer.from("amountRaw", "utf8")), false);
  } finally {
    database.close();
    await rm(path, { force: true });
  }
});
