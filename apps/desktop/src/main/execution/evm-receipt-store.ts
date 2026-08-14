import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { RuntimeDatabase } from "../storage/database.js";
import type { EvmExecutionReceipt } from "./evm-kyber-execution.js";

type ReceiptSecrets = {
  getSecret(name: "evm-receipt-store-key"): Promise<string | null>;
  setSecret(name: "evm-receipt-store-key", value: string): Promise<void>;
};

const AAD = Buffer.from("silfable-evm-receipt-store-v1", "utf8");

export class EncryptedEvmReceiptService {
  readonly #database: RuntimeDatabase;
  readonly #secrets: ReceiptSecrets;
  #keyTail: Promise<void> = Promise.resolve();

  constructor(database: RuntimeDatabase, secrets: ReceiptSecrets) {
    this.#database = database;
    this.#secrets = secrets;
  }

  async save(receipt: EvmExecutionReceipt): Promise<void> {
    assertReceipt(receipt);
    const key = await this.#getKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(receipt), "utf8"), cipher.final()]);
    this.#database.upsertEvmReceiptRecord({
      id: receipt.id,
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      updatedAt: receipt.reconciledAt,
    });
  }

  async list(): Promise<EvmExecutionReceipt[]> {
    return await Promise.all(this.#database.listEvmReceiptRecords().map(async (record) => await this.#decrypt(record)));
  }

  async #decrypt(record: { ciphertext: string; nonce: string; tag: string }): Promise<EvmExecutionReceipt> {
    const decipher = createDecipheriv("aes-256-gcm", await this.#getKey(), Buffer.from(record.nonce, "base64"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const receipt = JSON.parse(plaintext) as EvmExecutionReceipt;
    assertReceipt(receipt);
    return receipt;
  }

  async #getKey(): Promise<Buffer> {
    let result: Buffer | null = null;
    const operation = this.#keyTail.then(async () => {
      let encoded = await this.#secrets.getSecret("evm-receipt-store-key");
      if (encoded === null) {
        encoded = randomBytes(32).toString("base64");
        await this.#secrets.setSecret("evm-receipt-store-key", encoded);
      }
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("EVM receipt store key is invalid");
      result = key;
    });
    this.#keyTail = operation.catch(() => undefined);
    await operation;
    if (result === null) throw new Error("EVM receipt store key is unavailable");
    return result;
  }
}

function assertReceipt(value: EvmExecutionReceipt): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(value.id)
    || !/^0x[0-9a-f]+$/iu.test(value.transactionHash)
    || !/^0x[0-9a-f]{40}$/iu.test(value.wallet)
    || !["approval", "swap"].includes(value.kind)
    || !["confirmed", "reverted", "unknown"].includes(value.status)
    || !Number.isFinite(Date.parse(value.broadcastAt))
    || !Number.isFinite(Date.parse(value.reconciledAt))
  ) {
    throw new Error("EVM execution receipt is invalid");
  }
}
