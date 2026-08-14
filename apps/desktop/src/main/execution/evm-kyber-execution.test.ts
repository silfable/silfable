import assert from "node:assert/strict";
import { test } from "node:test";

import type { Address, Hex } from "viem";

import type { KyberSwapQuoteService } from "../integrations/kyberswap.js";
import type { EmergencyStopService } from "../security/emergency-stop.js";
import type { MasterPasswordService } from "../security/master-password.js";
import { EvmSignerService } from "../wallet/evm-signer.js";
import { EVM_NATIVE_TOKEN_SENTINEL, KYBER_META_AGGREGATION_ROUTER } from "./kyber-router-policy.js";
import { EvmKyberExecutionService, type EvmExecutionReceipt } from "./evm-kyber-execution.js";
import { KyberSwapPreflightService } from "./kyberswap-preflight.js";

const WALLET = "0x1111111111111111111111111111111111111111" as Address;
const OUTPUT = "0x2222222222222222222222222222222222222222" as Address;
const HASH = `0x${"ab".repeat(32)}` as Hex;

test("generic EVM swap signs the exact preflight and broadcasts once", async () => {
  const preflights = new KyberSwapPreflightService();
  const engine = executionEngine("success");
  const evidence = await prepareNativeSwap(preflights, engine);
  const saved: EvmExecutionReceipt[] = [];
  const service = executionService(preflights, saved);
  const signer = new EvmSignerService(new Uint8Array(32).fill(7));

  const receipt = await service.execute({
    preflightId: evidence.id,
    chainKey: "base",
    walletAddress: WALLET,
    action: "swap",
    masterPassword: "correct password",
    confirmation: "EXECUTE EVM MAINNET SWAP",
    engine,
    withSigner: async (operation) => await operation(signer),
  });

  assert.equal(receipt.status, "confirmed");
  assert.equal(receipt.chainKey, "base");
  assert.equal(receipt.chainId, 8453);
  assert.equal(receipt.transactionHash, HASH);
  assert.equal(engine.broadcasts, 1);
  assert.deepEqual(saved.map((item) => item.status), ["unknown", "confirmed"]);
  await assert.rejects(
    service.execute({
      preflightId: evidence.id,
      chainKey: "base",
      walletAddress: WALLET,
      action: "swap",
      masterPassword: "correct password",
      confirmation: "EXECUTE EVM MAINNET SWAP",
      engine,
      withSigner: async (operation) => await operation(signer),
    }),
    /unavailable|consumed/u,
  );
  assert.equal(engine.broadcasts, 1);
});

test("unknown EVM broadcast status is persisted and never retried", async () => {
  const preflights = new KyberSwapPreflightService();
  const engine = executionEngine("timeout");
  const evidence = await prepareNativeSwap(preflights, engine);
  const saved: EvmExecutionReceipt[] = [];
  const service = executionService(preflights, saved);
  const signer = new EvmSignerService(new Uint8Array(32).fill(8));

  const receipt = await service.execute({
    preflightId: evidence.id,
    chainKey: "base",
    walletAddress: WALLET,
    action: "swap",
    masterPassword: "correct password",
    confirmation: "EXECUTE EVM MAINNET SWAP",
    engine,
    withSigner: async (operation) => await operation(signer),
  });

  assert.equal(receipt.status, "unknown");
  assert.equal(engine.broadcasts, 1);
  assert.deepEqual(saved.map((item) => item.status), ["unknown"]);
});

test("trusted Full Access execution uses the same one-attempt preflight path without a renderer password", async () => {
  const preflights = new KyberSwapPreflightService();
  const engine = executionEngine("success");
  const evidence = await prepareNativeSwap(preflights, engine);
  const saved: EvmExecutionReceipt[] = [];
  const service = executionService(preflights, saved);
  const signer = new EvmSignerService(new Uint8Array(32).fill(9));

  const receipt = await service.executeFullAccess({
    preflightId: evidence.id,
    chainKey: "base",
    walletAddress: WALLET,
    action: "swap",
    engine,
    withSigner: async (operation) => await operation(signer),
  });

  assert.equal(receipt.status, "confirmed");
  assert.equal(engine.broadcasts, 1);
  assert.deepEqual(saved.map((item) => item.status), ["unknown", "confirmed"]);
});

test("invalid password fails before consuming the preflight or reaching signer", async () => {
  const preflights = new KyberSwapPreflightService();
  const engine = executionEngine("success");
  const evidence = await prepareNativeSwap(preflights, engine);
  let signerReached = false;
  const service = new EvmKyberExecutionService(
    { verify: async () => false } as unknown as MasterPasswordService,
    { assertExecutionAllowed() {} } as unknown as EmergencyStopService,
    preflights,
    { async save() {} },
  );

  await assert.rejects(
    service.execute({
      preflightId: evidence.id,
      chainKey: "base",
      walletAddress: WALLET,
      action: "swap",
      masterPassword: "wrong password",
      confirmation: "EXECUTE EVM MAINNET SWAP",
      engine,
      withSigner: async () => {
        signerReached = true;
        throw new Error("signer must not be reached");
      },
    }),
    /password is incorrect/u,
  );
  assert.equal(signerReached, false);
  assert.equal(engine.broadcasts, 0);
  assert.equal(preflights.consume({
    id: evidence.id,
    chainKey: "base",
    walletAddress: WALLET,
    action: "swap",
  }).evidence.id, evidence.id);
});

async function prepareNativeSwap(
  preflights: KyberSwapPreflightService,
  engine: ReturnType<typeof executionEngine>,
) {
  const quotes = {
    async build() {
      return {
        provider: "kyberswap" as const,
        quoteId: crypto.randomUUID(),
        chainKey: "base" as const,
        chainId: 8453,
        sender: WALLET,
        recipient: WALLET,
        routerAddress: KYBER_META_AGGREGATION_ROUTER,
        tokenIn: EVM_NATIVE_TOKEN_SENTINEL,
        tokenOut: OUTPUT,
        calldata: "0x12345678" as Hex,
        valueWei: 1_000_000n,
        amountIn: "1000000",
        amountOut: "990000",
        minimumAmountOut: "985050",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
    },
  } as unknown as KyberSwapQuoteService;
  return await preflights.prepare({
    quotes,
    engine,
    quoteId: crypto.randomUUID(),
    wallet: WALLET,
    slippageBps: 50,
  });
}

function executionService(preflights: KyberSwapPreflightService, saved: EvmExecutionReceipt[]) {
  return new EvmKyberExecutionService(
    { verify: async (password: string) => password === "correct password" } as unknown as MasterPasswordService,
    { assertExecutionAllowed() {} } as unknown as EmergencyStopService,
    preflights,
    { async save(receipt) { saved.push(receipt); } },
  );
}

function executionEngine(receipt: "success" | "timeout") {
  return {
    broadcasts: 0,
    async assertExpectedChain() { return 8453; },
    async getBytecode() { return "0x01" as Hex; },
    async getErc20Allowance() { return 0n; },
    async getErc20Balance() { return 10_000_000n; },
    async simulateTransaction() {
      return { gasLimit: 21_000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n };
    },
    async getBalance() { return { wei: 10_000_000n, formatted: "0.00000000001" }; },
    async getPendingNonce() { return 7; },
    async sendRawTransaction() {
      this.broadcasts += 1;
      return HASH;
    },
    async waitForReceipt() {
      if (receipt === "timeout") throw new Error("RPC timeout after broadcast");
      return { status: "success" as const };
    },
  };
}
