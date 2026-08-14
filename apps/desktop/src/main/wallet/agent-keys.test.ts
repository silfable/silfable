import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AgentKeyService, type AgentLimits } from "./agent-keys.js";

const DEFAULT_LIMITS: AgentLimits = {
  maxAllocationLamports: 1_000_000_000n, // 1 SOL
  maxSingleTxLamports: 100_000_000n, // 0.1 SOL
  maxDrawdownBps: 1000, // 10%
  maxTxPerHour: 5,
};

describe("AgentKeyService", () => {
  it("initializes an active agent signer with configured limits", async () => {
    const service = new AgentKeyService();
    assert.equal(service.isInitialized(), false);

    const result = await service.initializeAgent(DEFAULT_LIMITS, 1_000_000_000n);
    assert.match(result.address, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u);
    assert.equal(service.isInitialized(), true);

    const status = service.getAgentStatus();
    assert.equal(status.active, true);
    assert.equal(status.address, result.address);
    assert.deepEqual(status.limits, DEFAULT_LIMITS);
  });

  it("validates proposed transaction limits", async () => {
    const service = new AgentKeyService();
    await service.initializeAgent(DEFAULT_LIMITS, 1_000_000_000n);

    // Valid tx
    const valid = service.validateProposedTransaction(50_000_000n);
    assert.equal(valid.allowed, true);

    // Exceeds single tx size
    const invalidSize = service.validateProposedTransaction(200_000_000n);
    assert.equal(invalidSize.allowed, false);
    assert.match(invalidSize.reason ?? "", /exceeds max single transaction limit/u);
  });

  it("triggers kill switch when drawdown limit is exceeded", async () => {
    const service = new AgentKeyService();
    await service.initializeAgent(DEFAULT_LIMITS, 1_000_000_000n);

    // Record initial txs with slight loss
    service.recordTransactionResult(50_000_000n, -20_000_000n, 980_000_000n);
    assert.equal(service.isInitialized(), true);

    // Record severe loss exceeding 10% drawdown (1,000,000,000 -> 850,000,000 is 15% drop)
    service.recordTransactionResult(50_000_000n, -130_000_000n, 850_000_000n);
    assert.equal(service.isInitialized(), false);

    const status = service.getAgentStatus();
    assert.equal(status.revoked, true);
    assert.match(status.revokeReason ?? "", /Automated Kill Switch: Drawdown reached 15%/u);

    assert.throws(() => service.getSigner(), /REVOKED/u);
  });

  it("allows manual emergency stop (revoke)", async () => {
    const service = new AgentKeyService();
    await service.initializeAgent(DEFAULT_LIMITS, 1_000_000_000n);
    assert.equal(service.isInitialized(), true);

    service.revokeAgent("User clicked emergency halt");
    assert.equal(service.isInitialized(), false);
    assert.throws(() => service.getSigner(), /User clicked emergency halt/u);
  });
});
