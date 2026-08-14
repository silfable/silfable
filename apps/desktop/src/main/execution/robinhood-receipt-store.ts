import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { RuntimeDatabase } from "../storage/database.js";

type ReceiptSecrets = {
  getSecret(name: "robinhood-receipt-store-key"): Promise<string | null>;
  setSecret(name: "robinhood-receipt-store-key", value: string): Promise<void>;
};

export type RobinhoodExecutionReceipt = {
  id: string;
  transactionHash: `0x${string}`;
  wallet: `0x${string}`;
  kind: "approval" | "swap";
  status: "confirmed" | "reverted" | "unknown";
  reconciledAt: string;
};

const AAD = Buffer.from("silfable-robinhood-receipt-store-v1", "utf8");

/** Encrypts only reconciled execution evidence at rest; raw signed transactions are never stored. */
export class EncryptedRobinhoodReceiptService {
  readonly #database: RuntimeDatabase;
  readonly #secrets: ReceiptSecrets;
  #keyTail: Promise<void> = Promise.resolve();

  constructor(database: RuntimeDatabase, secrets: ReceiptSecrets) { this.#database = database; this.#secrets = secrets; }

  async save(receipt: RobinhoodExecutionReceipt): Promise<void> {
    assertReceipt(receipt);
    const key = await this.#getKey(); const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce); cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(receipt), "utf8"), cipher.final()]);
    this.#database.upsertRobinhoodReceiptRecord({ id: receipt.id, ciphertext: ciphertext.toString("base64"), nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64"), updatedAt: receipt.reconciledAt });
  }

  async get(id: string): Promise<RobinhoodExecutionReceipt | null> {
    const record = this.#database.getRobinhoodReceiptRecord(id);
    return record === null ? null : await this.#decrypt(record);
  }

  async list(): Promise<RobinhoodExecutionReceipt[]> {
    return await Promise.all(this.#database.listRobinhoodReceiptRecords().map(async (record) => await this.#decrypt(record)));
  }

  async #decrypt(record: { ciphertext: string; nonce: string; tag: string }): Promise<RobinhoodExecutionReceipt> {
    const decipher = createDecipheriv("aes-256-gcm", await this.#getKey(), Buffer.from(record.nonce, "base64"));
    decipher.setAAD(AAD); decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8");
    const receipt = JSON.parse(plaintext) as RobinhoodExecutionReceipt; assertReceipt(receipt); return receipt;
  }

  async #getKey(): Promise<Buffer> {
    let result: Buffer | null = null;
    const operation = this.#keyTail.then(async () => {
      let encoded = await this.#secrets.getSecret("robinhood-receipt-store-key");
      if (encoded === null) { encoded = randomBytes(32).toString("base64"); await this.#secrets.setSecret("robinhood-receipt-store-key", encoded); }
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("Robinhood receipt store key is invalid");
      result = key;
    });
    this.#keyTail = operation.catch(() => undefined); await operation;
    if (result === null) throw new Error("Robinhood receipt store key is unavailable");
    return result;
  }
}

function assertReceipt(value: RobinhoodExecutionReceipt): void {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(value.id) || !/^0x[0-9a-f]+$/iu.test(value.transactionHash) || !/^0x[0-9a-f]{40}$/iu.test(value.wallet) || !["approval", "swap"].includes(value.kind) || !["confirmed", "reverted", "unknown"].includes(value.status) || !Number.isFinite(Date.parse(value.reconciledAt))) throw new Error("Robinhood execution receipt is invalid");
}
