import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeDatabase } from "../storage/database.js";
import { DcaSchedulerManager } from "./dca-manager.js";

const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";

test("DcaSchedulerManager emits reviewable proposals but never records a tick as execution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silfable-dca-test-"));
  const dbPath = join(dir, "runtime.sqlite");
  const db = await RuntimeDatabase.open(dbPath);
  const manager = new DcaSchedulerManager(db);

  try {
    // Total budget: 2,000,000 lamports (0.002 SOL), Order: 1,000,000 lamports (0.001 SOL) -> Exactly 2 orders
    manager.createSchedule({
      id: "dca-1",
      mintAddress: MINT,
      totalBudgetLamports: "2000000",
      orderAmountLamports: "1000000",
      intervalSeconds: 60,
    });

    const activeSchedules = manager.getActiveSchedules();
    assert.equal(activeSchedules.length, 1);
    assert.equal(activeSchedules[0]!.executedCount, 0);

    // Simulate time advancing 61 seconds for the first due proposal.
    const futureTime1 = new Date(Date.now() + 61 * 1000);
    const triggers1 = manager.evaluateDcaSchedules(futureTime1);

    assert.equal(triggers1.length, 1);
    assert.equal(triggers1[0]!.executedCount, 0);
    assert.equal(triggers1[0]!.orderAmountLamports, "1000000");

    // The schedule remains active and has no fabricated execution count.
    const schedulesAfter1 = manager.getActiveSchedules();
    assert.equal(schedulesAfter1.length, 1);
    assert.equal(schedulesAfter1[0]!.executedCount, 0);

    // A later due proposal is also not a settled trade.
    const futureTime2 = new Date(futureTime1.getTime() + 61 * 1000);
    const triggers2 = manager.evaluateDcaSchedules(futureTime2);

    assert.equal(triggers2.length, 1);
    assert.equal(triggers2[0]!.executedCount, 0);
    assert.equal(manager.getActiveSchedules()[0]!.totalExecutedLamports, "0");
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
