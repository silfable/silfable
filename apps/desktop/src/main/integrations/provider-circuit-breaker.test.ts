import assert from "node:assert/strict";
import test from "node:test";

import { ProviderCircuitBreaker } from "./provider-circuit-breaker.js";

test("provider circuit opens after bounded consecutive failures and recovers after cooldown", () => {
  let now = 1_000;
  const circuit = new ProviderCircuitBreaker({
    name: "Test provider",
    failureThreshold: 2,
    cooldownMs: 1_000,
    now: () => now,
  });

  circuit.recordFailure();
  assert.equal(circuit.snapshot().state, "closed");
  circuit.recordFailure();
  assert.equal(circuit.snapshot().state, "open");
  assert.throws(() => circuit.assertAvailable(), /temporarily unavailable/u);

  now += 1_001;
  circuit.assertAvailable();
  assert.deepEqual(circuit.snapshot(), { state: "closed", consecutiveFailures: 0, retryAt: null });
});

test("successful provider response clears a partial failure streak", () => {
  const circuit = new ProviderCircuitBreaker({ name: "Test provider" });
  circuit.recordFailure();
  circuit.recordSuccess();
  assert.equal(circuit.snapshot().consecutiveFailures, 0);
});
