import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import {
  PumpExecutionReceiptSchema,
  type PumpExecutionReceipt,
} from "@silfable/contracts";

import type { RuntimeDatabase } from "../storage/database.js";
import type { PumpRiskLedgerService } from "./risk-ledger.js";

type ReceiptSecretStore = {
  getSecret(name: "pump-receipt-store-key"): Promise<string | null>;
  setSecret(name: "pump-receipt-store-key", value: string): Promise<void>;
};

const ALGORITHM = "aes-256-gcm";
const AAD = Buffer.from("silfable-pump-receipt-store-v1", "utf8");

export class EncryptedPumpReceiptService {
  readonly #database: RuntimeDatabase;
  readonly #keystore: ReceiptSecretStore;
  readonly #riskLedger: PumpRiskLedgerService | undefined;
  #keyTail: Promise<void> = Promise.resolve();

  constructor(database: RuntimeDatabase, keystore: ReceiptSecretStore, riskLedger?: PumpRiskLedgerService) {
    this.#database = database;
    this.#keystore = keystore;
    this.#riskLedger = riskLedger;
  }

  async saveReceipt(receipt: PumpExecutionReceipt): Promise<void> {
    const parsed = PumpExecutionReceiptSchema.parse(receipt);
    const key = await this.#getOrCreateKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, nonce);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(parsed), "utf8"), cipher.final()]);
    this.#database.upsertPumpReceiptRecord({
      id: parsed.id,
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      updatedAt: parsed.reconciledAt,
    });
    if (this.#riskLedger !== undefined) {
      await this.#riskLedger.recordReceipt(parsed);
    }
  }

  async getReceipt(id: string): Promise<PumpExecutionReceipt | null> {
    const record = this.#database.getPumpReceiptRecord(id);
    if (record === null) return null;
    const key = await this.#getOrCreateKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(record.nonce, "base64"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8");
    return PumpExecutionReceiptSchema.parse(JSON.parse(plaintext) as unknown);
  }

  async listReceipts(): Promise<PumpExecutionReceipt[]> {
    const records = this.#database.listPumpReceiptRecords();
    if (records.length === 0) return [];
    const key = await this.#getOrCreateKey();
    const results: PumpExecutionReceipt[] = [];
    for (const record of records) {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(record.nonce, "base64"));
      decipher.setAAD(AAD);
      decipher.setAuthTag(Buffer.from(record.tag, "base64"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8");
      results.push(PumpExecutionReceiptSchema.parse(JSON.parse(plaintext) as unknown));
    }
    return results;
  }

  async #getOrCreateKey(): Promise<Buffer> {
    let result: Buffer | null = null;
    const operation = this.#keyTail.then(async () => {
      let encoded = await this.#keystore.getSecret("pump-receipt-store-key");
      if (encoded === null) {
        encoded = randomBytes(32).toString("base64");
        await this.#keystore.setSecret("pump-receipt-store-key", encoded);
      }
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("Pump receipt store key is invalid");
      result = key;
    });
    this.#keyTail = operation.catch(() => undefined);
    await operation;
    if (result === null) throw new Error("Pump receipt store key is unavailable");
    return result;
  }
}
