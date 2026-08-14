// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HyperliquidOrderContract, HyperliquidOrderReceipt } from "@silfable/contracts";

import { HyperliquidMissionService } from "./hyperliquid.js";

const accountAddress = "0x1111111111111111111111111111111111111111" as const;
const agentAddress = "0x2222222222222222222222222222222222222222" as const;

function contract(overrides: Partial<HyperliquidOrderContract> = {}): HyperliquidOrderContract {
  const createdAt = new Date();
  return {
    id: crypto.randomUUID(),
    environment: "mainnet",
    market: "BTC",
    side: "long",
    orderKind: "market",
    size: "0.001",
    limitPrice: "100050",
    timeInForce: "Ioc",
    leverage: 1,
    marginMode: "isolated",
    reduceOnly: false,
    maximumSlippageBps: 100,
    maximumNotionalUsd: 200,
    createdAt: createdAt.toISOString(),
    deadline: new Date(createdAt.getTime() + 5 * 60_000).toISOString(),
    ...overrides,
  };
}

function dependencies(options: {
  submit?: "filled" | "resting" | "unknown";
  ready?: boolean;
  position?: string;
  withdrawable?: string;
  freshMark?: string;
  orderStatus?: "filled" | "cancelled";
} = {}) {
  let marketReads = 0;
  let cancelCalls = 0;
  const client = {
    async getBtcMarket() {
      marketReads += 1;
      return {
        assetId: 0,
        name: "BTC",
        sizeDecimals: 5,
        maximumLeverage: 40,
        markPrice: marketReads > 1 && options.freshMark
          ? options.freshMark
          : "100000",
        oraclePrice: "99990",
        fundingRate: "0.00001",
        openInterest: "1000",
        metadataDigest: `sha256:${"a".repeat(64)}` as const,
        retrievedAt: new Date().toISOString(),
      };
    },
    async getAccount() {
      return {
        accountValueUsd: "1000",
        withdrawableUsd: options.withdrawable ?? "900",
        totalMarginUsedUsd: "0",
        currentBtcPositionSize: options.position ?? "0",
        currentBtcLiquidationPrice: null,
        retrievedAt: new Date().toISOString(),
      };
    },
    async submitOrder() {
      if (options.submit === "resting") return { kind: "resting" as const, orderId: 8 };
      if (options.submit === "unknown") throw new Error("network timeout");
      return { kind: "filled" as const, orderId: 7, filledSize: "0.001", averagePrice: "100040" };
    },
    async cancelOrder() { cancelCalls += 1; },
    async getOrderStatus() {
      if (options.orderStatus === "cancelled") {
        return { kind: "cancelled" as const, orderId: 8, filledSize: "0" };
      }
      return { kind: "filled" as const, orderId: 8, filledSize: "0.001", averagePrice: "100030" };
    },
  };
  const agent = {
    async get() { return { accountAddress, agentAddress, approvedAt: new Date().toISOString() }; },
    async withSigner<T>(operation: (signer: never, summary: { accountAddress: typeof accountAddress; agentAddress: typeof agentAddress; approvedAt: string }) => Promise<T>) {
      return operation({} as never, { accountAddress, agentAddress, approvedAt: new Date().toISOString() });
    },
  };
  const execution = {
    passwords: { async verify(value: string) { return value === "correct"; } },
    emergencyStop: { assertExecutionAllowed() {} },
    readiness: {
      gateFor() {
        return { require() { if (options.ready === false) throw new Error("hyperliquid execution is disabled"); } };
      },
    },
  };
  return {
    client,
    agent,
    execution,
    get cancelCalls() { return cancelCalls; },
  };
}

