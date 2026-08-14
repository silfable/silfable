// @ts-nocheck
import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  HyperliquidOrderContractSchema,
  HyperliquidOrderProposalSchema,
  HyperliquidOrderReceiptSchema,
  type HyperliquidOrderContract,
  type HyperliquidOrderProposal,
  type HyperliquidOrderReceipt,
} from "@silfable/contracts";

import type {
  HyperliquidClientService,
  HyperliquidOrderStatus,
  HyperliquidVenueOrder,
} from "../integrations/hyperliquid.js";
import type { EmergencyStopService } from "../security/emergency-stop.js";
import type { MasterPasswordService } from "../security/master-password.js";
import type { VenueReadinessService } from "../security/venue-readiness.js";
import type { HyperliquidAgentWalletService } from "../wallet/hyperliquid-agent.js";

type ExecutionDependencies = {
  passwords: Pick<MasterPasswordService, "verify">;
  emergencyStop: Pick<EmergencyStopService, "assertExecutionAllowed">;
  readiness: Pick<VenueReadinessService, "gateFor">;
};

type PreparedOrder = {
  contract: HyperliquidOrderContract;
  proposal: HyperliquidOrderProposal;
  venueOrder: HyperliquidVenueOrder;
  expiresAt: number;
};

/**
 * Restricted BTC-perpetual execution boundary for Phase 4.
 *
 * Only metadata/account reads happen during prepare. The signer and venue
 * payload remain main-process-only. A prepared order is consumed once before
 * submission, and an unknown result can only be reconciled, never retried.
 */
export class HyperliquidMissionService {
  readonly #client: Pick<HyperliquidClientService, "getBtcMarket" | "getAccount" | "submitOrder" | "cancelOrder" | "getOrderStatus">;
  readonly #agent: Pick<HyperliquidAgentWalletService, "get" | "withSigner">;
  readonly #execution: ExecutionDependencies | null;
  readonly #prepared = new Map<string, PreparedOrder>();
  #lastNonce = 0;

  constructor(
    client: Pick<HyperliquidClientService, "getBtcMarket" | "getAccount" | "submitOrder" | "cancelOrder" | "getOrderStatus">,
    agent: Pick<HyperliquidAgentWalletService, "get" | "withSigner">,
    execution: ExecutionDependencies | null = null,
  ) {
    this.#client = client;
    this.#agent = agent;
    this.#execution = execution;
  }

