import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

import {
  FullAccessGrantRecordSchema,
  type EvmChainKey,
  type FullAccessGrantCreateRequest,
  type FullAccessGrantRecord,
  type GuardedCapability,
  type SessionWalletScope,
} from "@silfable/contracts";

import type { RuntimeDatabase } from "../storage/database.js";

type FullAccessSecrets = {
  getSecret(name: "full-access-store-key"): Promise<string | null>;
  setSecret(name: "full-access-store-key", value: string): Promise<void>;
};

type CreateContext = {
  walletAddress: string;
  walletScope: SessionWalletScope;
  evmChainKey: EvmChainKey | null;
};

export type GuardedPlanningAction = {
  capability: GuardedCapability;
  actionUsd: number;
  networkFeeUsd: number;
  feePercentage: number;
  slippageBps: number;
  solanaMint?: string;
  evmToken?: string;
};

const ALGORITHM = "aes-256-gcm";
const TERMINAL = new Set<FullAccessGrantRecord["status"]>([
  "REVOKED",
  "EXPIRED",
  "EMERGENCY_STOPPED",
]);

export class EncryptedFullAccessGrantService {
  readonly #database: RuntimeDatabase;
  readonly #secrets: FullAccessSecrets;
  #mutationTail: Promise<void> = Promise.resolve();
  #keyTail: Promise<void> = Promise.resolve();

  constructor(database: RuntimeDatabase, secrets: FullAccessSecrets) {
    this.#database = database;
    this.#secrets = secrets;
  }

