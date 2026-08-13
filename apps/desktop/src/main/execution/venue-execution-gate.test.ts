import assert from "node:assert/strict";
import test from "node:test";

import { VenueExecutionGate } from "./venue-execution-gate.js";

test("every new venue fails closed without complete execution evidence", () => {
  const gate = new VenueExecutionGate();
  for (const venue of ["bridge", "evm", "hyperliquid", "dca", "tp_sl", "full_access"] as const) {
    const decision = gate.evaluate(venue);
    assert.equal(decision.allowed, false);
    assert.ok(decision.missing.includes("isolated signer custody"));
  }
});

test("full access still requires final approval and kill switch", () => {
  const gate = new VenueExecutionGate({
    signerCustody: true,
    deterministicPolicy: true,
    freshSimulation: true,
    receiptReconciliation: true,
    recoveryDrill: true,
    securityAudit: true,
    controlledMainnetAcceptance: true,
    spendLimits: true,
  });
  const decision = gate.evaluate("full_access");
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.missing, ["explicit final approval", "revocation and kill switch"]);
});

test("execution gate can allow only complete independently evidenced venue", () => {
  const gate = new VenueExecutionGate({
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
  });
  assert.equal(gate.evaluate("evm").allowed, true);
});