describe("HyperliquidMissionService", () => {
  it("prepares a deterministic BTC-only proposal without signing", async () => {
    const deps = dependencies();
    const service = new HyperliquidMissionService(deps.client as never, deps.agent as never);
    const proposal = await service.prepare(contract());
    assert.equal(proposal.preflight.market.assetId, 0);
    assert.equal(proposal.preflight.transactionSigned, false);
    assert.equal(proposal.preflight.broadcastAttempted, false);
    assert.equal(proposal.preflight.policyChecks.length, 12);
  });

  it("blocks insufficient collateral and excessive price distance", async () => {
    const low = dependencies({ withdrawable: "1" });
    await assert.rejects(
      () => new HyperliquidMissionService(low.client as never, low.agent as never).prepare(contract()),
      /collateral/u,
    );
    const normal = dependencies();
    await assert.rejects(
      () => new HyperliquidMissionService(normal.client as never, normal.agent as never).prepare(contract({ limitPrice: "110000" })),
      /allowed distance/u,
    );
  });

  it("validates reduce-only direction and size", async () => {
    const deps = dependencies({ position: "0.002" });
    const service = new HyperliquidMissionService(deps.client as never, deps.agent as never);
    await assert.rejects(() => service.prepare(contract({ reduceOnly: true, side: "long" })), /cannot reduce/u);
    const proposal = await service.prepare(contract({ reduceOnly: true, side: "short" }));
    assert.equal(proposal.contract.reduceOnly, true);
  });

  it("persists before one-attempt submit and returns a filled receipt", async () => {
    const deps = dependencies();
    const service = new HyperliquidMissionService(deps.client as never, deps.agent as never, deps.execution as never);
    const proposal = await service.prepare(contract());
    const persisted: HyperliquidOrderReceipt[] = [];
    const receipt = await service.execute(
      proposal.contract.id,
      proposal.preflight.id,
      "correct",
      async (value) => { persisted.push(value); },
    );
    assert.equal(persisted[0]?.state, "persisted-before-submit");
    assert.equal(persisted[0]?.broadcastAttempted, false);
    assert.equal(receipt.state, "filled");
    assert.equal(receipt.broadcastAttempted, true);
  });

  it("consumes a preflight and never blindly retries an unknown submit", async () => {
    const deps = dependencies({ submit: "unknown" });
    const service = new HyperliquidMissionService(deps.client as never, deps.agent as never, deps.execution as never);
    const proposal = await service.prepare(contract());
    const receipt = await service.execute(proposal.contract.id, proposal.preflight.id, "correct", async () => {});
    assert.equal(receipt.state, "broadcast-unknown");
    await assert.rejects(
      () => service.execute(proposal.contract.id, proposal.preflight.id, "correct", async () => {}),
      /preflight expired/u,
    );
  });

  it("fails closed while venue readiness remains incomplete", async () => {
    const deps = dependencies({ ready: false });
    const service = new HyperliquidMissionService(deps.client as never, deps.agent as never, deps.execution as never);
    const proposal = await service.prepare(contract());
    await assert.rejects(
      () => service.execute(proposal.contract.id, proposal.preflight.id, "correct", async () => {}),
      /execution is disabled/u,
    );
  });

  it("blocks execution when the fresh mark moves beyond the approved distance", async () => {
    const deps = dependencies({ freshMark: "98000" });
    const service = new HyperliquidMissionService(
      deps.client as never,
      deps.agent as never,
      deps.execution as never,
    );
    const proposal = await service.prepare(contract());
    await assert.rejects(
      () => service.execute(
        proposal.contract.id,
        proposal.preflight.id,
        "correct",
        async () => {},
      ),
      /mark price moved/u,
    );
  });

  it("persists cancellation intent before one cancel attempt and reconciles it", async () => {
    const deps = dependencies({ submit: "resting", orderStatus: "cancelled" });
    const service = new HyperliquidMissionService(
      deps.client as never,
      deps.agent as never,
      deps.execution as never,
    );
    const proposal = await service.prepare(contract({ orderKind: "limit", timeInForce: "Gtc" }));
    const resting = await service.execute(
      proposal.contract.id,
      proposal.preflight.id,
      "correct",
      async () => {},
    );
    assert.equal(resting.state, "resting");
    const persisted: HyperliquidOrderReceipt[] = [];
    const cancelled = await service.cancel(
      resting,
      "correct",
      async (value) => { persisted.push(value); },
    );
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]?.cancelBroadcastAttempted, false);
    assert.ok(persisted[0]?.cancellationNonce !== null);
    assert.equal(deps.cancelCalls, 1);
    assert.equal(cancelled.state, "cancelled");
    assert.equal(cancelled.cancelBroadcastAttempted, true);
  });
});