  async prepare(raw: HyperliquidOrderContract): Promise<HyperliquidOrderProposal> {
    this.#purgeExpired();
    const contract = HyperliquidOrderContractSchema.parse(raw);
    const agent = await this.#agent.get();
    if (agent === null) throw new Error("Configure and approve a venue-isolated Hyperliquid API wallet first.");
    if (Date.parse(agent.approvedAt) > Date.now()) throw new Error("Hyperliquid API-wallet approval evidence is invalid.");

    const [market, account] = await Promise.all([
      this.#client.getBtcMarket(),
      this.#client.getAccount(agent.accountAddress),
    ]);
    if (market.name !== contract.market) throw new Error("Hyperliquid market identity changed.");
    if (market.maximumLeverage < contract.leverage) throw new Error("Requested leverage exceeds the venue market limit.");

    const normalizedSize = normalizeSize(contract.size, market.sizeDecimals);
    const normalizedLimitPrice = normalizePerpPrice(contract.limitPrice);
    const size = Number(normalizedSize);
    const price = Number(normalizedLimitPrice);
    const mark = Number(market.markPrice);
    const notional = size * price;
    const initialMargin = notional / contract.leverage;
    if (!Number.isFinite(notional) || notional <= 0 || notional > contract.maximumNotionalUsd) {
      throw new Error("Hyperliquid order notional exceeds the contract limit.");
    }
    const slippageBps = Math.abs(price - mark) / mark * 10_000;
    if (slippageBps > contract.maximumSlippageBps + 0.000001) {
      throw new Error("Hyperliquid limit price exceeds the allowed distance from the current mark price.");
    }
    assertPositionPolicy(contract, account.currentBtcPositionSize);
    if (!contract.reduceOnly && Number(account.withdrawableUsd) < initialMargin * 1.1) {
      throw new Error("Hyperliquid withdrawable collateral does not cover projected margin plus the safety buffer.");
    }

    const expiresAt = Math.min(Date.parse(contract.deadline), Date.now() + 60_000);
    if (expiresAt <= Date.now() + 5_000) throw new Error("Hyperliquid order deadline is too close; prepare a fresh order.");
    const clientOrderId = `0x${randomBytes(16).toString("hex")}` as const;
    const venueOrder: HyperliquidVenueOrder = {
      assetId: market.assetId,
      isBuy: contract.side === "long",
      price: normalizedLimitPrice,
      size: normalizedSize,
      reduceOnly: contract.reduceOnly,
      timeInForce: contract.timeInForce,
      clientOrderId,
      expiresAfter: expiresAt,
    };
    const orderDigest = digestOrder(venueOrder, contract.id, market.metadataDigest);
    const timestamp = new Date().toISOString();
    const checks = [
      check("pilot-market", "BTC perpetual is the only Phase 4 pilot market."),
      check("asset-id", `BTC resolved from fresh venue metadata to asset ID ${market.assetId}.`),
      check("metadata-binding", `Order is bound to ${market.metadataDigest}.`),
      check("isolated-margin", "Phase 4 accepts isolated margin only."),
      check("leverage", "Pilot leverage is fixed at 1x."),
      check("notional", `Projected notional ${notional.toFixed(2)} USD is within the contract ceiling.`),
      check("price-distance", `Limit price is ${slippageBps.toFixed(2)} bps from mark, within the configured ceiling.`),
      check("collateral", contract.reduceOnly ? "Reduce-only position direction was verified." : "Withdrawable collateral covers projected margin and safety buffer."),
      check("deadline", "Venue expiry is fresh and no more than sixty seconds."),
      check("agent-approval", `Venue-isolated API wallet approval was recorded at ${agent.approvedAt}.`),
      check("no-signature", "No order was signed during preflight."),
      check("no-broadcast", "No exchange request was sent during preflight."),
    ];
    const preflight = {
      id: crypto.randomUUID(),
      contractId: contract.id,
      clientOrderId,
      market: {
        assetId: market.assetId,
        market: "BTC" as const,
        sizeDecimals: market.sizeDecimals,
        venueMaximumLeverage: market.maximumLeverage,
        markPrice: market.markPrice,
        oraclePrice: market.oraclePrice,
        fundingRate: market.fundingRate,
        openInterest: market.openInterest,
        metadataDigest: market.metadataDigest,
        retrievedAt: market.retrievedAt,
      },
      account: {
        accountAddress: agent.accountAddress,
        accountValueUsd: account.accountValueUsd,
        withdrawableUsd: account.withdrawableUsd,
        totalMarginUsedUsd: account.totalMarginUsedUsd,
        currentBtcPositionSize: account.currentBtcPositionSize,
        currentBtcLiquidationPrice: account.currentBtcLiquidationPrice,
        projectedNotionalUsd: notional,
        projectedInitialMarginUsd: initialMargin,
        retrievedAt: account.retrievedAt,
      },
      normalizedSize,
      normalizedLimitPrice,
      orderDigest,
      policyChecks: checks,
      simulatedAt: timestamp,
      expiresAt: new Date(expiresAt).toISOString(),
      transactionSigned: false as const,
      broadcastAttempted: false as const,
    };
    const proposal = HyperliquidOrderProposalSchema.parse({ contract, preflight, state: "simulated" });
    this.#prepared.set(preflight.id, { contract, proposal, venueOrder, expiresAt });
    return proposal;
  }

