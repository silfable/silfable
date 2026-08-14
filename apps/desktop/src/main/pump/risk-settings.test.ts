import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeDatabase } from "../storage/database.js";
import { assertPumpProposalWithinRisk, DEFAULT_PUMP_RISK_SETTINGS, evaluatePumpProposalRisk, PumpRiskSettingsService } from "./risk-settings.js";

test("Pump risk settings use conservative defaults and persist after reopen", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "silfable-pump-risk-"));
  const path = join(root, "runtime.sqlite3");
  try {
    const database = await RuntimeDatabase.open(path);
    const service = new PumpRiskSettingsService(database);
    assert.deepEqual(service.get(), DEFAULT_PUMP_RISK_SETTINGS);
    const saved = { ...DEFAULT_PUMP_RISK_SETTINGS, maxTradingFeeBps: 400, maxSpendPerTradeLamports: "25000000" };
    service.save(saved);
    database.close();
    const reopened = await RuntimeDatabase.open(path);
    assert.deepEqual(new PumpRiskSettingsService(reopened).get(), saved);
    reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Pump risk boundary blocks spend, slippage, rate, exposure, and reserve violations", () => {
  const valid = { side: "buy" as const, inputAmount: "1000000", maxSlippageBps: 50, walletSolLamports: "100000000", maxNetworkFeeLamports: 200000, settings: DEFAULT_PUMP_RISK_SETTINGS };
  assert.doesNotThrow(() => assertPumpProposalWithinRisk(valid));
  assert.throws(() => assertPumpProposalWithinRisk({ ...valid, maxSlippageBps: 301 }), /slippage/u);
  assert.throws(() => assertPumpProposalWithinRisk({ ...valid, inputAmount: "50000001" }), /per-trade/u);
  assert.throws(() => assertPumpProposalWithinRisk({ ...valid, usage: { dailySpendLamports: "199500000", perTokenExposureLamports: "0", totalExposureLamports: "0", openPositions: 0, transactionsThisHour: 0 } }), /daily/u);
  assert.throws(() => assertPumpProposalWithinRisk({ ...valid, usage: { dailySpendLamports: "0", perTokenExposureLamports: "99500000", totalExposureLamports: "0", openPositions: 1, transactionsThisHour: 0 } }), /per-token/u);
  assert.throws(() => assertPumpProposalWithinRisk({ ...valid, usage: { dailySpendLamports: "0", perTokenExposureLamports: "0", totalExposureLamports: "0", openPositions: 0, transactionsThisHour: 10 } }), /hourly/u);
  assert.throws(() => assertPumpProposalWithinRisk({ ...valid, walletSolLamports: "21000000" }), /reserve floor/u);
});

test("Pump risk evidence exposes the exact enforced limits without claiming historical usage", () => {
  const evidence = evaluatePumpProposalRisk({
    side: "buy",
    inputAmount: "1000000",
    maxSlippageBps: 50,
    walletSolLamports: "100000000",
    maxNetworkFeeLamports: 200000,
    settings: DEFAULT_PUMP_RISK_SETTINGS,
  }, new Date("2026-07-22T00:00:00.000Z"));
  assert.equal(evidence.passed, true);
  assert.equal(evidence.usageSource, "no-execution-baseline");
  assert.equal(evidence.projectedWalletBalanceLamports, "98800000");
  assert.equal(evidence.checks.length, 8);
  assert.equal(evidence.checks.every((entry) => entry.passed), true);

  const blocked = evaluatePumpProposalRisk({
    side: "buy",
    inputAmount: "50000001",
    maxSlippageBps: 50,
    walletSolLamports: "100000000",
    maxNetworkFeeLamports: 200000,
    settings: DEFAULT_PUMP_RISK_SETTINGS,
  });
  assert.equal(blocked.passed, false);
  assert.equal(blocked.checks.find((entry) => entry.id === "per-trade-spend")?.passed, false);
});
