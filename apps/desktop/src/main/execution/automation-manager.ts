import { createHash, randomUUID } from "node:crypto";

import type { RuntimeDatabase } from "../storage/database.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 31_536_000;
const MAX_EXECUTIONS = 365;

type StrategyStatus =
  | "ACTIVE"
  | "PAUSED"
  | "AWAITING_APPROVAL"
  | "EXPIRED"
  | "CANCELLED"
  | "EMERGENCY_STOPPED";

type CommonStrategy = {
  id: string;
  sessionId: string;
  walletFingerprint: string;
  /** Network is persisted with the strategy so sessions cannot dispatch a
   * Solana proposal through an EVM signer (or vice versa). Old records are
   * interpreted as Solana records. */
  chainKey: "solana" | "robinhood";
  inputMint: string;
  outputMint: string;
  status: StrategyStatus;
  expiresAt: string;
  nextWakeAt: string | null;
  pausedRemainingMs: number | null;
  lastEvaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DcaAutomationStrategy = CommonStrategy & {
  kind: "DCA";
  orderAmountRaw: string;
  maximumTotalRaw: string;
  intervalSeconds: number;
  maximumExecutions: number;
  completedExecutions: number;
};

export type ExitAutomationStrategy = CommonStrategy & {
  kind: "EXIT";
  amountRaw: string;
  entryPriceUsd: number;
  stopLossPriceUsd: number | null;
  takeProfitPriceUsd: number | null;
  trailingStopPercent: number | null;
  highestPriceUsd: number;
};

export type AutomationStrategy = DcaAutomationStrategy | ExitAutomationStrategy;

export type AutomationProposal = {
  id: string;
  strategyId: string;
  sessionId: string;
  walletFingerprint: string;
  inputMint: string;
  outputMint: string;
  inputAmountRaw: string;
  reason: "DCA_DUE" | "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING_STOP";
  observedPriceUsd: number | null;
  status: "AWAITING_APPROVAL" | "REJECTED" | "CONSUMED" | "EXPIRED";
  idempotencyKey: string;
  createdAt: string;
  disclosure: string;
};

export type CreateDcaAutomationInput = {
  id?: string;
  sessionId: string;
  walletAddress: string;
  chainKey?: "solana" | "robinhood";
  inputMint?: string;
  outputMint: string;
  orderAmountRaw: string;
  maximumTotalRaw: string;
  intervalSeconds: number;
  maximumExecutions: number;
  expiresAt: string;
};

export type CreateExitAutomationInput = {
  id?: string;
  sessionId: string;
  walletAddress: string;
  chainKey?: "solana" | "robinhood";
  inputMint: string;
  outputMint?: string;
  amountRaw: string;
  entryPriceUsd: number;
  stopLossPriceUsd?: number | null;
  takeProfitPriceUsd?: number | null;
  trailingStopPercent?: number | null;
  expiresAt: string;
};

function requireAddress(value: string, label: string, chainKey: "solana" | "robinhood" = "solana"): string {
  const normalized = value.trim();
  if (chainKey === "robinhood") {
    if (!/^0x[0-9a-fA-F]{40}$/u.test(normalized)) throw new Error(`${label} must be an exact EVM address.`);
    return normalized.toLowerCase();
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(normalized)) {
    throw new Error(`${label} must be an exact Solana address.`);
  }
  return normalized;
}

function walletFingerprint(address: string): string {
  return createHash("sha256").update(address, "utf8").digest("hex");
}

function requireRawAmount(value: string, label: string): string {
  if (!/^[1-9]\d*$/u.test(value)) throw new Error(`${label} must be a positive raw amount.`);
  if (BigInt(value) > 18_446_744_073_709_551_615n) throw new Error(`${label} exceeds u64.`);
  return value;
}

function requireFutureExpiry(value: string, now: Date): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= now.getTime() + 5 * 60_000) {
    throw new Error("Strategy expiry must be at least five minutes in the future.");
  }
  if (timestamp > now.getTime() + 365 * 24 * 60 * 60_000) {
    throw new Error("Strategy expiry cannot exceed one year.");
  }
  return new Date(timestamp).toISOString();
}

function requireIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function parseStrategy(record: ReturnType<RuntimeDatabase["listAutomationStrategies"]>[number]): AutomationStrategy {
  const parsed = {
    ...(record.config as Omit<AutomationStrategy, "id" | "status" | "nextWakeAt" | "lastEvaluatedAt" | "createdAt" | "updatedAt">),
    id: record.id,
    kind: record.kind,
    status: record.status,
    nextWakeAt: record.nextWakeAt,
    lastEvaluatedAt: record.lastEvaluatedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  } as AutomationStrategy;
  return { ...parsed, chainKey: parsed.chainKey ?? "solana" };
}

