import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { SessionRecordSchema, type SessionRecord } from "@silfable/contracts";

import type { RuntimeDatabase } from "../storage/database.js";
type SessionSecretStore = {
  getSecret(name: "session-data-key"): Promise<string | null>;
  setSecret(name: "session-data-key", value: string): Promise<void>;
};

const ALGORITHM = "aes-256-gcm";

export class SessionService {
  readonly #database: RuntimeDatabase;
  readonly #keystore: SessionSecretStore;
  #mutationTail: Promise<void> = Promise.resolve();
  #keyTail: Promise<void> = Promise.resolve();

  constructor(database: RuntimeDatabase, keystore: SessionSecretStore) {
    this.#database = database;
    this.#keystore = keystore;
  }

  async list(): Promise<SessionRecord[]> {
    await this.#mutationTail;
    const key = await this.#getOrCreateKey();
    const sessions: SessionRecord[] = [];
    for (const record of this.#database.listSessionRecords()) {
      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(record.nonce, "base64"));
        decipher.setAAD(Buffer.from(`silfable-session-v1:${record.id}`, "utf8"));
        decipher.setAuthTag(Buffer.from(record.tag, "base64"));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8");
        sessions.push(SessionRecordSchema.parse(JSON.parse(plaintext) as unknown));
      } catch {
        // Skip undecipherable or invalid session records to prevent UI failure
      }
    }
    return sessions;
  }

  async get(id: string): Promise<SessionRecord | null> {
    const sessions = await this.list();
    return sessions.find((session) => session.id === id) ?? null;
  }

  upsert(value: SessionRecord): Promise<void> {
    const session = SessionRecordSchema.parse(value);
    const operation = this.#mutationTail.then(async () => {
      const key = await this.#getOrCreateKey();
      const nonce = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, key, nonce);
      cipher.setAAD(Buffer.from(`silfable-session-v1:${session.id}`, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
      this.#database.upsertSessionRecord({
        id: session.id,
        ciphertext: ciphertext.toString("base64"),
        nonce: nonce.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        updatedAt: new Date().toISOString(),
      });
    });
    this.#mutationTail = operation.catch(() => undefined);
    return operation;
  }

  delete(id: string): Promise<void> {
    const operation = this.#mutationTail.then(async () => {
      this.#database.deleteSessionRecord(id);
    });
    this.#mutationTail = operation.catch(() => undefined);
    return operation;
  }

  async #getOrCreateKey(): Promise<Buffer> {
    let result: Buffer | null = null;
    const operation = this.#keyTail.then(async () => {
      let encoded = await this.#keystore.getSecret("session-data-key");
      if (encoded === null) {
        encoded = randomBytes(32).toString("base64");
        await this.#keystore.setSecret("session-data-key", encoded);
      }
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("Session encryption key is invalid");
      result = key;
    });
    this.#keyTail = operation.catch(() => undefined);
    await operation;
    if (result === null) throw new Error("Session encryption key is unavailable");
    return result;
  }
}
