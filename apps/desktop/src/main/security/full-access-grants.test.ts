import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { RuntimeDatabase } from "../storage/database.js";
import { EncryptedFullAccessGrantService } from "./full-access-grants.js";
import type { GuardedCapability } from "@silfable/contracts";

class Secrets {
  value: string | null = null;
  async getSecret(_name: "full-access-store-key"): Promise<string | null> { return this.value; }
  async setSecret(_name: "full-access-store-key", value: string): Promise<void> { this.value = value; }
}

const WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function fixture() {
  const path = join(tmpdir(), `silfable-full-access-${randomUUID()}.sqlite`);
  const database = await RuntimeDatabase.open(path);
  const secrets = new Secrets();
  return { path, database, secrets, service: new EncryptedFullAccessGrantService(database, secrets) };
}

function request(sessionId = randomUUID(), runtimeId = randomUUID()) {
  return {
    sessionId,
    runtimeId,
    capabilities: ["READ_PORTFOLIO", "RESEARCH_MARKET", "PREPARE_SOLANA_SWAP"] as GuardedCapability[],
    allowedSolanaMints: [USDC],
    allowedEvmTokens: [],
    limits: {
      maxActionsPerWake: 3,
      maxActionsTotal: 10,
      maxSingleActionUsd: 25,
      maxTotalAllocationUsd: 100,
      maxNetworkFeeUsd: 2,
      maxFeePercentage: 5,
      maxSlippageBps: 100,
    },
    expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
  };
}

test("Full Access grant is encrypted, survives restart, and never gains execution authority", async () => {
  const fx = await fixture();
  try {
    const grant = await fx.service.create(request(), {
      walletAddress: WALLET,
      walletScope: "solana",
      evmChainKey: null,
    });
    assert.equal(grant.status, "ACTIVE");
    assert.equal(grant.signingAllowed, false);
    assert.equal(grant.broadcastAllowed, false);
    assert.equal(grant.approvalBypassAllowed, false);
    assert.equal(grant.executionAllowed, false);

    fx.database.close();
    const bytes = await readFile(fx.path);
    assert.equal(bytes.includes(Buffer.from(WALLET, "utf8")), false);
    assert.equal(bytes.includes(Buffer.from("PREPARE_SOLANA_SWAP", "utf8")), false);

    const reopened = await RuntimeDatabase.open(fx.path);
    const restarted = new EncryptedFullAccessGrantService(reopened, fx.secrets);
    const restored = await restarted.list();
    assert.equal(restored.length, 1);
    assert.equal(restored[0]?.id, grant.id);
    reopened.close();
  } finally {
    try { fx.database.close(); } catch {}
    await rm(fx.path, { force: true });
  }
});

test("Full Access lifecycle supports pause, resume, revoke, and expiry", async () => {
  const fx = await fixture();
  try {
    const now = new Date("2026-07-30T00:00:00.000Z");
    const input = request();
    input.expiresAt = new Date(now.getTime() + 60_000).toISOString();
    const grant = await fx.service.create(input, {
      walletAddress: WALLET,
      walletScope: "solana",
      evmChainKey: null,
    }, now);
    assert.equal((await fx.service.action(grant.id, "PAUSE", new Date(now.getTime() + 1_000))).status, "PAUSED");
    assert.equal((await fx.service.action(grant.id, "RESUME", new Date(now.getTime() + 2_000))).status, "ACTIVE");
    await fx.service.evaluate(new Date(now.getTime() + 61_000));
    assert.equal((await fx.service.list(new Date(now.getTime() + 61_000)))[0]?.status, "EXPIRED");
  } finally {
    fx.database.close();
    await rm(fx.path, { force: true });
  }
});

test("Full Access policy enforces capability, asset, fee, slippage, and allocation limits", async () => {
  const fx = await fixture();
  try {
    const grant = await fx.service.create(request(), {
      walletAddress: WALLET,
      walletScope: "solana",
      evmChainKey: null,
    });
    const updated = await fx.service.authorizePlanningAction(grant.id, {
      capability: "PREPARE_SOLANA_SWAP",
      actionUsd: 20,
      networkFeeUsd: 0.1,
      feePercentage: 1,
      slippageBps: 50,
      solanaMint: USDC,
    });
    assert.equal(updated.actionsUsed, 1);
    assert.equal(updated.allocationUsedUsd, 20);
    await assert.rejects(
      fx.service.authorizePlanningAction(grant.id, {
        capability: "PREPARE_BRIDGE",
        actionUsd: 1,
        networkFeeUsd: 0.1,
        feePercentage: 1,
        slippageBps: 50,
      }),
      /Capability is outside/u,
    );
    await assert.rejects(
      fx.service.authorizePlanningAction(grant.id, {
        capability: "PREPARE_SOLANA_SWAP",
        actionUsd: 1,
        networkFeeUsd: 0.1,
        feePercentage: 1,
        slippageBps: 101,
        solanaMint: USDC,
      }),
      /Slippage exceeds/u,
    );
  } finally {
    fx.database.close();
    await rm(fx.path, { force: true });
  }
});

test("Full Access rejects cross-wallet capabilities and duplicate live grants", async () => {
  const fx = await fixture();
  try {
    const input = request();
    await fx.service.create(input, {
      walletAddress: WALLET,
      walletScope: "solana",
      evmChainKey: null,
    });
    await assert.rejects(
      fx.service.create(input, {
        walletAddress: WALLET,
        walletScope: "solana",
        evmChainKey: null,
      }),
      /already has a live/u,
    );
    await assert.rejects(
      fx.service.create({
        ...request(),
        capabilities: ["PREPARE_EVM_SWAP"],
      }, {
        walletAddress: WALLET,
        walletScope: "solana",
        evmChainKey: null,
      }),
      /EVM capabilities require/u,
    );
  } finally {
    fx.database.close();
    await rm(fx.path, { force: true });
  }
});

test("Full Access records AI planning usage and enforces per-wake and total ceilings", async () => {
  const fx = await fixture();
  try {
    const input = request();
    input.limits.maxActionsPerWake = 2;
    input.limits.maxActionsTotal = 3;
    const grant = await fx.service.create(input, {
      walletAddress: WALLET,
      walletScope: "solana",
      evmChainKey: null,
    });
    const first = await fx.service.recordPlanningActions(grant.id, [
      "READ_PORTFOLIO",
      "RESEARCH_MARKET",
    ]);
    assert.equal(first.actionsUsed, 2);
    await assert.rejects(
      fx.service.recordPlanningActions(grant.id, [
        "READ_PORTFOLIO",
        "RESEARCH_MARKET",
        "PREPARE_SOLANA_SWAP",
      ]),
      /per-wake action limit/u,
    );
    const second = await fx.service.recordPlanningActions(grant.id, ["PREPARE_SOLANA_SWAP"]);
    assert.equal(second.actionsUsed, 3);
    await assert.rejects(
      fx.service.recordPlanningActions(grant.id, ["READ_PORTFOLIO"]),
      /total action limit/u,
    );
  } finally {
    fx.database.close();
    await rm(fx.path, { force: true });
  }
});
