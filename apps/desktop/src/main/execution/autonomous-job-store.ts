import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import {
  AutonomousExecutionAuditEventSchema,
  AutonomousExecutionJobSchema,
  type AutonomousExecutionAuditEvent,
  type AutonomousExecutionJob,
  type AutonomousExecutionJobKind,
  type FullAccessExecutionCapability,
} from "@silfable/contracts";

import type { RuntimeDatabase } from "../storage/database.js";

type Secrets = {
  getSecret(name: "full-access-store-key"): Promise<string | null>;
  setSecret(name: "full-access-store-key", value: string): Promise<void>;
};

export type AutonomousJobManifest = Readonly<Record<string, string | number | boolean | null | readonly string[]>>;

type StoredAutonomousJob = {
  job: AutonomousExecutionJob;
  policySnapshot: AutonomousJobManifest;
  pinnedParameters: AutonomousJobManifest;
};

export type CreateAutonomousJobInput = {
  sessionId: string;
  walletAddress: string;
  walletScope: "solana" | "evm";
  chainKey: "solana" | "robinhood";
  kind: AutonomousExecutionJobKind;
  capability: FullAccessExecutionCapability;
  policySnapshot: AutonomousJobManifest;
  pinnedParameters: AutonomousJobManifest;
};

const ALGORITHM = "aes-256-gcm";
const digest = (value: unknown) => `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${stableJson(item[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

/**
 * Records exact user-approved job manifests independently from grants. A grant
 * can only arm one of these immutable digests; it never receives mutable AI
 * instructions or decrypted wallet material.
 */
export class AutonomousJobStore {
  readonly #database: RuntimeDatabase;
  readonly #secrets: Secrets;
  #key: Buffer | null = null;
  #tail: Promise<void> = Promise.resolve();

  constructor(database: RuntimeDatabase, secrets: Secrets) {
    this.#database = database;
    this.#secrets = secrets;
  }

  async create(input: CreateAutonomousJobInput, now = new Date()): Promise<AutonomousExecutionJob> {
    this.#assertLane(input);
    this.#assertManifest(input.policySnapshot, "policy snapshot");
    this.#assertManifest(input.pinnedParameters, "pinned parameters");
    const timestamp = now.toISOString();
    const contentDigest = digest({ kind: input.kind, walletAddress: input.walletAddress, chainKey: input.chainKey, pinnedParameters: input.pinnedParameters });
    const policyDigest = digest(input.policySnapshot);
    const job = AutonomousExecutionJobSchema.parse({
      id: randomUUID(), version: 1, sessionId: input.sessionId, walletAddress: input.walletAddress,
      walletScope: input.walletScope, chainKey: input.chainKey, kind: input.kind, capability: input.capability,
      contentDigest, policyDigest, idempotencyKey: digest({ contentDigest, policyDigest }), state: "DRAFT", grantId: null,
      receiptReference: null, reconciliationState: "not-started", createdAt: timestamp, updatedAt: timestamp,
    });
    await this.#mutate(async () => {
      if ((await this.#readStoredJobs()).some((candidate) => candidate.job.idempotencyKey === job.idempotencyKey)) {
        throw new Error("An identical autonomous job already exists");
      }
      await this.#writeJob({ job, policySnapshot: input.policySnapshot, pinnedParameters: input.pinnedParameters });
      await this.#audit(job.id, null, "CREATED", { contentDigest, policyDigest }, now);
    });
    return job;
  }

  async list(): Promise<AutonomousExecutionJob[]> {
    return (await this.#readJobs()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Main-process-only access to the sealed manifest. Never expose this via IPC. */
  async getPinnedManifest(jobId: string): Promise<Readonly<StoredAutonomousJob>> {
    const stored = (await this.#readStoredJobs()).find((candidate) => candidate.job.id === jobId);
    if (stored === undefined) throw new Error("Autonomous job was not found");
    const contentDigest = digest({
      kind: stored.job.kind,
      walletAddress: stored.job.walletAddress,
      chainKey: stored.job.chainKey,
      pinnedParameters: stored.pinnedParameters,
    });
    if (contentDigest !== stored.job.contentDigest || digest(stored.policySnapshot) !== stored.job.policyDigest) {
      throw new Error("Autonomous job manifest integrity check failed");
    }
    return structuredClone(stored);
  }

  async audit(jobId: string): Promise<AutonomousExecutionAuditEvent[]> {
    return (await this.#readAudit()).filter((event) => event.jobId === jobId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  async arm(jobId: string, grantId: string, now = new Date()): Promise<AutonomousExecutionJob> {
    return this.#transition(jobId, ["DRAFT", "PAUSED"], "ARMED", grantId, "ARMED", now);
  }

  async pause(jobId: string, reason: string, now = new Date()): Promise<AutonomousExecutionJob> {
    return this.#transition(jobId, ["DRAFT", "ARMED", "RUNNING", "UNKNOWN"], "PAUSED", null, "PAUSED", now, { reason });
  }

  async markUnknown(jobId: string, reason: string, now = new Date()): Promise<AutonomousExecutionJob> {
    return this.#transition(jobId, ["RUNNING"], "UNKNOWN", undefined, "UNKNOWN", now, { reason });
  }

  async #transition(jobId: string, expected: AutonomousExecutionJob["state"][], state: AutonomousExecutionJob["state"], grantId: string | null | undefined, auditEvent: AutonomousExecutionAuditEvent["event"], now: Date, detail: AutonomousJobManifest = {}): Promise<AutonomousExecutionJob> {
    let result: AutonomousExecutionJob | null = null;
    await this.#mutate(async () => {
      const stored = (await this.#readStoredJobs()).find((candidate) => candidate.job.id === jobId);
      if (stored === undefined) throw new Error("Autonomous job was not found");
      const current = stored.job;
      if (!expected.includes(current.state)) throw new Error(`Job cannot move from ${current.state} to ${state}`);
      result = AutonomousExecutionJobSchema.parse({ ...current, state, grantId: grantId === undefined ? current.grantId : grantId, updatedAt: now.toISOString() });
      await this.#writeJob({
        job: result,
        policySnapshot: stored.policySnapshot as AutonomousJobManifest,
        pinnedParameters: stored.pinnedParameters as AutonomousJobManifest,
      });
      await this.#audit(result.id, result.grantId, auditEvent, detail, now);
    });
    if (result === null) throw new Error("Autonomous job transition did not complete");
    return result as AutonomousExecutionJob;
  }

  #assertLane(input: CreateAutonomousJobInput): void {
    const expected: Record<AutonomousExecutionJobKind, FullAccessExecutionCapability> = {
      SOLANA_SWAP: "SOLANA_SWAP", ROBINHOOD_SWAP: "ROBINHOOD_SWAP",
      SOLANA_TO_ROBINHOOD_BRIDGE: "SOLANA_TO_ROBINHOOD_BRIDGE",
      ROBINHOOD_TO_SOLANA_BRIDGE: "ROBINHOOD_TO_SOLANA_BRIDGE", PUMP_TOKEN_LAUNCH: "PUMP_TOKEN_LAUNCH",
    };
    if (input.capability !== expected[input.kind]) throw new Error("Job capability does not match its execution lane");
    if ((input.chainKey === "solana") !== (input.walletScope === "solana")) throw new Error("Job chain must match the bound wallet scope");
  }

  #assertManifest(value: AutonomousJobManifest, label: string): void {
    const entries = Object.entries(value);
    if (entries.length === 0 || entries.length > 64) throw new Error(`Autonomous ${label} is invalid`);
    for (const [key, item] of entries) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,80}$/u.test(key)) throw new Error(`Autonomous ${label} contains an invalid field`);
      const valid = item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean"
        || (Array.isArray(item) && item.every((entry) => typeof entry === "string"));
      if (!valid || (typeof item === "string" && item.length > 2_000)) throw new Error(`Autonomous ${label} contains an unsupported value`);
    }
  }

  async #audit(jobId: string, grantId: string | null, event: AutonomousExecutionAuditEvent["event"], detail: AutonomousJobManifest, now: Date): Promise<void> {
    const record = AutonomousExecutionAuditEventSchema.parse({ id: randomUUID(), jobId, grantId, event, detailDigest: digest(detail), occurredAt: now.toISOString() });
    await this.#writeAudit(record);
  }

  async #readJobs(): Promise<AutonomousExecutionJob[]> { return (await this.#readStoredJobs()).map((stored) => stored.job); }
  async #readStoredJobs(): Promise<StoredAutonomousJob[]> {
    return (await this.#decrypt(this.#database.listAutonomousExecutionJobRecords(), "job")).map((value) => {
      const stored = value as Partial<StoredAutonomousJob>;
      // A record from an early development build did not retain the manifest.
      // It remains readable nowhere and is deliberately not dispatchable.
      if (stored.job === undefined || stored.policySnapshot === undefined || stored.pinnedParameters === undefined) {
        throw new Error("Autonomous job is missing its immutable manifest and cannot execute");
      }
      this.#assertManifest(stored.policySnapshot, "policy snapshot");
      this.#assertManifest(stored.pinnedParameters, "pinned parameters");
      return { job: AutonomousExecutionJobSchema.parse(stored.job), policySnapshot: stored.policySnapshot, pinnedParameters: stored.pinnedParameters };
    });
  }
  async #readAudit(): Promise<AutonomousExecutionAuditEvent[]> { return (await this.#decrypt(this.#database.listAutonomousExecutionAuditRecords(), "audit")).map((value) => AutonomousExecutionAuditEventSchema.parse(value)); }

  async #decrypt(rows: ReturnType<RuntimeDatabase["listAutonomousExecutionJobRecords"]>, type: "job" | "audit"): Promise<unknown[]> {
    const key = await this.#getKey();
    return rows.map((row) => {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(row.nonce, "base64"));
      decipher.setAAD(Buffer.from(`silfable-autonomous-${type}-v1:${row.id}`, "utf8"));
      decipher.setAuthTag(Buffer.from(row.tag, "base64"));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]).toString("utf8"));
    });
  }

  async #writeJob(stored: StoredAutonomousJob): Promise<void> { this.#database.upsertAutonomousExecutionJobRecord(await this.#encrypt("job", stored.job.id, stored, stored.job.updatedAt)); }
  async #writeAudit(event: AutonomousExecutionAuditEvent): Promise<void> { this.#database.upsertAutonomousExecutionAuditRecord(await this.#encrypt("audit", event.id, event, event.occurredAt)); }

  async #encrypt(type: "job" | "audit", id: string, value: unknown, updatedAt: string) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, await this.#getKey(), nonce);
    cipher.setAAD(Buffer.from(`silfable-autonomous-${type}-v1:${id}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return { id, ciphertext: ciphertext.toString("base64"), nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64"), updatedAt };
  }

  async #getKey(): Promise<Buffer> {
    if (this.#key !== null) return this.#key;
    let encoded = await this.#secrets.getSecret("full-access-store-key");
    if (encoded === null) { encoded = randomBytes(32).toString("base64"); await this.#secrets.setSecret("full-access-store-key", encoded); }
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32) throw new Error("Autonomous job encryption key is invalid");
    this.#key = key;
    return key;
  }

  async #mutate(operation: () => Promise<void>): Promise<void> {
    const pending = this.#tail.then(operation);
    this.#tail = pending.catch(() => undefined);
    await pending;
  }
}
