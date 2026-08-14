import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RuntimeDatabase } from "../storage/database.js";
import { EncryptedFullAccessExecutionGrantService } from "./full-access-execution-grants.js";
import { LocalSigningSessionService } from "./local-signing-session.js";
import { AutonomousJobStore } from "../execution/autonomous-job-store.js";

class Secrets {
  value: string | null = null;
  async getSecret(): Promise<string | null> { return this.value; }
  async setSecret(_name: string, value: string): Promise<void> { this.value = value; }
}

const WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("execution grants are separate, encrypted, 24-hour bounded, and clear signing state on pause", async () => {
  const path = join(tmpdir(), `silfable-full-access-v2-${randomUUID()}.sqlite`);
  const database = await RuntimeDatabase.open(path);
  const secrets = new Secrets();
  const vault = { isLocked: () => false } as any;
  const signingSession = new LocalSigningSessionService(vault);
  const jobs = new AutonomousJobStore(database, secrets as any);
  const service = new EncryptedFullAccessExecutionGrantService(database, secrets as any, signingSession, jobs);
  try {
    const job = await jobs.create({
      sessionId: randomUUID(), walletAddress: WALLET, walletScope: "solana", chainKey: "solana", kind: "SOLANA_SWAP", capability: "SOLANA_SWAP",
      policySnapshot: { maxSlippageBps: 50 }, pinnedParameters: { inputMint: USDC, outputMint: "So11111111111111111111111111111111111111112", amountRaw: "1000000" },
    });
    const grant = await service.create({
      sessionId: job.sessionId, runtimeId: randomUUID(), capabilities: ["SOLANA_SWAP"], pinnedJobIds: [job.id],
      allowedSolanaMints: [USDC], allowedEvmTokens: [],
      limits: { maxActionsPerWake: 1, maxActionsTotal: 2, maxSingleActionUsd: 5, maxTotalAllocationUsd: 10, maxNetworkFeeUsd: 1, maxFeePercentage: 1, maxSlippageBps: 50 },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, { walletAddress: WALLET, walletScope: "solana", evmChainKey: null });
    assert.equal(grant.lifecycle, "guarded-execution-v2");
    assert.equal(grant.executionAllowed, true);
    assert.equal(grant.approvalBypassAllowed, true);
    assert.equal(grant.genericApprovalBypassAllowed, true);
    assert.equal(signingSession.status().active, true);
    assert.equal((await jobs.list())[0]?.state, "ARMED");
    assert.equal(database.listFullAccessGrantRecords().length, 0);
    assert.equal(database.listFullAccessExecutionGrantRecords().length, 1);

    const paused = await service.action(grant.id, "PAUSE");
    assert.equal(paused.status, "PAUSED");
    assert.equal(signingSession.status().active, false);

    await assert.rejects(() => service.create({
      sessionId: randomUUID(), runtimeId: randomUUID(), capabilities: ["SOLANA_SWAP"], pinnedJobIds: [randomUUID()],
      allowedSolanaMints: [USDC], allowedEvmTokens: [], limits: grant.limits,
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000 + 60_000).toISOString(),
    }, { walletAddress: WALLET, walletScope: "solana", evmChainKey: null }), /cannot exceed 24 hours/u);
  } finally {
    database.close();
    await rm(path, { force: true });
  }
});
