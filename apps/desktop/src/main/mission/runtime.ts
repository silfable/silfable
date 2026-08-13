// @ts-nocheck
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import {
  MissionRuntimeRecordSchema,
  MissionRuntimeWakeSchema,
  type MissionRuntimeCheckpointOutcome,
  type MissionRuntimeCreateRequest,
  type MissionRuntimeRecord,
  type MissionRuntimeWake,
} from "@silfable/contracts";

import type { RuntimeDatabase } from "../storage/database.js";

type MissionRuntimeSecrets = {
  getSecret(name: "mission-runtime-store-key"): Promise<string | null>;
  setSecret(name: "mission-runtime-store-key", value: string): Promise<void>;
};

type MissionRuntimeEnvelope = {
  record: MissionRuntimeRecord;
  wakes: MissionRuntimeWake[];
};

const ALGORITHM = "aes-256-gcm";
const WAKE_REVIEW_TTL_MS = 24 * 60 * 60 * 1_000;
const TERMINAL_STATUSES = new Set<MissionRuntimeRecord["status"]>([
  "COMPLETED",
  "STOPPED",
  "EXPIRED",
  "EMERGENCY_STOPPED",
]);

export class EncryptedMissionRuntimeService {
  readonly #database: RuntimeDatabase;
  readonly #secrets: MissionRuntimeSecrets;
  #mutationTail: Promise<void> = Promise.resolve();
  #keyTail: Promise<void> = Promise.resolve();

  constructor(database: RuntimeDatabase, secrets: MissionRuntimeSecrets) {
    this.#database = database;
    this.#secrets = secrets;
  }

  async list(): Promise<{ records: MissionRuntimeRecord[]; wakes: MissionRuntimeWake[] }> {
    await this.#mutationTail;
    const envelopes = await this.#readAll();
    return {
      records: envelopes.map(({ record }) => record).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      wakes: envelopes.flatMap(({ wakes }) => wakes).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  async create(
    input: Omit<MissionRuntimeCreateRequest, "schemaVersion" | "requestId" | "acknowledgedProposalOnly">,
    now = new Date(),
  ): Promise<MissionRuntimeRecord> {
    const createdAt = now.toISOString();
    const expiresAt = new Date(input.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
      throw new Error("Mission expiry must be in the future");
    }
    const record = MissionRuntimeRecordSchema.parse({
      id: randomUUID(),
      sessionId: input.sessionId,
      goal: input.goal,
      successCriteria: input.successCriteria,
      stopConditions: input.stopConditions,
      maxSteps: input.maxSteps,
      completedSteps: 0,
      wakeIntervalSeconds: (input as any).wakeIntervalSeconds ?? 0,
      status: "ACTIVE",
      nextWakeAt: new Date(now.getTime() + input.wakeIntervalSeconds * 1_000).toISOString(),
      lastWakeAt: null,
      checkpoint: null,
      expiresAt: expiresAt.toISOString(),
      createdAt,
      updatedAt: createdAt,
      executionAllowed: false,
      lifecycle: "proposal-only",
    });
    await this.#mutate(async () => {
      await this.#write({ record, wakes: [] });
    });
    return record;
  }

