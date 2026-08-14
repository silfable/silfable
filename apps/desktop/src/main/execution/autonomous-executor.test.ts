import assert from "node:assert/strict";
import test from "node:test";

import { AutonomousExecutorService, type AutonomousExecutorDependencies } from "./autonomous-executor.js";

test("autonomous executor fails closed when vault is locked or missing", async () => {
  const dependencies = new Proxy({}, {
    get() {
      throw new Error("Disabled autonomous execution must not access runtime authority");
    },
  }) as AutonomousExecutorDependencies;
  const service = new AutonomousExecutorService(dependencies);
  let emitted: unknown = null;
  service.once("execution_error", (event) => { emitted = event; });

  await assert.rejects(
    () => service.executeTrigger({
      positionId: "position-1",
      mintAddress: "So11111111111111111111111111111111111111112",
      reason: "STOP_LOSS",
      triggerPrice: 1,
      targetPrice: 2,
      amount: "1000000",
      triggeredAt: new Date().toISOString(),
    }),
    /Autonomous execution is disabled/u,
  );
  assert.deepEqual(emitted, {
    positionId: "position-1",
    error: "Autonomous execution is disabled. A trigger may create a reviewable proposal only; it cannot close a position, sign, or broadcast.",
  });
});

test("autonomous executor fails closed when vault reports locked", async () => {
  let closeCalls = 0;
  const service = new AutonomousExecutorService({
    keystore: { isLocked: () => true },
    strategyManager: { closePosition: () => { closeCalls += 1; } },
  } as unknown as AutonomousExecutorDependencies);

  await assert.rejects(() => service.executeTrigger({
    positionId: "pos-100",
    mintAddress: "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump",
    reason: "TAKE_PROFIT",
    triggerPrice: 2.5,
    targetPrice: 2.0,
    amount: "5000",
    triggeredAt: new Date().toISOString(),
  }), /cannot close a position, sign, or broadcast/u);
  assert.equal(closeCalls, 0);
});

test("autonomous executor never treats an unlocked vault as execution authority", async () => {
  let closedId = "";
  let emittedSuccess: unknown = null;

  const service = new AutonomousExecutorService({
    keystore: { isLocked: () => false },
    strategyManager: { closePosition: (id: string) => { closedId = id; } },
  } as unknown as AutonomousExecutorDependencies);

  service.once("execution_error", (event) => { emittedSuccess = event; });

  await assert.rejects(() => service.executeTrigger({
    positionId: "pos-200",
    mintAddress: "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump",
    reason: "TAKE_PROFIT",
    triggerPrice: 2.5,
    targetPrice: 2.0,
    amount: "5000",
    triggeredAt: new Date().toISOString(),
  }), /Autonomous execution is disabled/u);
  assert.equal(closedId, "");
  assert.deepEqual(emittedSuccess, {
    positionId: "pos-200",
    error: "Autonomous execution is disabled. A trigger may create a reviewable proposal only; it cannot close a position, sign, or broadcast.",
  });
});

test("end-to-end full access grant validation lifecycle in autonomous executor", async () => {
  let activeGrantState = true;
  const mockGrantService = {
    activeForSession: async (sessionId: string) => {
      if (sessionId === "active-session" && activeGrantState) {
        return { status: "ACTIVE", sessionId } as any;
      }
      return null;
    },
  };

  let closedPositionId = "";
  const service = new AutonomousExecutorService({
    keystore: { isLocked: () => false },
    strategyManager: { closePosition: (id: string) => { closedPositionId = id; } },
    fullAccessGrants: mockGrantService as any,
  } as unknown as AutonomousExecutorDependencies);

  // 1. A legacy planning grant must not become transaction authority.
  const activeResult = await service.executeTrigger({
    positionId: "pos-active",
    mintAddress: "So11111111111111111111111111111111111111112",
    reason: "STOP_LOSS",
    triggerPrice: 100,
    targetPrice: 90,
    amount: "1000",
    triggeredAt: new Date().toISOString(),
    sessionId: "active-session",
  });
  assert.equal(activeResult.status, "REVIEW_REQUIRED");
  assert.equal(closedPositionId, "");

  // 2. Revoked/Inactive session grant fails closed
  activeGrantState = false;
  await assert.rejects(
    () => service.executeTrigger({
      positionId: "pos-inactive",
      mintAddress: "So11111111111111111111111111111111111111112",
      reason: "STOP_LOSS",
      triggerPrice: 100,
      targetPrice: 90,
      amount: "1000",
      triggeredAt: new Date().toISOString(),
      sessionId: "active-session",
    }),
    /cannot close a position, sign, or broadcast/u,
  );
});

