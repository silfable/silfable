import assert from "node:assert/strict";
import test from "node:test";

import { ProviderRateBudget } from "./provider-rate-budget.js";

test("provider rate budget blocks before another request and recovers after its window", () => {
  let now = Date.parse("2026-07-28T00:00:00.000Z");
  const budget = new ProviderRateBudget({
    name: "Test provider",
    limit: 2,
    windowMs: 1_000,
    now: () => now,
  });

  budget.consume();
  budget.consume();
  assert.deepEqual(budget.snapshot(), {
    limit: 2,
    windowMs: 1_000,
    used: 2,
    remaining: 0,
    resetsAt: now + 1_000,
  });
  assert.throws(() => budget.consume(), /request budget is exhausted/u);

  now += 1_001;
  budget.consume();
  assert.equal(budget.snapshot().remaining, 1);
});

test("provider rate budget validates bounded configuration", () => {
  assert.throws(() => new ProviderRateBudget({ name: "Test", limit: 0 }), /rate limit/u);
  assert.throws(() => new ProviderRateBudget({ name: "Test", windowMs: 999 }), /rate window/u);
});
