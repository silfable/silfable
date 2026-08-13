import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeDatabase } from "../storage/database.js";
import { PositionStrategyManager } from "./strategy-manager.js";
import { DurableBackgroundObservationService } from "./background-loop.js";

const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";

test("DurableBackgroundObservationService polls prices and triggers auto-execution events", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silfable-bg-loop-test-"));
  const dbPath = join(dir, "runtime.sqlite");
  const db = await RuntimeDatabase.open(dbPath);
  const manager = new PositionStrategyManager(db);
  const bgService = new DurableBackgroundObservationService(manager, 50);

  try {
    manager.registerPosition({
      id: "pos-auto-1",
      mintAddress: MINT,
      entryPrice: 10,
      amount: "100",
      stopLossPrice: 8,
    });

    const triggeredEvents: any[] = [];
    bgService.on("auto_execution_triggered", (event) => triggeredEvents.push(event));

    // Mock price fetcher returning crash price (7.0)
    const mockFetcher = async (mints: string[]) => {
      const map = new Map<string, number>();
      for (const mint of mints) map.set(mint, 7.0);
      return map;
    };

    bgService.startObservationLoop(mockFetcher);
    assert.equal(bgService.isRunning(), true);

    // Wait 150ms for background interval to run
    await new Promise((resolve) => setTimeout(resolve, 150));

    bgService.stopObservationLoop();
    assert.equal(bgService.isRunning(), false);

    assert.ok(triggeredEvents.length >= 1);
    assert.equal(triggeredEvents[0].positionId, "pos-auto-1");
    assert.equal(triggeredEvents[0].reason, "STOP_LOSS");
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
