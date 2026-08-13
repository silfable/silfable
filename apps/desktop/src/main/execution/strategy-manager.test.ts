import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeDatabase } from "../storage/database.js";
import { PositionStrategyManager } from "./strategy-manager.js";

const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";

test("PositionStrategyManager triggers Stop Loss correctly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silfable-strategy-test-"));
  const dbPath = join(dir, "runtime.sqlite");
  const db = await RuntimeDatabase.open(dbPath);
  const manager = new PositionStrategyManager(db);

  try {
    manager.registerPosition({
      id: "pos-1",
      mintAddress: MINT,
      entryPrice: 1.0,
      amount: "1000",
      stopLossPrice: 0.8,
      takeProfitPrice: 2.0,
    });

    // Normal price tick above stop loss
    const exits1 = manager.evaluatePriceTick(MINT, 0.9);
    assert.equal(exits1.length, 0);

    // Price drops below stop loss
    const exits2 = manager.evaluatePriceTick(MINT, 0.75);
    assert.equal(exits2.length, 1);
    assert.equal(exits2[0]!.reason, "STOP_LOSS");
    assert.equal(exits2[0]!.triggerPrice, 0.75);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("PositionStrategyManager triggers Take Profit correctly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silfable-strategy-tp-test-"));
  const dbPath = join(dir, "runtime.sqlite");
  const db = await RuntimeDatabase.open(dbPath);
  const manager = new PositionStrategyManager(db);

  try {
    manager.registerPosition({
      id: "pos-2",
      mintAddress: MINT,
      entryPrice: 1.0,
      amount: "1000",
      takeProfitPrice: 1.5,
    });

    const exits1 = manager.evaluatePriceTick(MINT, 1.2);
    assert.equal(exits1.length, 0);

    const exits2 = manager.evaluatePriceTick(MINT, 1.55);
    assert.equal(exits2.length, 1);
    assert.equal(exits2[0]!.reason, "TAKE_PROFIT");
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("PositionStrategyManager dynamically adjusts Trailing Stop upward", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silfable-strategy-trailing-test-"));
  const dbPath = join(dir, "runtime.sqlite");
  const db = await RuntimeDatabase.open(dbPath);
  const manager = new PositionStrategyManager(db);

  try {
    manager.registerPosition({
      id: "pos-3",
      mintAddress: MINT,
      entryPrice: 100,
      amount: "50",
      trailingStopPercent: 10, // 10% trailing stop (stop at 90)
    });

    // Price rises to 150 -> trailing stop should move to 135
    manager.evaluatePriceTick(MINT, 150);

    const pos = manager.getActivePositions().find((p) => p.id === "pos-3");
    assert.equal(pos?.highestPriceSeen, 150);
    assert.equal(pos?.stopLossPrice, 135);

    // Price drops to 140 (above 135) -> no exit
    const exits1 = manager.evaluatePriceTick(MINT, 140);
    assert.equal(exits1.length, 0);

    // Price drops to 130 (below 135) -> triggers TRAILING_STOP exit
    const exits2 = manager.evaluatePriceTick(MINT, 130);
    assert.equal(exits2.length, 1);
    assert.equal(exits2[0]!.reason, "TRAILING_STOP");
    assert.equal(exits2[0]!.targetPrice, 135);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