  async list(now = new Date()): Promise<FullAccessGrantRecord[]> {
    await this.evaluate(now);
    await this.#mutationTail;
    return (await this.#readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async activeForSession(sessionId: string, now = new Date()): Promise<FullAccessGrantRecord | null> {
    const grants = await this.list(now);
    return grants.find((grant) => grant.sessionId === sessionId && grant.status === "ACTIVE") ?? null;
  }

  async create(
    input: Omit<
      FullAccessGrantCreateRequest,
      "schemaVersion" | "requestId" | "masterPassword" | "confirmation" | "acknowledgedNoApprovalBypass"
    >,
    context: CreateContext,
    now = new Date(),
  ): Promise<FullAccessGrantRecord> {
    const expiresAt = new Date(input.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
      throw new Error("Full Access grant expiry must be in the future");
    }
    if (expiresAt.getTime() - now.getTime() > 30 * 24 * 60 * 60 * 1_000) {
      throw new Error("Full Access grant lifetime cannot exceed 30 days");
    }
    this.#assertCapabilitiesMatchWallet(input.capabilities, context.walletScope);

    let result: FullAccessGrantRecord | null = null;
    await this.#mutate(async () => {
      const current = await this.#readAll();
      if (current.some((grant) => grant.sessionId === input.sessionId && !TERMINAL.has(grant.status))) {
        throw new Error("This session already has a live Full Access grant");
      }
      const timestamp = now.toISOString();
      result = FullAccessGrantRecordSchema.parse({
        id: randomUUID(),
        sessionId: input.sessionId,
        runtimeId: input.runtimeId,
        walletAddress: context.walletAddress,
        walletScope: context.walletScope,
        evmChainKey: context.evmChainKey,
        capabilities: [...new Set(input.capabilities)],
        allowedSolanaMints: [...new Set(input.allowedSolanaMints)],
        allowedEvmTokens: [...new Set(input.allowedEvmTokens.map((token) => token.toLowerCase()))],
        limits: input.limits,
        actionsUsed: 0,
        allocationUsedUsd: 0,
        status: "ACTIVE",
        startsAt: timestamp,
        expiresAt: expiresAt.toISOString(),
        createdAt: timestamp,
        updatedAt: timestamp,
        signingAllowed: false,
        broadcastAllowed: false,
        approvalBypassAllowed: false,
        executionAllowed: false,
        lifecycle: "guarded-planning",
      });
      await this.#write(result);
    });
    if (result === null) throw new Error("Full Access grant creation did not complete");
    return result;
  }

  async action(
    id: string,
    action: "PAUSE" | "RESUME" | "REVOKE",
    now = new Date(),
  ): Promise<FullAccessGrantRecord> {
    let result: FullAccessGrantRecord | null = null;
    await this.#mutate(async () => {
      const grant = await this.#require(id);
      if (TERMINAL.has(grant.status)) throw new Error("Full Access grant is already terminal");
      const status = action === "PAUSE" ? "PAUSED" : action === "RESUME" ? "ACTIVE" : "REVOKED";
      if (action === "PAUSE" && grant.status !== "ACTIVE") throw new Error("Only an active grant can be paused");
      if (action === "RESUME" && grant.status !== "PAUSED") throw new Error("Only a paused grant can be resumed");
      if (action === "RESUME" && Date.parse(grant.expiresAt) <= now.getTime()) {
        throw new Error("Expired Full Access grant cannot be resumed");
      }
      result = FullAccessGrantRecordSchema.parse({ ...grant, status, updatedAt: now.toISOString() });
      await this.#write(result);
    });
    if (result === null) throw new Error("Full Access grant action did not complete");
    return result;
  }

  async revokeForSession(sessionId: string, now = new Date()): Promise<void> {
    await this.#mutate(async () => {
      for (const grant of await this.#readAll()) {
        if (grant.sessionId !== sessionId || TERMINAL.has(grant.status)) continue;
        await this.#write(FullAccessGrantRecordSchema.parse({
          ...grant,
          status: "REVOKED",
          updatedAt: now.toISOString(),
        }));
      }
    });
  }

  async emergencyStop(now = new Date()): Promise<void> {
    await this.#mutate(async () => {
      for (const grant of await this.#readAll()) {
        if (TERMINAL.has(grant.status)) continue;
        await this.#write(FullAccessGrantRecordSchema.parse({
          ...grant,
          status: "EMERGENCY_STOPPED",
          updatedAt: now.toISOString(),
        }));
      }
    });
  }

  async evaluate(now = new Date()): Promise<void> {
    await this.#mutate(async () => {
      for (const grant of await this.#readAll()) {
        if (TERMINAL.has(grant.status) || Date.parse(grant.expiresAt) > now.getTime()) continue;
        await this.#write(FullAccessGrantRecordSchema.parse({
          ...grant,
          status: "EXPIRED",
          updatedAt: now.toISOString(),
        }));
      }
    });
  }

  async authorizePlanningAction(
    grantId: string,
    input: GuardedPlanningAction,
    now = new Date(),
  ): Promise<FullAccessGrantRecord> {
    let result: FullAccessGrantRecord | null = null;
    await this.#mutate(async () => {
      const grant = await this.#require(grantId);
      if (grant.status !== "ACTIVE") throw new Error("Full Access grant is not active");
      if (Date.parse(grant.expiresAt) <= now.getTime()) throw new Error("Full Access grant has expired");
      if (!grant.capabilities.includes(input.capability)) throw new Error("Capability is outside the Full Access grant");
      if (grant.actionsUsed >= grant.limits.maxActionsTotal) throw new Error("Full Access action limit has been reached");
      if (input.actionUsd > grant.limits.maxSingleActionUsd) throw new Error("Action exceeds the Full Access single-action limit");
      if (grant.allocationUsedUsd + input.actionUsd > grant.limits.maxTotalAllocationUsd) {
        throw new Error("Action exceeds the Full Access allocation limit");
      }
      if (input.networkFeeUsd > grant.limits.maxNetworkFeeUsd) throw new Error("Network fee exceeds the Full Access limit");
      if (input.feePercentage > grant.limits.maxFeePercentage) throw new Error("Fee percentage exceeds the Full Access limit");
      if (input.slippageBps > grant.limits.maxSlippageBps) throw new Error("Slippage exceeds the Full Access limit");
      if (
        input.solanaMint !== undefined
        && grant.allowedSolanaMints.length > 0
        && !grant.allowedSolanaMints.includes(input.solanaMint)
      ) throw new Error("Solana mint is outside the Full Access allowlist");
      if (
        input.evmToken !== undefined
        && grant.allowedEvmTokens.length > 0
        && !grant.allowedEvmTokens.includes(input.evmToken.toLowerCase())
      ) throw new Error("EVM token is outside the Full Access allowlist");
      result = FullAccessGrantRecordSchema.parse({
        ...grant,
        actionsUsed: grant.actionsUsed + 1,
        allocationUsedUsd: grant.allocationUsedUsd + input.actionUsd,
        updatedAt: now.toISOString(),
      });
      await this.#write(result);
    });
    if (result === null) throw new Error("Full Access authorization did not complete");
    return result;
  }

  async recordPlanningActions(
    grantId: string,
    capabilities: GuardedCapability[],
    now = new Date(),
  ): Promise<FullAccessGrantRecord> {
    let result: FullAccessGrantRecord | null = null;
    await this.#mutate(async () => {
      const grant = await this.#require(grantId);
      if (grant.status !== "ACTIVE") throw new Error("Full Access grant is not active");
      if (Date.parse(grant.expiresAt) <= now.getTime()) throw new Error("Full Access grant has expired");
      if (capabilities.length > grant.limits.maxActionsPerWake) {
        throw new Error("Full Access per-wake action limit has been reached");
      }
      if (capabilities.some((capability) => !grant.capabilities.includes(capability))) {
        throw new Error("AI used a capability outside the Full Access grant");
      }
      if (grant.actionsUsed + capabilities.length > grant.limits.maxActionsTotal) {
        throw new Error("Full Access total action limit has been reached");
      }
      result = FullAccessGrantRecordSchema.parse({
        ...grant,
        actionsUsed: grant.actionsUsed + capabilities.length,
        updatedAt: now.toISOString(),
      });
      await this.#write(result);
    });
    if (result === null) throw new Error("Full Access usage recording did not complete");
    return result;
  }

  #assertCapabilitiesMatchWallet(capabilities: GuardedCapability[], walletScope: SessionWalletScope): void {
    const solanaOnly = new Set<GuardedCapability>(["PREPARE_SOLANA_SWAP", "PREPARE_TOKEN_LAUNCH"]);
    const evmOnly = new Set<GuardedCapability>(["PREPARE_EVM_SWAP", "PREPARE_HYPERLIQUID_ORDER"]);
    if (walletScope === "solana" && capabilities.some((capability) => evmOnly.has(capability))) {
      throw new Error("EVM capabilities require an EVM session wallet");
    }
    if (walletScope === "evm" && capabilities.some((capability) => solanaOnly.has(capability))) {
      throw new Error("Solana capabilities require a Solana session wallet");
    }
  }

  async #require(id: string): Promise<FullAccessGrantRecord> {
    const grant = (await this.#readAll()).find((candidate) => candidate.id === id);
    if (grant === undefined) throw new Error("Full Access grant was not found");
    return grant;
  }

  async #readAll(): Promise<FullAccessGrantRecord[]> {
    const key = await this.#getKey();
    return this.#database.listFullAccessGrantRecords().map((encrypted) => {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(encrypted.nonce, "base64"));
      decipher.setAAD(Buffer.from(`silfable-full-access-v1:${encrypted.id}`, "utf8"));
      decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
      return FullAccessGrantRecordSchema.parse(JSON.parse(plaintext));
    });
  }

  async #write(grant: FullAccessGrantRecord): Promise<void> {
    const key = await this.#getKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, nonce);
    cipher.setAAD(Buffer.from(`silfable-full-access-v1:${grant.id}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(grant), "utf8"), cipher.final()]);
    this.#database.upsertFullAccessGrantRecord({
      id: grant.id,
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      updatedAt: grant.updatedAt,
    });
  }

  async #getKey(): Promise<Buffer> {
    let result: Buffer | null = null;
    const operation = this.#keyTail.then(async () => {
      let encoded = await this.#secrets.getSecret("full-access-store-key");
      if (encoded === null) {
        encoded = randomBytes(32).toString("base64");
        await this.#secrets.setSecret("full-access-store-key", encoded);
      }
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32 || key.toString("base64") !== encoded) {
        throw new Error("Full Access encryption key is invalid");
      }
      result = key;
    });
    this.#keyTail = operation.catch(() => undefined);
    await operation;
    if (result === null) throw new Error("Full Access encryption key is unavailable");
    return result;
  }

  async #mutate(operation: () => Promise<void>): Promise<void> {
    const pending = this.#mutationTail.then(operation);
    this.#mutationTail = pending.catch(() => undefined);
    await pending;
  }
}
