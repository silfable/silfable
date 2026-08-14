import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { evaluateMonitorAuthority } from "./guard.js";

const now = new Date("2026-07-26T00:00:00.000Z");
const policy = {
  schemaVersion: 1,
  network: "solana-mainnet",
  authorityMode: "monitor-propose",
  capabilities: ["MONITOR_MARKET", "PREPARE_PROPOSAL"],
  allowedMints: ["So11111111111111111111111111111111111111112"],
  maxAllocationLamports: "100000000",
  maxSingleProposalLamports: "10000000",
  maxNetworkFeeLamports: "1000000",
  maxFeeBps: 100,
  maxSlippageBps: 100,
  maxActionsPerHour: 0,
  startsAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + 60 * 60 * 1_000).toISOString(),
  signingAllowed: false,
  broadcastAllowed: false,
  executionAllowed: false,
};

describe("cloud monitor delegated-authority guard", () => {
  test("allows only monitoring and proposal capabilities", () => {
    const result = evaluateMonitorAuthority({
      policy,
      status: "ACTIVE",
      expiresAt: new Date(policy.expiresAt),
      revokedAt: null,
      killSwitchEngaged: false,
      requiredCapability: "MONITOR_MARKET",
      now,
    });
    assert.equal(result.monitoringAllowed, true);
    assert.equal(result.proposalAllowed, true);
    assert.equal(result.executionAllowed, false);
    assert.equal(result.signingAllowed, false);
    assert.equal(result.broadcastAllowed, false);
  });

  test("kill switch overrides an active policy", () => {
    const result = evaluateMonitorAuthority({
      policy,
      status: "ACTIVE",
      expiresAt: new Date(policy.expiresAt),
      revokedAt: null,
      killSwitchEngaged: true,
      now,
    });
    assert.equal(result.reason, "KILL_SWITCH_ENGAGED");
    assert.equal(result.monitoringAllowed, false);
  });

  test("rejects expired, revoked, invalid, and missing capabilities", () => {
    assert.equal(evaluateMonitorAuthority({
      policy,
      status: "ACTIVE",
      expiresAt: new Date(now.getTime() - 1),
      revokedAt: null,
      killSwitchEngaged: false,
      now,
    }).reason, "AUTHORITY_EXPIRED");
    assert.equal(evaluateMonitorAuthority({
      policy,
      status: "REVOKED",
      expiresAt: new Date(policy.expiresAt),
      revokedAt: now,
      killSwitchEngaged: false,
      now,
    }).reason, "AUTHORITY_REVOKED");
    assert.equal(evaluateMonitorAuthority({
      policy: { ...policy, executionAllowed: true },
      status: "ACTIVE",
      expiresAt: new Date(policy.expiresAt),
      revokedAt: null,
      killSwitchEngaged: false,
      now,
    }).reason, "INVALID_POLICY");
    assert.equal(evaluateMonitorAuthority({
      policy,
      status: "ACTIVE",
      expiresAt: new Date(policy.expiresAt),
      revokedAt: null,
      killSwitchEngaged: false,
      requiredCapability: "NOTIFY_USER",
      now,
    }).reason, "CAPABILITY_NOT_GRANTED");
  });
});