export class AutomationManager {
  readonly #db: RuntimeDatabase;

  constructor(db: RuntimeDatabase) {
    this.#db = db;
  }

  createDca(input: CreateDcaAutomationInput, now = new Date()): DcaAutomationStrategy {
    const chainKey = input.chainKey ?? "solana";
    const intervalSeconds = input.intervalSeconds;
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < MIN_INTERVAL_SECONDS || intervalSeconds > MAX_INTERVAL_SECONDS) {
      throw new Error("DCA interval must be between 60 seconds and one year.");
    }
    if (!Number.isInteger(input.maximumExecutions) || input.maximumExecutions < 1 || input.maximumExecutions > MAX_EXECUTIONS) {
      throw new Error(`DCA maximum executions must be between 1 and ${MAX_EXECUTIONS}.`);
    }
    const orderAmountRaw = requireRawAmount(input.orderAmountRaw, "DCA order amount");
    const maximumTotalRaw = requireRawAmount(input.maximumTotalRaw, "DCA maximum total");
    if (BigInt(orderAmountRaw) * BigInt(input.maximumExecutions) > BigInt(maximumTotalRaw)) {
      throw new Error("DCA orders exceed the configured maximum total.");
    }
    const createdAt = now.toISOString();
    const strategy: DcaAutomationStrategy = {
      id: input.id ?? randomUUID(),
      kind: "DCA",
      sessionId: requireIdentifier(input.sessionId, "Session"),
      walletFingerprint: walletFingerprint(requireAddress(input.walletAddress, "Wallet", chainKey)),
      chainKey,
      inputMint: input.inputMint ? requireAddress(input.inputMint, "Input mint", chainKey) : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: requireAddress(input.outputMint, "Output mint", chainKey),
      orderAmountRaw,
      maximumTotalRaw,
      intervalSeconds,
      maximumExecutions: input.maximumExecutions,
      completedExecutions: 0,
      expiresAt: requireFutureExpiry(input.expiresAt, now),
      status: "ACTIVE",
      nextWakeAt: new Date(now.getTime() + intervalSeconds * 1000).toISOString(),
      pausedRemainingMs: null,
      lastEvaluatedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    this.#persist(strategy);
    return strategy;
  }

