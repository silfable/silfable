import assert from "node:assert/strict";
import test from "node:test";

import { VenueReadinessService } from "./venue-readiness.js";

class Settings {
  value: unknown = null;
  getSetting(): unknown { return this.value; }
  setSetting(_key: string, value: unknown): void { this.value = value; }
}

const completeEvidence = {
  signerCustody: true,
  deterministicPolicy: true,
  freshSimulation: true,
  receiptReconciliation: true,
  recoveryDrill: true,
  securityAudit: true,
  controlledMainnetAcceptance: true,
  explicitFinalApproval: true,
  revocationAndKillSwitch: true,
  spendLimits: true,
};

test("readiness is persisted only with complete normalized attestation data", () => {
  const settings = new Settings();
  const readiness = new VenueReadinessService(settings);
  readiness.record({
    venue: "evm",
    evidence: completeEvidence,
    evidenceDigest: `sha256:${"a".repeat(64)}`,
    attestedAt: "2026-07-27T00:00:00.000Z",
    reviewer: "release-reviewer",
  });
  assert.equal(readiness.gateFor("evm").evaluate("evm").allowed, true);
  assert.equal(readiness.get("bridge"), null);
});

test("tampered stored readiness fails closed", () => {
  const settings = new Settings();
  settings.value = { evm: { venue: "evm", evidence: { signerCustody: true }, evidenceDigest: "not-a-digest", attestedAt: "invalid", reviewer: "?" } };
  const readiness = new VenueReadinessService(settings);
  assert.equal(readiness.gateFor("evm").evaluate("evm").allowed, false);
});

test("invalidating readiness immediately closes the venue gate", () => {
  const settings = new Settings();
  const readiness = new VenueReadinessService(settings);
  readiness.record({ venue: "dca", evidence: completeEvidence, evidenceDigest: `sha256:${"b".repeat(64)}`, attestedAt: "2026-07-27T00:00:00.000Z", reviewer: "release-reviewer" });
  readiness.invalidate("dca");
  assert.equal(readiness.gateFor("dca").evaluate("dca").allowed, false);
});
