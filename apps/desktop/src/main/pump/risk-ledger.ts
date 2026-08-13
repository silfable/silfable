import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import {
  PumpRiskLedgerEventSchema,
  PumpRiskLedgerSchema,
  PumpRiskUsageSchema,
  type PumpExecutionReceipt,
  type PumpRiskLedger,
  type PumpRiskLedgerEvent,
  type PumpRiskUsage,
} from "@silfable/contracts";

import type { RuntimeDatabase } from "../storage/database.js";

type LedgerSecretStore = {
  getSecret(name: "pump-risk-ledger-key"): Promise<string | null>;
  setSecret(name: "pump-risk-ledger-key", value: string): Promise<void>;
};

const ALGORITHM = "aes-256-gcm";
const AAD = Buffer.from("silfable-pump-risk-ledger-v1", "utf8");

export class PumpRiskLedgerService {
  readonly #database: RuntimeDatabase;
  readonly #keystore: LedgerSecretStore;
  #mutationTail: Promise<void> = Promise.resolve();
  #keyTail: Promise<void> = Promise.resolve();

  constructor(database: RuntimeDatabase, keystore: LedgerSecretStore) {
    this.#database = database;
    this.#keystore = keystore;
  }

  async usageFor(tokenMint: string, now = new Date()): Promise<PumpRiskUsage> {
    await this.#mutationTail;
    const ledger = await this.#read();
    const dayStart = now.getTime() - 24 * 60 * 60 * 1_000;
    const hourStart = now.getTime() - 60 * 60 * 1_000;
    let dailySpend = 0n;
    let transactionsThisHour = 0;
    const exposure = new Map<string, bigint>();
    for (const event of ledger.events) {
      const finalizedAt = Date.parse(event.finalizedAt);
      if (finalizedAt >= dayStart && finalizedAt <= now.getTime()) dailySpend += BigInt(event.spendLamports);
      if (finalizedAt >= hourStart && finalizedAt <= now.getTime()) transactionsThisHour += 1;
      exposure.set(event.tokenMint, (exposure.get(event.tokenMint) ?? 0n) + BigInt(event.exposureDeltaLamports));
    }
    const perTokenExposure = exposure.get(tokenMint) ?? 0n;
    const positiveExposures = [...exposure.values()].filter((value) => value > 0n);
    return PumpRiskUsageSchema.parse({
      dailySpendLamports: dailySpend.toString(),
      perTokenExposureLamports: perTokenExposure.toString(),
      totalExposureLamports: positiveExposures.reduce((total, value) => total + value, 0n).toString(),
      openPositions: positiveExposures.length,
      transactionsThisHour,
    });
  }

  recordFinalized(raw: PumpRiskLedgerEvent): Promise<void> {
    const event = PumpRiskLedgerEventSchema.parse(raw);
    const operation = this.#mutationTail.then(async () => {
      const ledger = await this.#read();
      const duplicate = ledger.events.find((entry) => entry.signature === event.signature);
      if (duplicate !== undefined) {
        if (JSON.stringify(duplicate) !== JSON.stringify(event)) throw new Error("A conflicting Pump receipt already exists for this signature");
        return;
      }
      const currentExposure = ledger.events
        .filter((entry) => entry.tokenMint === event.tokenMint)
        .reduce((total, entry) => total + BigInt(entry.exposureDeltaLamports), 0n);
      if (currentExposure + BigInt(event.exposureDeltaLamports) < 0n) throw new Error("A finalized Pump receipt cannot reduce token exposure below zero");
      if (ledger.events.length >= 5_000) throw new Error("Pump risk ledger capacity is exhausted; archive and reconcile before continuing");
      await this.#write(PumpRiskLedgerSchema.parse({ version: 1, events: [...ledger.events, event] }));
    });
    this.#mutationTail = operation.catch(() => undefined);
    return operation;
  }

  recordReceipt(receipt: PumpExecutionReceipt): Promise<void> {
    return this.recordFinalized(receiptToRiskLedgerEvent(receipt));
  }

  async #read(): Promise<PumpRiskLedger> {
    const record = this.#database.getPumpRiskLedgerRecord();
    if (record === null) return { version: 1, events: [] };
    const key = await this.#getOrCreateKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(record.nonce, "base64"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8");
    return PumpRiskLedgerSchema.parse(JSON.parse(plaintext) as unknown);
  }

  async #write(ledger: PumpRiskLedger): Promise<void> {
    const key = await this.#getOrCreateKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, nonce);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(ledger), "utf8"), cipher.final()]);
    this.#database.upsertPumpRiskLedgerRecord({
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      updatedAt: new Date().toISOString(),
    });
  }

  async #getOrCreateKey(): Promise<Buffer> {
    let result: Buffer | null = null;
    const operation = this.#keyTail.then(async () => {
      let encoded = await this.#keystore.getSecret("pump-risk-ledger-key");
      if (encoded === null) {
        encoded = randomBytes(32).toString("base64");
        await this.#keystore.setSecret("pump-risk-ledger-key", encoded);
      }
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("Pump risk ledger key is invalid");
      result = key;
    });
    this.#keyTail = operation.catch(() => undefined);
    await operation;
    if (result === null) throw new Error("Pump risk ledger key is unavailable");
    return result;
  }
}

export function receiptToRiskLedgerEvent(receipt: PumpExecutionReceipt): PumpRiskLedgerEvent {
  const isBuy = receipt.side === "buy";
  return PumpRiskLedgerEventSchema.parse({
    id: receipt.id,
    signature: receipt.signature,
    walletAddress: receipt.walletAddress,
    tokenMint: receipt.tokenMint,
    side: receipt.side,
    spendLamports: isBuy ? receipt.actualInputAmount : "0",
    exposureDeltaLamports: isBuy ? receipt.actualInputAmount : `-${receipt.actualOutputAmount}`,
    slot: receipt.slot,
    chainVerification: "finalized",
    finalizedAt: receipt.reconciledAt,
  });
}
