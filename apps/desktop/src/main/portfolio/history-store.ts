import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

import {
  PortfolioHistoryPointSchema,
  PortfolioPerformanceSchema,
  type PortfolioHistoryPoint,
  type PortfolioPerformance,
  type UnifiedPortfolioSnapshot,
} from "@silfable/contracts";

import type { RuntimeDatabase } from "../storage/database.js";

type HistorySecrets = {
  getSecret(name: "portfolio-history-store-key"): Promise<string | null>;
  setSecret(name: "portfolio-history-store-key", value: string): Promise<void>;
};

const AAD = Buffer.from("silfable-portfolio-history-v1", "utf8");

export class EncryptedPortfolioHistoryService {
  readonly #database: RuntimeDatabase;
  readonly #secrets: HistorySecrets;
  #keyTail: Promise<void> = Promise.resolve();

  constructor(database: RuntimeDatabase, secrets: HistorySecrets) {
    this.#database = database;
    this.#secrets = secrets;
  }

  async capture(snapshot: UnifiedPortfolioSnapshot): Promise<PortfolioHistoryPoint[]> {
    if (snapshot.chains.length === 0) return await this.list(snapshot.sessionId);
    const current: PortfolioHistoryPoint = {
      id: randomUUID(),
      sessionId: snapshot.sessionId,
      walletAddress: snapshot.walletAddress,
      totalUsd: snapshot.totalUsd,
      chains: snapshot.chains.map((chain) => ({
        chainKey: chain.chainKey,
        blockReference: chain.blockReference,
        totalUsd: chain.totalUsd,
        valuationStatus: chain.valuationStatus,
      })) as any,
      capturedAt: snapshot.verifiedAt,
    } as unknown as PortfolioHistoryPoint;
    const existing = await this.list(snapshot.sessionId);
    const latest = existing.at(-1);
    if (latest === undefined || fingerprint(latest) !== fingerprint(current)) {
      await this.#save(current);
      existing.push(current);
    }
    return existing.slice(-96);
  }

  async list(sessionId: string): Promise<PortfolioHistoryPoint[]> {
    const records = this.#database.listPortfolioHistoryRecords(sessionId, 96);
    const points = await Promise.all(records.map(async (record) => await this.#decrypt(record)));
    return points.sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));
  }

  performance(points: readonly PortfolioHistoryPoint[]): PortfolioPerformance | null {
    const comparable = points.filter((point) => point.totalUsd !== null);
    const latest = comparable.at(-1);
    if (latest === undefined) return null;
    const previous = comparable.at(-2);
    const change = previous === undefined ? null : latest.totalUsd! - previous.totalUsd!;
    const percent = change === null || previous?.totalUsd === 0
      ? null
      : (change / previous!.totalUsd!) * 100;
    return PortfolioPerformanceSchema.parse({
      basis: "snapshot-to-snapshot",
      fromCapturedAt: previous?.capturedAt ?? null,
      toCapturedAt: latest.capturedAt,
      valueChangeUsd: change,
      valueChangePercent: percent,
      realizedPnlUsd: null,
      unrealizedPnlUsd: null,
      pnlStatus: "cost-basis-unavailable",
    });
  }

  async #save(point: PortfolioHistoryPoint): Promise<void> {
    const key = await this.#getKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(point), "utf8"), cipher.final()]);
    this.#database.insertPortfolioHistoryRecord(point.sessionId, {
      id: point.id,
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      updatedAt: point.capturedAt,
    });
  }

  async #decrypt(record: { ciphertext: string; nonce: string; tag: string }): Promise<PortfolioHistoryPoint> {
    const decipher = createDecipheriv("aes-256-gcm", await this.#getKey(), Buffer.from(record.nonce, "base64"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as unknown as PortfolioHistoryPoint;
  }

  async #getKey(): Promise<Buffer> {
    let result: Buffer | null = null;
    const operation = this.#keyTail.then(async () => {
      let encoded = await this.#secrets.getSecret("portfolio-history-store-key");
      if (encoded === null) {
        encoded = randomBytes(32).toString("base64");
        await this.#secrets.setSecret("portfolio-history-store-key", encoded);
      }
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32 || key.toString("base64") !== encoded) {
        throw new Error("Portfolio history store key is invalid.");
      }
      result = key;
    });
    this.#keyTail = operation.catch(() => undefined);
    await operation;
    if (result === null) throw new Error("Portfolio history store key is unavailable.");
    return result;
  }
}

function fingerprint(point: PortfolioHistoryPoint): string {
  return JSON.stringify({
    walletAddress: point.walletAddress,
    totalUsd: point.totalUsd,
    chains: point.chains.map((chain) => [
      chain.chainKey,
      chain.blockReference,
      chain.totalUsd,
      chain.valuationStatus,
    ]),
  });
}