  async execute(
    contractId: string,
    preflightId: string,
    masterPassword: string,
    persistBeforeSubmit: (receipt: HyperliquidOrderReceipt) => Promise<void>,
  ): Promise<HyperliquidOrderReceipt> {
    this.#purgeExpired();
    if (this.#execution === null) throw new Error("Hyperliquid execution dependencies are unavailable.");
    const prepared = this.#prepared.get(preflightId);
    this.#prepared.delete(preflightId);
    if (prepared === undefined || prepared.contract.id !== contractId) {
      throw new Error("Hyperliquid preflight expired; prepare and approve a fresh order.");
    }
    if (prepared.expiresAt <= Date.now()) throw new Error("Hyperliquid preflight expired before final approval.");
    this.#execution.emergencyStop.assertExecutionAllowed();
    this.#execution.readiness.gateFor("hyperliquid").require("hyperliquid");
    if (!(await this.#execution.passwords.verify(masterPassword))) throw new Error("Master password is incorrect.");

    const agent = await this.#agent.get();
    if (agent === null || agent.accountAddress !== prepared.proposal.preflight.account.accountAddress) {
      throw new Error("Hyperliquid API-wallet configuration changed after preflight.");
    }
    const freshMarket = await this.#client.getBtcMarket();
    if (freshMarket.metadataDigest !== prepared.proposal.preflight.market.metadataDigest) {
      throw new Error("Hyperliquid market metadata changed; prepare a fresh order.");
    }
    const freshMark = Number(freshMarket.markPrice);
    const approvedPrice = Number(prepared.venueOrder.price);
    const freshPriceDistanceBps = Math.abs(approvedPrice - freshMark) / freshMark * 10_000;
    if (
      !Number.isFinite(freshPriceDistanceBps)
      || freshPriceDistanceBps > prepared.contract.maximumSlippageBps + 0.000001
    ) {
      throw new Error(
        "Hyperliquid mark price moved beyond the approved limit; prepare a fresh order.",
      );
    }
    const freshAccount = await this.#client.getAccount(agent.accountAddress);
    assertPositionPolicy(prepared.contract, freshAccount.currentBtcPositionSize);
    if (!prepared.contract.reduceOnly && Number(freshAccount.withdrawableUsd) < prepared.proposal.preflight.account.projectedInitialMarginUsd * 1.1) {
      throw new Error("Hyperliquid collateral changed after approval.");
    }
    if (digestOrder(prepared.venueOrder, contractId, freshMarket.metadataDigest) !== prepared.proposal.preflight.orderDigest) {
      throw new Error("Hyperliquid order digest changed after approval.");
    }

    const nonce = this.#nextNonce();
    let receipt = HyperliquidOrderReceiptSchema.parse({
      id: crypto.randomUUID(),
      contractId,
      preflightId,
      clientOrderId: prepared.venueOrder.clientOrderId,
      accountAddress: agent.accountAddress,
      agentAddress: agent.agentAddress,
      market: "BTC",
      assetId: prepared.venueOrder.assetId,
      side: prepared.contract.side,
      requestedSize: prepared.venueOrder.size,
      requestedLimitPrice: prepared.venueOrder.price,
      orderId: null,
      filledSize: "0",
      averageFillPrice: null,
      state: "persisted-before-submit",
      nonce,
      expiresAfter: prepared.venueOrder.expiresAfter,
      orderDigest: prepared.proposal.preflight.orderDigest,
      broadcastAttempted: false,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await persistBeforeSubmit(receipt);
    try {
      receipt = await this.#agent.withSigner(async (signer) => {
        const result = await this.#client.submitOrder(signer, prepared.venueOrder, nonce);
        return applySubmitResult(receipt, result);
      });
    } catch (error) {
      receipt = HyperliquidOrderReceiptSchema.parse({
        ...receipt,
        state: "broadcast-unknown",
        broadcastAttempted: true,
        lastError: safeError(error),
        updatedAt: new Date().toISOString(),
      });
    }
    return receipt;
  }

  async reconcile(receipt: HyperliquidOrderReceipt): Promise<HyperliquidOrderReceipt> {
    const current = HyperliquidOrderReceiptSchema.parse(receipt);
    if (current.state === "filled" || current.state === "cancelled" || current.state === "rejected") return current;
    const status = await this.#client.getOrderStatus(
      current.accountAddress as `0x${string}`,
      (current.orderId ?? current.clientOrderId) as number | `0x${string}`,
    );
    return applyOrderStatus(current, status);
  }

  async cancel(
    receipt: HyperliquidOrderReceipt,
    masterPassword: string,
    persistBeforeCancel: (receipt: HyperliquidOrderReceipt) => Promise<void>,
  ): Promise<HyperliquidOrderReceipt> {
    if (this.#execution === null) throw new Error("Hyperliquid execution dependencies are unavailable.");
    const current = HyperliquidOrderReceiptSchema.parse(receipt);
    if (current.orderId === null || (current.state !== "resting" && current.state !== "partially-filled")) {
      throw new Error("Only a reconciled open Hyperliquid order can be cancelled.");
    }
    this.#execution.emergencyStop.assertExecutionAllowed();
    this.#execution.readiness.gateFor("hyperliquid").require("hyperliquid");
    if (!(await this.#execution.passwords.verify(masterPassword))) throw new Error("Master password is incorrect.");
    const expiresAfter = Date.now() + 30_000;
    const cancellationNonce = this.#nextNonce();
    const pendingCancellation = HyperliquidOrderReceiptSchema.parse({
      ...current,
      cancelBroadcastAttempted: false,
      cancellationNonce,
      cancellationRequestedAt: new Date().toISOString(),
      lastError: null,
      updatedAt: new Date().toISOString(),
    });
    await persistBeforeCancel(pendingCancellation);
    try {
      await this.#agent.withSigner(async (signer, agent) => {
        if (agent.accountAddress !== current.accountAddress || agent.agentAddress !== current.agentAddress) {
          throw new Error("Hyperliquid API-wallet configuration changed.");
        }
        await this.#client.cancelOrder(
          signer,
          current.assetId,
          current.orderId!,
          expiresAfter,
          cancellationNonce,
        );
      });
    } catch (error) {
      return HyperliquidOrderReceiptSchema.parse({
        ...pendingCancellation,
        state: "broadcast-unknown",
        cancelBroadcastAttempted: true,
        lastError: safeError(error),
        updatedAt: new Date().toISOString(),
      });
    }
    return this.reconcile(HyperliquidOrderReceiptSchema.parse({
      ...pendingCancellation,
      cancelBroadcastAttempted: true,
      updatedAt: new Date().toISOString(),
    }));
  }

  #nextNonce(): number {
    const now = Date.now();
    this.#lastNonce = Math.max(now, this.#lastNonce + 1);
    return this.#lastNonce;
  }

  #purgeExpired(): void {
    const now = Date.now();
    for (const [id, prepared] of this.#prepared) {
      if (prepared.expiresAt <= now) this.#prepared.delete(id);
    }
  }
}