  createExit(input: CreateExitAutomationInput, now = new Date()): ExitAutomationStrategy {
    const chainKey = input.chainKey ?? "solana";
    if (!Number.isFinite(input.entryPriceUsd) || input.entryPriceUsd <= 0) throw new Error("Entry price must be positive.");
    const stop = input.stopLossPriceUsd ?? null;
    const take = input.takeProfitPriceUsd ?? null;
    const trailing = input.trailingStopPercent ?? null;
    if (stop === null && take === null && trailing === null) throw new Error("Configure at least one exit condition.");
    if (stop !== null && (!Number.isFinite(stop) || stop <= 0 || stop >= input.entryPriceUsd)) throw new Error("Stop loss must be positive and below entry.");
    if (take !== null && (!Number.isFinite(take) || take <= input.entryPriceUsd)) throw new Error("Take profit must be above entry.");
    if (trailing !== null && (!Number.isFinite(trailing) || trailing <= 0 || trailing > 50)) throw new Error("Trailing stop must be between 0 and 50 percent.");
    const createdAt = now.toISOString();
    const strategy: ExitAutomationStrategy = {
      id: input.id ?? randomUUID(),
      kind: "EXIT",
      sessionId: requireIdentifier(input.sessionId, "Session"),
      walletFingerprint: walletFingerprint(requireAddress(input.walletAddress, "Wallet", chainKey)),
      chainKey,
      inputMint: requireAddress(input.inputMint, "Input mint", chainKey),
      outputMint: requireAddress(input.outputMint ?? SOL_MINT, "Output mint", chainKey),
      amountRaw: requireRawAmount(input.amountRaw, "Exit amount"),
      entryPriceUsd: input.entryPriceUsd,
      stopLossPriceUsd: stop,
      takeProfitPriceUsd: take,
      trailingStopPercent: trailing,
      highestPriceUsd: input.entryPriceUsd,
      expiresAt: requireFutureExpiry(input.expiresAt, now),
      status: "ACTIVE",
      nextWakeAt: createdAt,
      pausedRemainingMs: null,
      lastEvaluatedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    this.#persist(strategy);
    return strategy;
  }

  listStrategies(): AutomationStrategy[] {
    return this.#db.listAutomationStrategies().map(parseStrategy);
  }

  listProposals(): AutomationProposal[] {
    return this.#db.listAutomationProposals().map((record) => ({
      ...(record.proposal as AutomationProposal),
      status: record.status as AutomationProposal["status"],
    }));
  }

  setStatus(id: string, action: "PAUSE" | "RESUME" | "CANCEL", now = new Date()): AutomationStrategy {
    if (!["PAUSE", "RESUME", "CANCEL"].includes(action)) throw new Error("Automation action is invalid.");
    const strategy = this.#requireStrategy(id);
    if (action === "PAUSE" || action === "CANCEL") {
      for (const proposal of this.listProposals().filter((item) => item.strategyId === id && item.status === "AWAITING_APPROVAL")) {
        this.#db.setAutomationProposalStatus(proposal.id, "REJECTED");
      }
    }
    const status: StrategyStatus = action === "PAUSE" ? "PAUSED" : action === "CANCEL" ? "CANCELLED" : "ACTIVE";
    const pausedRemainingMs = action === "PAUSE" && strategy.nextWakeAt !== null
      ? Math.max(0, Date.parse(strategy.nextWakeAt) - now.getTime())
      : action === "RESUME"
        ? null
        : strategy.pausedRemainingMs;
    const resumedWakeAt = action === "RESUME"
      ? new Date(now.getTime() + Math.max(0, strategy.pausedRemainingMs ?? 0)).toISOString()
      : strategy.nextWakeAt;
    const next = {
      ...strategy,
      status,
      pausedRemainingMs,
      nextWakeAt: status === "ACTIVE" ? resumedWakeAt : strategy.nextWakeAt,
      updatedAt: now.toISOString(),
    };
    this.#persist(next);
    return next;
  }

  emergencyStop(now = new Date()): void {
    for (const strategy of this.listStrategies().filter((item) => item.status === "ACTIVE" || item.status === "AWAITING_APPROVAL")) {
      for (const proposal of this.listProposals().filter((item) => item.strategyId === strategy.id && item.status === "AWAITING_APPROVAL")) {
        this.#db.setAutomationProposalStatus(proposal.id, "REJECTED");
      }
      this.#persist({ ...strategy, status: "EMERGENCY_STOPPED", nextWakeAt: null, pausedRemainingMs: null, updatedAt: now.toISOString() });
    }
  }

  deferActiveEvaluations(now = new Date(), retryDelayMs = 60_000): void {
    for (const strategy of this.listStrategies().filter((item) => item.status === "ACTIVE")) {
      this.#persist({
        ...strategy,
        nextWakeAt: new Date(now.getTime() + retryDelayMs).toISOString(),
        pausedRemainingMs: null,
        lastEvaluatedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    }
  }

  approveProposal(id: string, now = new Date()): void {
    const proposal = this.listProposals().find((item) => item.id === id);
    if (!proposal || proposal.status !== "AWAITING_APPROVAL") return;
    this.#db.setAutomationProposalStatus(id, "CONSUMED");
    const strategy = this.listStrategies().find((item) => item.id === proposal.strategyId);
    if (!strategy) return;
    if (strategy.kind === "DCA") {
      const completed = strategy.completedExecutions + 1;
      const isDone = completed >= strategy.maximumExecutions;
      this.#persist({
        ...strategy,
        completedExecutions: completed,
        status: isDone ? "EXPIRED" : "ACTIVE",
        nextWakeAt: isDone ? null : new Date(now.getTime() + strategy.intervalSeconds * 1000).toISOString(),
        lastEvaluatedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    } else {
      this.#persist({
        ...strategy,
        status: "EXPIRED",
        nextWakeAt: null,
        lastEvaluatedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    }
  }

  rejectProposal(id: string): void {
    const proposal = this.listProposals().find((item) => item.id === id);
    if (!proposal || proposal.status !== "AWAITING_APPROVAL") return;
    this.#db.setAutomationProposalStatus(id, "REJECTED");
    const strategy = this.#requireStrategy(proposal.strategyId);
    if (strategy.status === "AWAITING_APPROVAL") {
      this.#persist({ ...strategy, status: "PAUSED", updatedAt: new Date().toISOString() });
    }
  }

  evaluate(now = new Date(), prices = new Map<string, number>()): AutomationProposal[] {
    const created: AutomationProposal[] = [];
    for (const current of this.listStrategies()) {
      if (current.status !== "ACTIVE") continue;
      if (Date.parse(current.expiresAt) <= now.getTime()) {
        this.#persist({ ...current, status: "EXPIRED", nextWakeAt: null, lastEvaluatedAt: now.toISOString(), updatedAt: now.toISOString() });
        continue;
      }
      if (current.nextWakeAt !== null && Date.parse(current.nextWakeAt) > now.getTime()) continue;
      if (current.kind === "DCA") {
        if (current.completedExecutions >= current.maximumExecutions) {
          this.#persist({ ...current, status: "EXPIRED", nextWakeAt: null, lastEvaluatedAt: now.toISOString(), updatedAt: now.toISOString() });
          continue;
        }
        const window = Math.floor(now.getTime() / (current.intervalSeconds * 1000));
        const proposal = this.#createProposal(current, "DCA_DUE", current.orderAmountRaw, null, `${current.id}:dca:${window}`, now);
        if (proposal) created.push(proposal);
        this.#persist({
          ...current,
          status: "AWAITING_APPROVAL",
          pausedRemainingMs: null,
          nextWakeAt: new Date(now.getTime() + current.intervalSeconds * 1000).toISOString(),
          lastEvaluatedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
        continue;
      }

      const price = prices.get(current.inputMint);
      if (price === undefined || !Number.isFinite(price) || price <= 0) {
        this.#persist({ ...current, pausedRemainingMs: null, lastEvaluatedAt: now.toISOString(), nextWakeAt: new Date(now.getTime() + 60_000).toISOString(), updatedAt: now.toISOString() });
        continue;
      }
      const highest = Math.max(current.highestPriceUsd, price);
      const trailingPrice = current.trailingStopPercent === null ? null : highest * (1 - current.trailingStopPercent / 100);
      const effectiveStop = Math.max(current.stopLossPriceUsd ?? 0, trailingPrice ?? 0) || null;
      const reason =
        effectiveStop !== null && price <= effectiveStop
          ? current.trailingStopPercent !== null && effectiveStop === trailingPrice ? "TRAILING_STOP" : "STOP_LOSS"
          : current.takeProfitPriceUsd !== null && price >= current.takeProfitPriceUsd
            ? "TAKE_PROFIT"
            : null;
      if (reason !== null) {
        const proposal = this.#createProposal(current, reason, current.amountRaw, price, `${current.id}:exit:${Math.floor(now.getTime() / 60_000)}`, now);
        if (proposal) created.push(proposal);
        this.#persist({ ...current, highestPriceUsd: highest, status: "AWAITING_APPROVAL", nextWakeAt: null, pausedRemainingMs: null, lastEvaluatedAt: now.toISOString(), updatedAt: now.toISOString() });
      } else {
        this.#persist({ ...current, highestPriceUsd: highest, nextWakeAt: new Date(now.getTime() + 60_000).toISOString(), pausedRemainingMs: null, lastEvaluatedAt: now.toISOString(), updatedAt: now.toISOString() });
      }
    }
    return created;
  }

  #createProposal(
    strategy: AutomationStrategy,
    reason: AutomationProposal["reason"],
    amount: string,
    price: number | null,
    idempotencyKey: string,
    now: Date,
  ): AutomationProposal | null {
    const createdAt = now.toISOString();
    const proposal: AutomationProposal = {
      id: randomUUID(),
      strategyId: strategy.id,
      sessionId: strategy.sessionId,
      walletFingerprint: strategy.walletFingerprint,
      inputMint: strategy.inputMint,
      outputMint: strategy.outputMint,
      inputAmountRaw: amount,
      reason,
      observedPriceUsd: price,
      status: "AWAITING_APPROVAL",
      idempotencyKey,
      createdAt,
      disclosure: "Observation only. This proposal cannot sign or broadcast and must enter the normal venue-specific simulation and final-approval flow.",
    };
    return this.#db.upsertAutomationProposal({
      id: proposal.id,
      strategyId: strategy.id,
      idempotencyKey,
      proposal,
      status: proposal.status,
      createdAt,
      updatedAt: createdAt,
    }) ? proposal : null;
  }

  #requireStrategy(id: string): AutomationStrategy {
    const strategy = this.listStrategies().find((item) => item.id === id);
    if (!strategy) throw new Error("Automation strategy was not found.");
    return strategy;
  }

  #persist(strategy: AutomationStrategy): void {
    const { id, kind, status, nextWakeAt, lastEvaluatedAt, createdAt, updatedAt, ...config } = strategy;
    this.#db.upsertAutomationStrategy({ id, kind, status, config, nextWakeAt, lastEvaluatedAt, createdAt, updatedAt });
  }
}
