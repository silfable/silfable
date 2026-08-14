import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

import {
  FullAccessExecutionGrantRecordSchema,
  type EvmChainKey,
  type FullAccessExecutionCapability,
  type FullAccessExecutionGrantCreateRequest,
  type FullAccessExecutionGrantRecord,
  type SessionWalletScope,
} from "@silfable/contracts";

import type { RuntimeDatabase } from "../storage/database.js";
import type { LocalSigningSessionService } from "./local-signing-session.js";
import type { AutonomousJobStore } from "../execution/autonomous-job-store.js";

type Secrets = {
  getSecret(name: "full-access-store-key"): Promise<string | null>;
  setSecret(name: "full-access-store-key", value: string): Promise<void>;
};

type CreateContext = {
  walletAddress: string;
  walletScope: SessionWalletScope;
  evmChainKey: EvmChainKey | null;
};

const ALGORITHM = "aes-256-gcm";
const TERMINAL = new Set<FullAccessExecutionGrantRecord["status"]>(["EXPIRED", "REVOKED", "EMERGENCY_STOPPED"]);

/**
 * V2 grants are deliberately stored in a separate encrypted table from the
 * legacy planning grants.  This avoids silently upgrading prior consent.
 */
export class EncryptedFullAccessExecutionGrantService {
  readonly #database: RuntimeDatabase;
  readonly #secrets: Secrets;
  readonly #signingSession: LocalSigningSessionService;
  readonly #jobs: AutonomousJobStore;
  #mutationTail: Promise<void> = Promise.resolve();
  #key: Buffer | null = null;

  constructor(database: RuntimeDatabase, secrets: Secrets, signingSession: LocalSigningSessionService, jobs: AutonomousJobStore) {
    this.#database = database;
    this.#secrets = secrets;
    this.#signingSession = signingSession;
    this.#jobs = jobs;
  }