function check(code: string, detail: string) {
  return { code, passed: true as const, detail };
}

function normalizeSize(value: string, decimals: number): string {
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`BTC size supports at most ${decimals} decimal places.`);
  const normalized = `${whole}.${fraction.padEnd(decimals, "0")}`.replace(/\.?0+$/u, "");
  if (Number(normalized) <= 0) throw new Error("BTC size must be positive.");
  return normalized;
}

function normalizePerpPrice(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("BTC limit price is invalid.");
  const significant = Number(numeric.toPrecision(5));
  const fixed = significant.toFixed(6).replace(/\.?0+$/u, "");
  return fixed;
}

function assertPositionPolicy(contract: HyperliquidOrderContract, positionSize: string): void {
  const current = Number(positionSize);
  if (!contract.reduceOnly) return;
  if (current === 0) throw new Error("Reduce-only order requires an existing BTC position.");
  if (contract.side === "long" && current > 0) throw new Error("A long reduce-only order cannot reduce the current long position.");
  if (contract.side === "short" && current < 0) throw new Error("A short reduce-only order cannot reduce the current short position.");
  if (Number(contract.size) > Math.abs(current) + 1e-12) throw new Error("Reduce-only size exceeds the current BTC position.");
}

function digestOrder(order: HyperliquidVenueOrder, contractId: string, metadataDigest: string): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify({ contractId, metadataDigest, order }))
    .digest("hex")}`;
}

function applySubmitResult(
  receipt: HyperliquidOrderReceipt,
  result: Awaited<ReturnType<HyperliquidClientService["submitOrder"]>>,
): HyperliquidOrderReceipt {
  const updatedAt = new Date().toISOString();
  if (result.kind === "rejected") return HyperliquidOrderReceiptSchema.parse({
    ...receipt, state: "rejected", broadcastAttempted: true, lastError: result.error, updatedAt,
  });
  if (result.kind === "waiting") return HyperliquidOrderReceiptSchema.parse({
    ...receipt, state: "broadcast-unknown", broadcastAttempted: true, lastError: "Venue accepted the request but did not return a terminal order status.", updatedAt,
  });
  if (result.kind === "resting") return HyperliquidOrderReceiptSchema.parse({
    ...receipt, state: "resting", orderId: result.orderId, broadcastAttempted: true, updatedAt,
  });
  return HyperliquidOrderReceiptSchema.parse({
    ...receipt,
    state: "filled",
    orderId: result.orderId,
    filledSize: result.filledSize,
    averageFillPrice: result.averagePrice,
    broadcastAttempted: true,
    updatedAt,
  });
}

function applyOrderStatus(receipt: HyperliquidOrderReceipt, status: HyperliquidOrderStatus): HyperliquidOrderReceipt {
  const updatedAt = new Date().toISOString();
  if (status.kind === "unknown") return HyperliquidOrderReceiptSchema.parse({
    ...receipt, state: "broadcast-unknown", lastError: "Order is not yet discoverable by order ID or client order ID.", updatedAt,
  });
  if (status.kind === "rejected") return HyperliquidOrderReceiptSchema.parse({
    ...receipt, state: "rejected", orderId: status.orderId, lastError: status.error, updatedAt,
  });
  if (status.kind === "cancelled") return HyperliquidOrderReceiptSchema.parse({
    ...receipt, state: "cancelled", orderId: status.orderId, filledSize: status.filledSize, lastError: null, updatedAt,
  });
  if (status.kind === "filled") return HyperliquidOrderReceiptSchema.parse({
    ...receipt, state: "filled", orderId: status.orderId, filledSize: status.filledSize, averageFillPrice: status.averagePrice, lastError: null, updatedAt,
  });
  return HyperliquidOrderReceiptSchema.parse({
    ...receipt,
    state: Number(status.filledSize) > 0 ? "partially-filled" : "resting",
    orderId: status.orderId,
    filledSize: status.filledSize,
    lastError: null,
    updatedAt,
  });
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Hyperliquid request failed.";
  return message.replace(/0x[0-9a-fA-F]{64}/gu, "[redacted]").slice(0, 500);
}
