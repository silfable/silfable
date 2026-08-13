// @ts-nocheck
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { EvmBridgeReceiptSchema, type EvmBridgeReceipt } from "@silfable/contracts";
import type { RuntimeDatabase } from "../storage/database.js";

type Secrets = {
  getSecret(name: "evm-bridge-receipt-store-key"): Promise<string | null>;
  setSecret(name: "evm-bridge-receipt-store-key", value: string): Promise<void>;
};

const AAD = Buffer.from("silfable-evm-bridge-receipt-store-v1", "utf8");

export class EncryptedEvmBridgeReceiptService {
  readonly #database: RuntimeDatabase;
  readonly #secrets: Secrets;
  #keyTail: Promise<void> = Promise.resolve();

  constructor(database: RuntimeDatabase, secrets: Secrets) {
    this.#database = database;
    this.#secrets = secrets;
  }

  async save(raw: EvmBridgeReceipt): Promise<void> {
    const receipt = EvmBridgeReceiptSchema.parse(raw);
    const key = await this.#getKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(receipt), "utf8"), cipher.final()]);
    this.#database.upsertEvmBridgeReceiptRecord({
      id: receipt.id, ciphertext: ciphertext.toString("base64"), nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"), updatedAt: receipt.reconciledAt,
    });
  }

  async list(): Promise<EvmBridgeReceipt[]> {
    return await Promise.all(this.#database.listEvmBridgeReceiptRecords().map(async (record) => {
      const decipher = createDecipheriv("aes-256-gcm", await this.#getKey(), Buffer.from(record.nonce, "base64"));
      decipher.setAAD(AAD);
      decipher.setAuthTag(Buffer.from(record.tag, "base64"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8");
      return EvmBridgeReceiptSchema.parse(JSON.parse(plaintext));
    }));
  }

  async get(id: string): Promise<EvmBridgeReceipt | null> {
    return (await this.list()).find((receipt) => receipt.id === id) ?? null;
  }

  async #getKey(): Promise<Buffer> {
    let result: Buffer | null = null;
    const operation = this.#keyTail.then(async () => {
      let encoded = await this.#secrets.getSecret("evm-bridge-receipt-store-key");
      if (encoded === null) {
        encoded = randomBytes(32).toString("base64");
        await this.#secrets.setSecret("evm-bridge-receipt-store-key", encoded);
      }
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("EVM bridge receipt key is invalid");
      result = key;
    });
    this.#keyTail = operation.catch(() => undefined);
    await operation;
    if (result === null) throw new Error("EVM bridge receipt key is unavailable");
    return result;
  }
}
