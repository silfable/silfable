import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildDelegatedAuthorityMessage,
  canonicalizeDelegatedPolicy,
  type DelegatedAuthorityPolicy,
  delegatedAuthorityStatus,
  hashDelegatedPolicy,
  parseDelegatedPolicy,
} from "./delegated-authority-core";

function policy(now = new Date("2026-07-26T00:00:00.000Z")): DelegatedAuthorityPolicy {
  return {
    schemaVersion: 1,
    network: "solana-mainnet",
    authorityMode: "monitor-propose",
    capabilities: ["PREPARE_PROPOSAL", "MONITOR_MARKET"],
    allowedMints: ["So11111111111111111111111111111111111111112"],
    maxAllocationLamports: "100000000",
    maxSingleProposalLamports: "10000000",
    maxNetworkFeeLamports: "1000000",
    maxFeeBps: 100,
    maxSlippageBps: 100,
    maxActionsPerHour: 0,
    startsAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
    signingAllowed: false,
    broadcastAllowed: false,
    executionAllowed: false,
  };
}

describe("delegated authority policy", () => {
  test("canonicalizes arrays and produces a stable policy hash", () => {
    const first = policy();
    const second = { ...first, capabilities: [...first.capabilities].reverse() };
    assert.equal(canonicalizeDelegatedPolicy(first), canonicalizeDelegatedPolicy(second));
    assert.equal(hashDelegatedPolicy(first), hashDelegatedPolicy(second));
  });

  test("binds the exact fail-closed policy into the wallet message", () => {
    const value = policy();
    const message = buildDelegatedAuthorityMessage({
      domain: "silfable.example",
      uri: "https://silfable.example",
      walletAddress: "11111111111111111111111111111111",
      nonce: "nonce",
      policy: value,
      issuedAt: new Date("2026-07-26T00:00:00.000Z"),
      challengeExpiresAt: new Date("2026-07-26T00:05:00.000Z"),
    });
    assert.match(message, /Execution Allowed: false/u);
    assert.match(message, new RegExp(`Policy Hash: ${hashDelegatedPolicy(value)}`, "u"));
  });

  test("rejects execution authority, excessive lifetime, and proposal overspend", () => {
    const now = new Date("2026-07-26T00:00:00.000Z");
    assert.throws(() => parseDelegatedPolicy({ ...policy(now), executionAllowed: true }, now));
    assert.throws(() =>
      parseDelegatedPolicy({
        ...policy(now),
        expiresAt: new Date(now.getTime() + 31 * 24 * 60 * 60 * 1_000).toISOString(),
      }, now),
    );
    assert.throws(() =>
      parseDelegatedPolicy({ ...policy(now), maxSingleProposalLamports: "100000001" }, now),
    );
  });

  test("kill switch and expiry override an otherwise active grant", () => {
    const now = new Date("2026-07-26T00:00:00.000Z");
    const active = {
      status: "ACTIVE",
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: null,
      killSwitchEngaged: false,
    };
    assert.equal(delegatedAuthorityStatus(active, now), "active");
    assert.equal(delegatedAuthorityStatus({ ...active, killSwitchEngaged: true }, now), "blocked");
    assert.equal(
      delegatedAuthorityStatus({ ...active, expiresAt: new Date(now.getTime() - 1) }, now),
      "expired",
    );
  });
});
