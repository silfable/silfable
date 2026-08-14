// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import type { Address, Hex } from "viem";

import {
  BRIDGE_ROBINHOOD_CHAIN_ID,
  BRIDGE_ROBINHOOD_USDG_ADDRESS,
  BRIDGE_SOLANA_CHAIN_ID,
  BRIDGE_SOLANA_USDC_MINT,
  type EvmBridgeContract,
} from "@silfable/contracts";
import { RelayEvmBridgeService } from "./relay-evm-bridge.js";

const WALLET = "0x1111111111111111111111111111111111111111";
const ROUTER = "0x2222222222222222222222222222222222222222";
const REQUEST_ID = `0x${"ab".repeat(32)}`;
const NOW = new Date("2026-08-02T00:00:00.000Z");

test("prepares a separately reviewed ERC-20 approval for an EVM to Solana route", async () => {
  const service = new RelayEvmBridgeService(relayFetch([approvalStep(), depositStep()]), "https://relay.invalid");
  const result = await service.prepare(contractToSolana(), engine(), NOW);

  assert.equal(result.quote.action, "approval");
  assert.equal(result.preflight.transactionTarget.toLowerCase(), BRIDGE_ROBINHOOD_USDG_ADDRESS.toLowerCase());
  assert.equal(result.quote.estimatedDestinationAmount, "990000");
  assert.equal(result.quote.minimumDestinationAmount, "980000");
  assert.equal(result.quote.totalFeeUsd, 0.26);
  assert.equal(result.preflight.broadcastAttempted, false);
});

test("prepares the deposit step for the release-controlled Robinhood to Solana route when no approval is returned", async () => {
  const service = new RelayEvmBridgeService(relayFetch([depositStep()]), "https://relay.invalid");
  const result = await service.prepare(contractToSolana(), engine(), NOW);

  assert.equal(result.quote.action, "deposit");
  assert.equal(result.preflight.chainKey, "robinhood");
  assert.equal(result.preflight.transactionTarget.toLowerCase(), ROUTER.toLowerCase());
  assert.equal(result.preflight.maximumNetworkFeeWei, "42000");
});

test("rejects an output below the typed minimum before retaining a preflight", async () => {
  const service = new RelayEvmBridgeService(relayFetch([depositStep()], "400000"), "https://relay.invalid");
  await assert.rejects(
    service.prepare(contractToSolana({ minimumDestinationAmount: "900000" }), engine(), NOW),
    /output is below the contract minimum/u,
  );
});

test("rejects a provider fee above the user contract cap", async () => {
  const service = new RelayEvmBridgeService(relayFetch([depositStep()], "990000", "5.00"), "https://relay.invalid");
  await assert.rejects(
    service.prepare(contractToSolana({ maximumTotalFeeUsd: 1 }), engine(), NOW),
    /provider fee exceeds/u,
  );
});

test("rejects approval calldata with an unreviewed spender or unlimited amount", async () => {
  const wrongSpender = approvalStep({ spender: "0x3333333333333333333333333333333333333333" });
  await assert.rejects(
    new RelayEvmBridgeService(relayFetch([wrongSpender, depositStep()]), "https://relay.invalid")
      .prepare(contractToSolana(), engine(), NOW),
    /spender does not match/u,
  );

  const unlimited = approvalStep({ amount: (2n ** 256n) - 1n });
  await assert.rejects(
    new RelayEvmBridgeService(relayFetch([unlimited, depositStep()]), "https://relay.invalid")
      .prepare(contractToSolana(), engine(), NOW),
    /amount exceeds/u,
  );
});

test("prefers Relay total impact and does not double-count compatibility fee aliases", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({
    steps: [depositStep()],
    fees: {
      gas: { amountUsd: "0.01" }, relayerGas: { amountUsd: "0.01" },
      relayer: { amountUsd: "0.25" }, relayerService: { amountUsd: "0.25" },
    },
    details: {
      totalImpact: { usd: "0.26" },
      currencyOut: { amount: "990000", minimumAmount: "980000" },
      timeEstimate: 30,
    },
  }), { status: 200 })) as typeof fetch;
  const result = await new RelayEvmBridgeService(fetchImpl, "https://relay.invalid")
    .prepare(contractToSolana(), engine(), NOW);

  assert.equal(result.quote.totalFeeUsd, 0.26);
});

function contractToSolana(overrides: Partial<EvmBridgeContract> = {}): EvmBridgeContract {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    provider: "relay",
    sourceChainId: BRIDGE_ROBINHOOD_CHAIN_ID,
    sourceChainKey: "robinhood",
    sourceAssetAddress: BRIDGE_ROBINHOOD_USDG_ADDRESS,
    sourceAssetSymbol: "USDG",
    sourceAssetDecimals: 6,
    sourceWallet: WALLET,
    destination: {
      kind: "solana",
      chainId: BRIDGE_SOLANA_CHAIN_ID,
      chainKey: "solana",
      assetAddress: BRIDGE_SOLANA_USDC_MINT,
      assetSymbol: "USDC",
      assetDecimals: 6,
      recipient: "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg",
    },
    amountIn: "1000000",
    minimumDestinationAmount: "950000",
    maximumNetworkFeeWei: "1000000",
    maximumTotalFeeUsd: 1,
    slippageBps: 50,
    deadline: "2026-08-02T00:20:00.000Z",
    timeoutSeconds: 3600,
    refundPolicy: "relay-origin-refund",
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

function relayFetch(steps: unknown[], destinationAmount = "990000", fee = "0.25"): typeof fetch {
  return (async () => new Response(JSON.stringify({
    steps,
    fees: { relayer: { amountUsd: fee }, gas: { amountUsd: "0.01" } },
    details: {
      currencyOut: { amount: destinationAmount, minimumAmount: "980000" },
      timeEstimate: 30,
    },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
}

function approvalStep(overrides: { spender?: string; amount?: bigint } = {}) {
  const spenderWord = (overrides.spender ?? ROUTER).slice(2).padStart(64, "0");
  const amountWord = (overrides.amount ?? 1_000_000n).toString(16).padStart(64, "0");
  return {
    id: "approve",
    requestId: REQUEST_ID,
    action: "allowance",
    items: [{ kind: "transaction", label: "Approve USDC", data: {
      chainId: BRIDGE_ROBINHOOD_CHAIN_ID,
      to: BRIDGE_ROBINHOOD_USDG_ADDRESS,
      data: `0x095ea7b3${spenderWord}${amountWord}`,
      value: "0",
    } }],
  };
}

function depositStep() {
  return {
    id: "deposit",
    requestId: REQUEST_ID,
    action: "deposit",
    items: [{ kind: "transaction", label: "Bridge deposit", data: {
      chainId: BRIDGE_ROBINHOOD_CHAIN_ID,
      to: ROUTER,
      data: "0x1234",
      value: "0",
    } }],
  };
}

function engine() {
  return {
    async assertExpectedChain() { return BRIDGE_ROBINHOOD_CHAIN_ID; },
    async getBalance() { return { wei: 10_000_000n }; },
    async getErc20Balance(_token: Address, _owner: Address) { return 10_000_000n; },
    async getBytecode() { return "0x01" as Hex; },
    async simulateTransaction() {
      return { gasLimit: 21_000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n };
    },
  };
}
