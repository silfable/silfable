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
  type EvmBridgeReceipt,
} from "@silfable/contracts";
import { RelayEvmBridgeService } from "../integrations/relay-evm-bridge.js";
import type { EmergencyStopService } from "../security/emergency-stop.js";
import type { MasterPasswordService } from "../security/master-password.js";
import { EvmSignerService } from "../wallet/evm-signer.js";
import { EvmBridgeExecutionService, EvmBridgeReconciliationService } from "./evm-bridge-execution.js";

const WALLET = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN = BRIDGE_ROBINHOOD_USDG_ADDRESS as Address;
const ROUTER = "0x2222222222222222222222222222222222222222" as Address;
const HASH = `0x${"cd".repeat(32)}` as Hex;
const DESTINATION_HASH = `0x${"ef".repeat(32)}`;
const REQUEST_ID = `0x${"ab".repeat(32)}`;
const NOW = new Date();

test("executes one reviewed EVM bridge deposit and persists before confirmation", async () => {
  const relay = relayService();
  const engine = bridgeEngine("success");
  const prepared = await relay.prepare(contract(), engine, NOW);
  const receipts = receiptStore();
  const service = executionService(relay, receipts);
  const signer = new EvmSignerService(new Uint8Array(32).fill(9));

  const receipt = await service.execute({
    preflightId: prepared.preflight.id,
    action: "deposit",
    masterPassword: "correct password",
    confirmation: "EXECUTE EVM BRIDGE MAINNET",
    engine,
    withSigner: async (operation) => await operation(signer),
  });

  assert.equal(receipt.status, "source-confirmed");
  assert.equal(receipt.sourceChainKey, "robinhood");
  assert.equal(receipt.destinationChainKey, "solana");
  assert.equal(engine.broadcasts, 1);
  assert.deepEqual(receipts.saved.map((item) => item.status), ["source-unknown", "source-confirmed"]);
  await assert.rejects(service.execute({
    preflightId: prepared.preflight.id,
    action: "deposit",
    masterPassword: "correct password",
    confirmation: "EXECUTE EVM BRIDGE MAINNET",
    engine,
    withSigner: async (operation) => await operation(signer),
  }), /unavailable/u);
  assert.equal(engine.broadcasts, 1);
});

test("rejects an incorrect confirmation before consuming or broadcasting", async () => {
  const relay = relayService();
  const engine = bridgeEngine("success");
  const prepared = await relay.prepare(contract(), engine, NOW);
  const receipts = receiptStore();
  const service = executionService(relay, receipts);

  await assert.rejects(service.execute({
    preflightId: prepared.preflight.id,
    action: "deposit",
    masterPassword: "correct password",
    confirmation: "APPROVE BRIDGE TOKEN",
    engine,
    withSigner: async () => { throw new Error("signer must not be reached"); },
  }), /confirmation is required/u);
  assert.equal(engine.broadcasts, 0);
  assert.equal(relay.peek(prepared.preflight.id)?.evidence.id, prepared.preflight.id);
});

test("does not accept Relay success until destination settlement is independently verified", async () => {
  const receipts = receiptStore();
  const pending = sampleReceipt();
  await receipts.save(pending);
  const reconciliation = new EvmBridgeReconciliationService(
    receipts,
    (async () => new Response(JSON.stringify({ status: "success", txHashes: [DESTINATION_HASH] }), { status: 200 })) as typeof fetch,
    "https://relay.invalid",
  );

  await assert.rejects(reconciliation.reconcile({
    receiptId: pending.id,
    sourceEngine: { async getReceiptStatus() { return "success"; } },
    verifyDestination: async () => false,
  }), /independent destination settlement verification/u);
  assert.equal((await receipts.get(pending.id))?.status, "source-confirmed");

  const confirmed = await reconciliation.reconcile({
    receiptId: pending.id,
    sourceEngine: { async getReceiptStatus() { return "success"; } },
    verifyDestination: async ({ transactionHash }) => transactionHash === DESTINATION_HASH,
  });
  assert.equal(confirmed.status, "destination-confirmed");
  assert.equal(confirmed.destinationTransactionHash, DESTINATION_HASH);
});

test("checks every Relay hash and persists only independently verified destination evidence", async () => {
  const receipts = receiptStore();
  const pending = sampleReceipt();
  const unrelatedHash = `0x${"12".repeat(32)}`;
  await receipts.save(pending);
  const reconciliation = new EvmBridgeReconciliationService(
    receipts,
    (async () => new Response(JSON.stringify({
      status: "success",
      txHashes: [DESTINATION_HASH, HASH, unrelatedHash],
    }), { status: 200 })) as typeof fetch,
    "https://relay.invalid",
  );
  const attempted: string[] = [];

  const confirmed = await reconciliation.reconcile({
    receiptId: pending.id,
    sourceEngine: { async getReceiptStatus() { return "success"; } },
    verifyDestination: async ({ transactionHash }) => {
      attempted.push(transactionHash);
      if (transactionHash === unrelatedHash) throw new Error("wrong destination chain");
      return transactionHash === DESTINATION_HASH;
    },
  });

  assert.deepEqual(attempted, [unrelatedHash, HASH, DESTINATION_HASH]);
  assert.equal(confirmed.destinationTransactionHash, DESTINATION_HASH);
  assert.equal(confirmed.status, "destination-confirmed");
});