  async list(now = new Date()): Promise<FullAccessExecutionGrantRecord[]> {
    await this.evaluate(now);
    return (await this.#readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async activeForSession(sessionId: string, now = new Date()): Promise<FullAccessExecutionGrantRecord | null> {
    return (await this.list(now)).find((grant) => grant.sessionId === sessionId && grant.status === "ACTIVE") ?? null;
  }

  async create(
    input: Omit<FullAccessExecutionGrantCreateRequest, "schemaVersion" | "requestId" | "masterPassword" | "confirmation" | "acknowledgedRisk">,
    context: CreateContext,
    now = new Date(),
  ): Promise<FullAccessExecutionGrantRecord> {
    const expiry = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= now.getTime()) throw new Error("Full Access expiry must be in the future");
    if (expiry - now.getTime() > 24 * 60 * 60 * 1_000) throw new Error("Full Access grants cannot exceed 24 hours");
    this.#assertScope(input.capabilities, context);
    const pinnedJobs = await this.#jobs.list();
    for (const jobId of input.pinnedJobIds) {
      const job = pinnedJobs.find((candidate) => candidate.id === jobId);
      if (job === undefined) throw new Error("Every Full Access pinned job must exist locally");
      if (job.sessionId !== input.sessionId || job.walletAddress !== context.walletAddress) throw new Error("Pinned job is bound to a different session or wallet");
      if (job.state !== "DRAFT" && job.state !== "PAUSED") throw new Error("Pinned job is not eligible to arm");
      if (!input.capabilities.includes(job.capability)) throw new Error("Pinned job capability is outside the selected Full Access grant");
    }
    let result: FullAccessExecutionGrantRecord | null = null;
    await this.#mutate(async () => {
      const current = await this.#readAll();
      if (current.some((grant) => grant.sessionId === input.sessionId && !TERMINAL.has(grant.status))) {
        throw new Error("This session already has a live Full Access execution grant");
      }
      const timestamp = now.toISOString();
      result = FullAccessExecutionGrantRecordSchema.parse({
        id: randomUUID(), version: 2, sessionId: input.sessionId, runtimeId: input.runtimeId,
        walletAddress: context.walletAddress, walletScope: context.walletScope, evmChainKey: context.evmChainKey,
        capabilities: [...new Set(input.capabilities)], pinnedJobIds: [...new Set(input.pinnedJobIds)],
        allowedSolanaMints: [...new Set(input.allowedSolanaMints)],
        allowedEvmTokens: [...new Set(input.allowedEvmTokens.map((token) => token.toLowerCase()))],
        limits: input.limits, actionsUsed: 0, allocationUsedUsd: 0, status: "ACTIVE",
        startsAt: timestamp, expiresAt: new Date(expiry).toISOString(), createdAt: timestamp, updatedAt: timestamp,
        // Mirrors Vex's Full permission boundary: the generic approval gate
        // is skipped for this already-enrolled grant. Every venue-specific
        // safety/policy gate remains mandatory in the dispatcher.
        signingAllowed: true, broadcastAllowed: true, approvalBypassAllowed: true,
        genericApprovalBypassAllowed: true, executionAllowed: true,
        lifecycle: "guarded-execution-v2",
      });
      await this.#write(result);
    });
    if (result === null) throw new Error("Full Access execution grant creation did not complete");
    const created = result as FullAccessExecutionGrantRecord;
    try {
      for (const jobId of created.pinnedJobIds) await this.#jobs.arm(jobId, created.id, now);
    } catch (error) {
      await this.action(created.id, "REVOKE", now);
      throw error;
    }
    this.#signingSession.begin(created.expiresAt, now);
    return created;
  }

  async action(id: string, action: "PAUSE" | "RESUME" | "REVOKE", now = new Date()): Promise<FullAccessExecutionGrantRecord> {
    let result: FullAccessExecutionGrantRecord | null = null;
    await this.#mutate(async () => {
      const grant = await this.#require(id);
      if (TERMINAL.has(grant.status)) throw new Error("Full Access execution grant is terminal");
      if (action === "PAUSE" && grant.status !== "ACTIVE") throw new Error("Only an active grant can be paused");
      if (action === "RESUME" && grant.status !== "PAUSED") throw new Error("Only a paused grant can be resumed");
      if (action === "RESUME" && Date.parse(grant.expiresAt) <= now.getTime()) throw new Error("Expired Full Access grant cannot be resumed");
      const status = action === "PAUSE" ? "PAUSED" : action === "REVOKE" ? "REVOKED" : "ACTIVE";
      result = FullAccessExecutionGrantRecordSchema.parse({ ...grant, status, updatedAt: now.toISOString() });
      await this.#write(result);
    });
    if (action !== "RESUME") this.#signingSession.clear(action === "REVOKE" ? "grant revoked" : "grant paused");
    if (action === "RESUME" && result !== null) this.#signingSession.begin((result as FullAccessExecutionGrantRecord).expiresAt, now);
    if (result === null) throw new Error("Full Access execution grant action did not complete");
    return result as FullAccessExecutionGrantRecord;
  }

  async emergencyStop(now = new Date()): Promise<void> {
    await this.#mutate(async () => {
      for (const grant of await this.#readAll()) {
        if (TERMINAL.has(grant.status)) continue;
        await this.#write(FullAccessExecutionGrantRecordSchema.parse({ ...grant, status: "EMERGENCY_STOPPED", updatedAt: now.toISOString() }));
      }
    });
    this.#signingSession.clear("emergency stop engaged");
  }

  async evaluate(now = new Date()): Promise<void> {
    await this.#mutate(async () => {
      for (const grant of await this.#readAll()) {
        if (TERMINAL.has(grant.status) || Date.parse(grant.expiresAt) > now.getTime()) continue;
        await this.#write(FullAccessExecutionGrantRecordSchema.parse({ ...grant, status: "EXPIRED", updatedAt: now.toISOString() }));
      }
    });
    this.#signingSession.status(now);
  }

  async #require(id: string): Promise<FullAccessExecutionGrantRecord> {
    const grant = (await this.#readAll()).find((candidate) => candidate.id === id);
    if (grant === undefined) throw new Error("Full Access execution grant was not found");
    return grant;
  }

  #assertScope(capabilities: FullAccessExecutionCapability[], context: CreateContext): void {
    const solana = new Set<FullAccessExecutionCapability>(["SOLANA_SWAP", "SOLANA_TO_ROBINHOOD_BRIDGE", "PUMP_TOKEN_LAUNCH"]);
    const evm = new Set<FullAccessExecutionCapability>(["ROBINHOOD_SWAP", "ROBINHOOD_TO_SOLANA_BRIDGE"]);
    if (context.walletScope === "solana" && capabilities.some((capability) => evm.has(capability))) throw new Error("Robinhood execution capabilities require an EVM wallet-bound session");
    if (context.walletScope === "evm" && capabilities.some((capability) => solana.has(capability))) throw new Error("Solana execution capabilities require a Solana wallet-bound session");
    if (context.walletScope === "evm" && context.evmChainKey !== "robinhood") throw new Error("Full Access EVM execution is limited to Robinhood Chain");
  }

  async #readAll(): Promise<FullAccessExecutionGrantRecord[]> {
    const key = await this.#getKey();
    return this.#database.listFullAccessExecutionGrantRecords().map((encrypted) => {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(encrypted.nonce, "base64"));
      decipher.setAAD(Buffer.from(`silfable-full-access-execution-v2:${encrypted.id}`, "utf8"));
      decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64")), decipher.final()]).toString("utf8");
      return FullAccessExecutionGrantRecordSchema.parse(JSON.parse(plaintext));
    });
  }

  async #write(grant: FullAccessExecutionGrantRecord): Promise<void> {
    const nonce = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, await this.#getKey(), nonce);
    cipher.setAAD(Buffer.from(`silfable-full-access-execution-v2:${grant.id}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(grant), "utf8"), cipher.final()]);
    this.#database.upsertFullAccessExecutionGrantRecord({ id: grant.id, ciphertext: ciphertext.toString("base64"), nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64"), updatedAt: grant.updatedAt });
  }

  async #getKey(): Promise<Buffer> {
    if (this.#key !== null) return this.#key;
    let encoded = await this.#secrets.getSecret("full-access-store-key");
    if (encoded === null) { encoded = randomBytes(32).toString("base64"); await this.#secrets.setSecret("full-access-store-key", encoded); }
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("Full Access encryption key is invalid");
    this.#key = key;
    return key;
  }

  async #mutate(operation: () => Promise<void>): Promise<void> {
    const pending = this.#mutationTail.then(operation);
    this.#mutationTail = pending.catch(() => undefined);
    await pending;
  }
}
