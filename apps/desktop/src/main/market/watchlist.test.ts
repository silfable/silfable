import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeDatabase } from "../storage/database.js";
import { PumpWatchlistService } from "./watchlist.js";

const CREATOR = "AY8Ti7Tr7iUGksWJ7GjYy3vkE2YBv6qj9BnE8HtYCf8f";
const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";

test("PumpWatchlistService manages blocked creators, ignored mints, and scored watchlist items", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silfable-watchlist-test-"));
  const dbPath = join(dir, "runtime.sqlite");
  const db = await RuntimeDatabase.open(dbPath);
  const service = new PumpWatchlistService(db);

  try {
    assert.equal(service.isCreatorBlocked(CREATOR), false);
    service.blockCreator(CREATOR);
    assert.equal(service.isCreatorBlocked(CREATOR), true);
    assert.deepEqual(service.listBlockedCreators(), [CREATOR]);

    assert.equal(service.isMintIgnored(MINT), false);
    service.ignoreMint(MINT);
    assert.equal(service.isMintIgnored(MINT), true);
    assert.deepEqual(service.listIgnoredMints(), [MINT]);

    service.addCandidateToWatchlist({
      mint: MINT,
      mintAuthorityRevoked: true,
      freezeAuthorityRevoked: true,
      top10HolderConcentrationPercent: 10,
      bondingCurveProgressPercent: 40,
      isMigratedToPumpSwap: false,
      creatorAddress: CREATOR,
    });

    const watchlist = service.getWatchlist();
    assert.equal(watchlist.length, 1);
    assert.equal(watchlist[0]!.mintAddress, MINT);
    assert.equal(watchlist[0]!.riskScore, 100); // 100 because creator is blocked
    assert.equal(watchlist[0]!.grade, "Critical Risk");
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
