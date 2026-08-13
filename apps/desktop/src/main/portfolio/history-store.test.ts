import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";

import {
  UnifiedPortfolioSnapshotSchema,
  type UnifiedPortfolioSnapshot,
} from "@silfable/contracts";

import { RuntimeDatabase } from "../storage/database.js";
import { EncryptedPortfolioHistoryService } from "./history-store.js";

const WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";

function snapshot(input: {
  sessionId: string;
  blockReference: string;
  totalUsd: number | null;
  verifiedAt: string;
}): UnifiedPortfolioSnapshot {
  return UnifiedPortfolioSnapshotSchema.parse({
    sessionId: input.sessionId,
    walletScope: "solana",
    walletAddress: WALLET,
    chains: [{
      family: "solana",
      chainKey: "solana",
      chainId: "solana-mainnet",
      chainName: "Solana Mainnet",
      walletAddress: WALLET,
      blockReference: input.blockReference,
      nativeSymbol: "SOL",
      nativeAmountRaw: "1000000000",
      nativeUiAmount: "1",
      nativeUsdPrice: input.totalUsd,
      nativeUsdValue: input.totalUsd,
      totalUsd: input.totalUsd,
      valuationStatus: input.totalUsd === null ? "unavailable" : "complete",
      valuationSource: input.totalUsd === null ? null : "jupiter-price",
      priceVerifiedAt: input.totalUsd === null ? null : input.verifiedAt,
      explorerBaseUrl: "https://explorer.solana.com",
      assets: [],
      verifiedAt: input.verifiedAt,
    }],
    totalUsd: input.totalUsd,
    activity: [],
    verifiedAt: input.verifiedAt,
  });
}

test("encrypts, deduplicates, and restores bounded portfolio history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-portfolio-history-"));
  const database = await RuntimeDatabase.open(join(directory, "history.sqlite3"));
  const secrets = new Map<string, string>();
  const secretStore = {
    getSecret: async (name: "portfolio-history-store-key") => secrets.get(name) ?? null,
    setSecret: async (name: "portfolio-history-store-key", value: string) => {
      secrets.set(name, value);
    },
  };
  const service = new EncryptedPortfolioHistoryService(database, secretStore);
  const sessionId = randomUUID();
  try {
    const first = snapshot({
      sessionId,
      blockReference: "100",
      totalUsd: 100,
      verifiedAt: "2026-07-30T01:00:00.000Z",
    });
    assert.equal((await service.capture(first)).length, 1);
    assert.equal((await service.capture(first)).length, 1);

    const second = snapshot({
      sessionId,
      blockReference: "101",
      totalUsd: 110,
      verifiedAt: "2026-07-30T01:01:00.000Z",
    });
    const history = await service.capture(second);
    assert.equal(history.length, 2);
    assert.equal(history[1]?.totalUsd, 110);
    assert.equal(database.listPortfolioHistoryRecords(sessionId).length, 2);
    assert.equal(database.listPortfolioHistoryRecords(sessionId)[0]?.ciphertext.includes(WALLET), false);

    const restored = await new EncryptedPortfolioHistoryService(database, secretStore).list(sessionId);
    assert.deepEqual(restored, history);
    assert.deepEqual(service.performance(restored), {
      basis: "snapshot-to-snapshot",
      fromCapturedAt: "2026-07-30T01:00:00.000Z",
      toCapturedAt: "2026-07-30T01:01:00.000Z",
      valueChangeUsd: 10,
      valueChangePercent: 10,
      realizedPnlUsd: null,
      unrealizedPnlUsd: null,
      pnlStatus: "cost-basis-unavailable",
    });
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not invent performance when USD valuation is unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-portfolio-history-"));
  const database = await RuntimeDatabase.open(join(directory, "history.sqlite3"));
  const secrets = new Map<string, string>();
  const service = new EncryptedPortfolioHistoryService(database, {
    getSecret: async (name) => secrets.get(name) ?? null,
    setSecret: async (name, value) => {
      secrets.set(name, value);
    },
  });
  const sessionId = randomUUID();
  try {
    const history = await service.capture(snapshot({
      sessionId,
      blockReference: "200",
      totalUsd: null,
      verifiedAt: "2026-07-30T02:00:00.000Z",
    }));
    assert.equal(service.performance(history), null);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
