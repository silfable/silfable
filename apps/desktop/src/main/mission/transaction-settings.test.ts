import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeDatabase } from "../storage/database.js";
import { DEFAULT_TRANSACTION_SETTINGS, TransactionSettingsService, withSessionSafetyOverrides } from "./transaction-settings.js";

test("transaction settings use safe defaults and persist after database reopen", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "silfable-settings-"));
  const path = join(root, "runtime.sqlite3");
  try {
    const database = await RuntimeDatabase.open(path);
    const service = new TransactionSettingsService(database);
    assert.deepEqual(service.get(), DEFAULT_TRANSACTION_SETTINGS);
    service.save({ maxNetworkFeeLamports: 300_000, maxFeePercent: 8, defaultSlippageBps: 40, maxSlippageBps: 100, defaultDeadlineMinutes: 45, priority: "economy" });
    database.close();
    const reopened = await RuntimeDatabase.open(path);
    assert.deepEqual(new TransactionSettingsService(reopened).get(), { maxNetworkFeeLamports: 300_000, maxFeePercent: 8, defaultSlippageBps: 40, maxSlippageBps: 100, defaultDeadlineMinutes: 45, priority: "economy" });
    reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy transaction settings gain the safe maximum-slippage default", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "silfable-legacy-settings-"));
  try {
    const database = await RuntimeDatabase.open(join(root, "runtime.sqlite3"));
    database.setSetting("mainnet-transaction-settings-v1", {
      maxNetworkFeeLamports: 300_000, maxFeePercent: 8, defaultSlippageBps: 40, defaultDeadlineMinutes: 45, priority: "economy",
    });
    assert.equal(new TransactionSettingsService(database).get().maxSlippageBps, 300);
    database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("session safety override can only tighten the current device slippage ceiling", () => {
  const tightened = withSessionSafetyOverrides(
    { ...DEFAULT_TRANSACTION_SETTINGS, defaultSlippageBps: 80, maxSlippageBps: 100 },
    { maxSlippageBps: 25 },
  );
  assert.equal(tightened.maxSlippageBps, 25);
  assert.equal(tightened.defaultSlippageBps, 25);

  // A stale session created while the device limit was looser cannot expand
  // the newer device setting when it is reopened.
  const stale = withSessionSafetyOverrides(
    { ...DEFAULT_TRANSACTION_SETTINGS, defaultSlippageBps: 40, maxSlippageBps: 40 },
    { maxSlippageBps: 300 },
  );
  assert.equal(stale.maxSlippageBps, 40);
  assert.equal(stale.defaultSlippageBps, 40);
});