function executionService(relay: RelayEvmBridgeService, receipts: ReturnType<typeof receiptStore>) {
  return new EvmBridgeExecutionService(
    { verify: async (password: string) => password === "correct password" } as unknown as MasterPasswordService,
    { assertExecutionAllowed() {} } as unknown as EmergencyStopService,
    relay,
    receipts,
  );
}

function relayService() {
  return new RelayEvmBridgeService((async () => new Response(JSON.stringify({
    steps: [{ id: "deposit", requestId: REQUEST_ID, action: "deposit", items: [{
      kind: "transaction", label: "Bridge deposit", data: {
        chainId: BRIDGE_ROBINHOOD_CHAIN_ID, to: ROUTER, data: "0x1234", value: "0",
      },
    }] }],
    fees: { relayer: { amountUsd: "0.25" }, gas: { amountUsd: "0.01" } },
    details: { currencyOut: { amount: "990000", minimumAmount: "980000" }, timeEstimate: 30 },
  }), { status: 200 })) as typeof fetch, "https://relay.invalid");
}

function contract(): EvmBridgeContract {
  return {
    id: "11111111-1111-4111-8111-111111111111", provider: "relay",
    sourceChainId: BRIDGE_ROBINHOOD_CHAIN_ID, sourceChainKey: "robinhood",
    sourceAssetAddress: BRIDGE_ROBINHOOD_USDG_ADDRESS, sourceAssetSymbol: "USDG", sourceAssetDecimals: 18,
    sourceWallet: WALLET,
    destination: {
      kind: "solana", chainId: BRIDGE_SOLANA_CHAIN_ID, chainKey: "solana",
      assetAddress: BRIDGE_SOLANA_USDC_MINT, assetSymbol: "USDC", assetDecimals: 6,
      recipient: "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg",
    },
    amountIn: "1000000", minimumDestinationAmount: "950000",
    maximumNetworkFeeWei: "1000000", maximumTotalFeeUsd: 1, slippageBps: 50,
    deadline: new Date(NOW.getTime() + 20 * 60_000).toISOString(), timeoutSeconds: 3600,
    refundPolicy: "relay-origin-refund", createdAt: NOW.toISOString(),
  };
}

function bridgeEngine(result: "success" | "timeout") {
  return {
    broadcasts: 0,
    async assertExpectedChain() { return BRIDGE_ROBINHOOD_CHAIN_ID; },
    async getBalance() { return { wei: 10_000_000n }; },
    async getErc20Balance(_token: Address, _owner: Address) { return 10_000_000n; },
    async getBytecode() { return "0x01" as Hex; },
    async simulateTransaction() { return { gasLimit: 21_000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n }; },
    async getPendingNonce() { return 3; },
    async sendRawTransaction() { this.broadcasts += 1; return HASH; },
    async waitForReceipt() {
      if (result === "timeout") throw new Error("timeout");
      return { status: "success" as const };
    },
    async getReceiptStatus() { return "success" as const; },
  };
}

function receiptStore() {
  const records = new Map<string, EvmBridgeReceipt>();
  const saved: EvmBridgeReceipt[] = [];
  return {
    saved,
    async save(receipt: EvmBridgeReceipt) { records.set(receipt.id, receipt); saved.push(receipt); },
    async get(id: string) { return records.get(id) ?? null; },
  };
}

function sampleReceipt(): EvmBridgeReceipt {
  const now = new Date().toISOString();
  return {
    id: "22222222-2222-4222-8222-222222222222", contractId: contract().id,
    quoteId: "33333333-3333-4333-8333-333333333333", preflightId: "44444444-4444-4444-8444-444444444444",
    requestId: REQUEST_ID, provider: "relay", action: "deposit",
    sourceChainKey: "robinhood", sourceChainId: BRIDGE_ROBINHOOD_CHAIN_ID,
    sourceAssetAddress: TOKEN, sourceAssetSymbol: "USDG",
    destinationChainId: BRIDGE_SOLANA_CHAIN_ID, destinationChainKey: "solana",
    destinationAssetAddress: BRIDGE_SOLANA_USDC_MINT, destinationAssetSymbol: "USDC",
    sourceWallet: WALLET, destinationRecipient: contract().destination.recipient,
    amountIn: "1000000", expectedDestinationAmount: "990000", minimumDestinationAmount: "950000",
    sourceTransactionHash: HASH, destinationTransactionHash: null, status: "source-confirmed",
    networkFeeWei: "42000", broadcastAt: now, reconciledAt: now,
  };
}