  async evaluate(now = new Date(), recovery = false): Promise<MissionRuntimeWake[]> {
    const created: MissionRuntimeWake[] = [];
    await this.#mutate(async () => {
      for (const envelope of await this.#readAll()) {
        let changed = false;
        for (let index = 0; index < envelope.wakes.length; index += 1) {
          const wake = envelope.wakes[index]!;
          if (wake.status === "AWAITING_REVIEW" && Date.parse(wake.expiresAt) <= now.getTime()) {
            envelope.wakes[index] = MissionRuntimeWakeSchema.parse({ ...wake, status: "EXPIRED" });
            if (envelope.record.status === "AWAITING_REVIEW") {
              envelope.record = this.#updateRecord(envelope.record, {
                status: "PAUSED",
                checkpoint: {
                  summary: "The review window expired. Resume the Mission to schedule a new checkpoint.",
                  outcome: "FAILED",
                  updatedAt: now.toISOString(),
                },
              }, now);
            }
            changed = true;
          }
        }
        if (!TERMINAL_STATUSES.has(envelope.record.status) && Date.parse(envelope.record.expiresAt) <= now.getTime()) {
          envelope.record = this.#updateRecord(envelope.record, { status: "EXPIRED", nextWakeAt: null }, now);
          changed = true;
        } else if (
          envelope.record.status === "ACTIVE"
          && envelope.record.nextWakeAt !== null
          && Date.parse(envelope.record.nextWakeAt) <= now.getTime()
        ) {
          const step = envelope.record.completedSteps + 1;
          const idempotencyKey = createHash("sha256")
            .update(`${envelope.record.id}:${step}:${envelope.record.nextWakeAt}`, "utf8")
            .digest("hex");
          const existing = envelope.wakes.find((wake) => wake.idempotencyKey === idempotencyKey);
          if (existing === undefined) {
            const wake = MissionRuntimeWakeSchema.parse({
              id: randomUUID(),
              runtimeId: envelope.record.id,
              sessionId: envelope.record.sessionId,
              step,
              idempotencyKey,
              status: "AWAITING_REVIEW",
              reason: recovery ? "RECOVERY_WAKE" : "SCHEDULED_WAKE",
              createdAt: now.toISOString(),
              expiresAt: new Date(now.getTime() + WAKE_REVIEW_TTL_MS).toISOString(),
              executionAllowed: false,
              disclosure: "A wake creates a review checkpoint only. It never signs or broadcasts a transaction.",
            });
            envelope.wakes.push(wake);
            created.push(wake);
          }
          envelope.record = this.#updateRecord(envelope.record, {
            status: "AWAITING_REVIEW",
            nextWakeAt: null,
            lastWakeAt: now.toISOString(),
            checkpoint: {
              summary: "Scheduled wake is awaiting a human review outcome.",
              outcome: "PENDING",
              updatedAt: now.toISOString(),
            },
          }, now);
          changed = true;
        }
        if (changed) await this.#write(envelope);
      }
    });
    return created;
  }

  async recover(now = new Date()): Promise<MissionRuntimeWake[]> {
    return await this.evaluate(now, true);
  }

  async action(id: string, action: "PAUSE" | "RESUME" | "STOP", now = new Date()): Promise<MissionRuntimeRecord> {
    let result: MissionRuntimeRecord | null = null;
    await this.#mutate(async () => {
      const envelope = await this.#requireEnvelope(id);
      if (TERMINAL_STATUSES.has(envelope.record.status)) throw new Error("Mission is already in a terminal state");
      if (action === "PAUSE") {
        if (envelope.record.status !== "ACTIVE") throw new Error("Only an active Mission can be paused");
        envelope.record = this.#updateRecord(envelope.record, { status: "PAUSED", nextWakeAt: null }, now);
      } else if (action === "RESUME") {
        if (envelope.record.status !== "PAUSED") throw new Error("Only a paused Mission can be resumed");
        envelope.record = this.#updateRecord(envelope.record, {
          status: "ACTIVE",
          nextWakeAt: new Date(now.getTime() + envelope.record.wakeIntervalSeconds * 1_000).toISOString(),
        }, now);
      } else {
        envelope.record = this.#updateRecord(envelope.record, { status: "STOPPED", nextWakeAt: null }, now);
      }
      await this.#write(envelope);
      result = envelope.record;
    });
    if (result === null) throw new Error("Mission action did not complete");
    return result;
  }

  async resolveWake(
    wakeId: string,
    outcome: Exclude<MissionRuntimeCheckpointOutcome, "PENDING">,
    summary: string,
    now = new Date(),
  ): Promise<{ record: MissionRuntimeRecord; wake: MissionRuntimeWake }> {
    let result: { record: MissionRuntimeRecord; wake: MissionRuntimeWake } | null = null;
    await this.#mutate(async () => {
      const envelopes = await this.#readAll();
      const envelope = envelopes.find(({ wakes }) => wakes.some((wake) => wake.id === wakeId));
      if (envelope === undefined) throw new Error("Mission wake was not found");
      const index = envelope.wakes.findIndex((wake) => wake.id === wakeId);
      const wake = envelope.wakes[index]!;
      if (wake.status !== "AWAITING_REVIEW") throw new Error("Mission wake was already resolved");
      if (Date.parse(wake.expiresAt) <= now.getTime()) throw new Error("Mission wake review has expired");
      if (envelope.record.status !== "AWAITING_REVIEW") throw new Error("Mission is not awaiting review");

      const acknowledged = MissionRuntimeWakeSchema.parse({ ...wake, status: "ACKNOWLEDGED" });
      envelope.wakes[index] = acknowledged;
      const completedSteps = envelope.record.completedSteps + 1;
      const shouldContinue = outcome === "CONTINUE" && completedSteps < envelope.record.maxSteps;
      const status: MissionRuntimeRecord["status"] = shouldContinue
        ? "ACTIVE"
        : outcome === "SUCCEEDED"
          ? "COMPLETED"
          : "STOPPED";
      envelope.record = this.#updateRecord(envelope.record, {
        completedSteps,
        status,
        nextWakeAt: shouldContinue
          ? new Date(now.getTime() + envelope.record.wakeIntervalSeconds * 1_000).toISOString()
          : null,
        checkpoint: { summary, outcome, updatedAt: now.toISOString() },
      }, now);
      await this.#write(envelope);
      result = { record: envelope.record, wake: acknowledged };
    });
    if (result === null) throw new Error("Mission wake resolution did not complete");
    return result;
  }

  async emergencyStop(now = new Date()): Promise<void> {
    await this.#mutate(async () => {
      for (const envelope of await this.#readAll()) {
        if (TERMINAL_STATUSES.has(envelope.record.status)) continue;
        envelope.record = this.#updateRecord(envelope.record, {
          status: "EMERGENCY_STOPPED",
          nextWakeAt: null,
          checkpoint: {
            summary: "Emergency stop engaged. No further Mission wakes will be scheduled.",
            outcome: "FAILED",
            updatedAt: now.toISOString(),
          },
        }, now);
        await this.#write(envelope);
      }
    });
  }

  async #requireEnvelope(id: string): Promise<MissionRuntimeEnvelope> {
    const envelope = (await this.#readAll()).find(({ record }) => record.id === id);
    if (envelope === undefined) throw new Error("Mission runtime was not found");
    return envelope;
  }

  #updateRecord(
    record: MissionRuntimeRecord,
    patch: Partial<MissionRuntimeRecord>,
    now: Date,
  ): MissionRuntimeRecord {
    return MissionRuntimeRecordSchema.parse({ ...record, ...patch, updatedAt: now.toISOString() });
  }

  async #readAll(): Promise<MissionRuntimeEnvelope[]> {
    const key = await this.#getKey();
    return this.#database.listMissionRuntimeRecords().map((encrypted) => {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(encrypted.nonce, "base64"));
      decipher.setAAD(Buffer.from(`silfable-mission-runtime-v1:${encrypted.id}`, "utf8"));
      decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
      const value = JSON.parse(plaintext) as MissionRuntimeEnvelope;
      return {
        record: MissionRuntimeRecordSchema.parse(value.record),
        wakes: value.wakes.map((wake) => MissionRuntimeWakeSchema.parse(wake)),
      };
    });
  }

  async #write(envelope: MissionRuntimeEnvelope): Promise<void> {
    const key = await this.#getKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, nonce);
    cipher.setAAD(Buffer.from(`silfable-mission-runtime-v1:${envelope.record.id}`, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(envelope), "utf8"),
      cipher.final(),
    ]);
    this.#database.upsertMissionRuntimeRecord({
      id: envelope.record.id,
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      updatedAt: envelope.record.updatedAt,
    });
  }

  async #getKey(): Promise<Buffer> {
    let result: Buffer | null = null;
    const operation = this.#keyTail.then(async () => {
      let encoded = await this.#secrets.getSecret("mission-runtime-store-key");
      if (encoded === null) {
        encoded = randomBytes(32).toString("base64");
        await this.#secrets.setSecret("mission-runtime-store-key", encoded);
      }
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("Mission runtime encryption key is invalid");
      result = key;
    });
    this.#keyTail = operation.catch(() => undefined);
    await operation;
    if (result === null) throw new Error("Mission runtime encryption key is unavailable");
    return result;
  }

  async #mutate(operation: () => Promise<void>): Promise<void> {
    const pending = this.#mutationTail.then(operation);
    this.#mutationTail = pending.catch(() => undefined);
    await pending;
  }
}
