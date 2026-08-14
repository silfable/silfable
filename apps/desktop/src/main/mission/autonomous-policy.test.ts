import type { MissionContractPreview } from "@silfable/contracts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AgentKeyService } from "../wallet/agent-keys.js";
import { AutonomousPolicyService } from "./autonomous-policy.js";
import type { TokenAllowlistService } from "./token-allowlist.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const mockPreview: MissionContractPreview = {
  id: "test-uuid",
  status: "ready-for-review",
  goal: "Buy SOL with USDC",
  walletAddress: "11111111111111111111111111111111",
  inputMint: USDC_MINT,
  outputMint: SOL_MINT,
  inputAmount: "1000000",
  maxSlippageBps: 50,
  deadlineAt: new Date(Date.now() + 3600000).toISOString(),
  stopConditions: [],
  quote: null,
  checks: [],
  executionAllowed: false,
  createdAt: new Date().toISOString(),
};

describe("AutonomousPolicyService", () => {
  it("denies autonomous execution if agent key is uninitialized", async () => {
    const agentKeys = new AgentKeyService();
    const allowlist = {
      async evaluateAutonomousEligibility() {
        return { eligible: true as const };
      },
    } as unknown as TokenAllowlistService;

    const service = new AutonomousPolicyService(agentKeys, allowlist);
    const result = await service.evaluateMissionForAutonomousExecution(mockPreview, 1_000_000n);

    assert.equal(result.allowed, false);
    assert.ok(result.reasons.includes("Agent key is not initialized in active session."));
  });

  it("approves autonomous execution when agent initialized and tokens allowlisted", async () => {
    const agentKeys = new AgentKeyService();
    await agentKeys.initializeAgent(
      {
        maxAllocationLamports: 10_000_000n,
        maxSingleTxLamports: 2_000_000n,
        maxDrawdownBps: 1000,
        maxTxPerHour: 10,
      },
      10_000_000n
    );

    const allowlist = {
      async evaluateAutonomousEligibility() {
        return { eligible: true as const };
      },
    } as unknown as TokenAllowlistService;

    const service = new AutonomousPolicyService(agentKeys, allowlist);
    const result = await service.evaluateMissionForAutonomousExecution(mockPreview, 1_000_000n);

    assert.equal(result.allowed, true);
    assert.equal(result.reasons.length, 0);
    assert.ok(result.agentAddress);
  });

  it("denies autonomous execution if input or output token is not allowlisted", async () => {
    const agentKeys = new AgentKeyService();
    await agentKeys.initializeAgent(
      {
        maxAllocationLamports: 10_000_000n,
        maxSingleTxLamports: 2_000_000n,
        maxDrawdownBps: 1000,
        maxTxPerHour: 10,
      },
      10_000_000n
    );

    const allowlist = {
      async evaluateAutonomousEligibility(mint: string) {
        if (mint === USDC_MINT) return { eligible: true };
        return { eligible: false, reason: "Token is not in the autonomous allowlist." };
      },
    } as unknown as TokenAllowlistService;

    const service = new AutonomousPolicyService(agentKeys, allowlist);
    const result = await service.evaluateMissionForAutonomousExecution(mockPreview, 1_000_000n);

    assert.equal(result.allowed, false);
    assert.match(result.reasons[0] ?? "", /Output token/u);
    assert.match(result.reasons[0] ?? "", /not in the autonomous allowlist/u);
  });
});
