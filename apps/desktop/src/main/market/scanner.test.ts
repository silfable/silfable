import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeDatabase } from "../storage/database.js";
import { PumpWatchlistService } from "./watchlist.js";
import { PumpMarketScannerService, type ScannedTokenEvent } from "./scanner.js";

const CREATOR = "AY8Ti7Tr7iUGksWJ7GjYy3vkE2YBv6qj9BnE8HtYCf8f";
const MINT_1 = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const MINT_2 = "8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";

test("PumpMarketScannerService filters out blocked creators and ignored mints", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silfable-scanner-test-"));
  const dbPath = join(dir, "runtime.sqlite");
  const db = await RuntimeDatabase.open(dbPath);
  const watchlist = new PumpWatchlistService(db);
  const scanner = new PumpMarketScannerService(watchlist);

  try {
    scanner.startScanning();
    assert.equal(scanner.isScanning(), true);

    const candidates: ScannedTokenEvent[] = [];
    scanner.on("candidate", (event) => candidates.push(event));

    // Process valid candidate
    const processed1 = scanner.processIncomingEvent({
      mint: MINT_1,
      creator: CREATOR,
      signature: "sig1111111111111111111111111111111111111111111111111111111111111111111111111111111111111",
      slot: 100,
    });
    assert.equal(processed1, true);
    assert.equal(candidates.length, 1);

    // Block creator and attempt another candidate from same creator
    watchlist.blockCreator(CREATOR);
    const processed2 = scanner.processIncomingEvent({
      mint: MINT_2,
      creator: CREATOR,
      signature: "sig2222222222222222222222222222222222222222222222222222222222222222222222222222222222222",
      slot: 101,
    });
    assert.equal(processed2, false);
    assert.equal(candidates.length, 1);

    // Ignore MINT_1 and attempt to re-process MINT_1
    watchlist.ignoreMint(MINT_1);
    const processed3 = scanner.processIncomingEvent({
      mint: MINT_1,
      creator: "DifferentCreator1111111111111111111111111111",
      signature: "sig3333333333333333333333333333333333333333333333333333333333333333333333333333333333333",
      slot: 102,
    });
    assert.equal(processed3, false);
    assert.equal(candidates.length, 1);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
