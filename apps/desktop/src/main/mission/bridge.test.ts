// @ts-nocheck
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createKeyPairSignerFromPrivateKeyBytes,
  createTransactionMessage,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import {
  BRIDGE_BASE_CHAIN_ID,
  BRIDGE_BASE_USDC_ADDRESS,
  BRIDGE_ROBINHOOD_CHAIN_ID,
  BRIDGE_ROBINHOOD_USDG_ADDRESS,
  BRIDGE_SOLANA_CHAIN_ID,
  BRIDGE_SOLANA_USDC_MINT,
  BridgeQuoteEvidenceSchema,
  type BridgeContract,
  type TransactionSettings,
} from "@silfable/contracts";

import type { BridgeClientService, PreparedBridgeQuote } from "../integrations/bridge-client.js";
import type { MainnetReadService } from "../integrations/read-only.js";
import type { WalletOnboardingService } from "../wallet/onboarding.js";
import {
  BridgeMissionService,
  inspectBridgeTransaction,
  isControlledBridgeAcceptanceCandidate,
  mapBridgeProviderStatus,
} from "./bridge.js";
import type { TransactionSettingsService } from "./transaction-settings.js";

const SOURCE_WALLET = "SysvarRent111111111111111111111111111111111";
const DESTINATION_RECIPIENT = "0x1111111111111111111111111111111111111111";
const DLN_SOURCE = "src5qyZHqTqecJV4aY6Cb6zDZLMDzrDKKezs22MPHr4";
const ORDER_ID = `0x${"ab".repeat(32)}`;

test("bridge prepare binds a registered wallet, finalized balance, exact transaction, policy, and simulation", async () => {
  const source = contract();
  const transaction = unsignedTransaction(SOURCE_WALLET, DLN_SOURCE);
  const service = makeService({ source, transaction });

  const result = await service.prepare(source);

  assert.equal(result.proposal.status, "simulated");
  assert.equal(result.proposal.quote.contractId, source.id);
  assert.equal(result.preflight.orderId, ORDER_ID);
  assert.equal(result.preflight.transactionSigned, false);
  assert.equal(result.preflight.broadcastAttempted, false);
  assert.deepEqual(result.preflight.programIds, [DLN_SOURCE]);
  assert.equal(result.preflight.sourceNetworkFeeLamports, 5_000);
  assert.equal(result.preflight.sourceAccountFundingLamports, 2_039_280);
  assert.equal(service.hasLivePreparation(result.preflight.id, source.id), true);
});

test("bridge prepare blocks an unregistered source wallet before provider access", async () => {
  const source = contract();
  let providerCalled = false;
  const service = makeService({
    source,
    transaction: unsignedTransaction(SOURCE_WALLET, DLN_SOURCE),
    registered: false,
    onProvider: () => { providerCalled = true; },
  });
  await assert.rejects(() => service.prepare(source), /not registered/u);
  assert.equal(providerCalled, false);
});

test("bridge prepare blocks insufficient finalized USDC before provider access", async () => {
  const source = contract();
  let providerCalled = false;
  const service = makeService({
    source,
    transaction: unsignedTransaction(SOURCE_WALLET, DLN_SOURCE),
    sourceBalance: "999999",
    onProvider: () => { providerCalled = true; },
  });
  await assert.rejects(() => service.prepare(source), /USDC balance does not cover/u);
  assert.equal(providerCalled, false);
});

test("bridge prepare rejects a changed transaction digest", async () => {
  const source = contract();
  const transaction = unsignedTransaction(SOURCE_WALLET, DLN_SOURCE);
  const service = makeService({
    source,
    transaction,
    digest: `sha256:${"00".repeat(32)}`,
  });
  await assert.rejects(() => service.prepare(source), /no longer matches/u);
});

test("bridge prepare rejects denied programs and missing pinned DLN authority", () => {
  assert.throws(
    () => inspectBridgeTransaction(unsignedTransaction(SOURCE_WALLET, "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"), SOURCE_WALLET),
    /non-allowlisted program/u,
  );
  assert.throws(
    () => inspectBridgeTransaction(unsignedTransaction(SOURCE_WALLET, "11111111111111111111111111111111"), SOURCE_WALLET),
    /does not invoke the pinned/u,
  );
});

test("bridge prepare blocks failed simulation and excessive source network fee", async () => {
  const source = contract();
  const transaction = unsignedTransaction(SOURCE_WALLET, DLN_SOURCE);
  await assert.rejects(
    () => makeService({ source, transaction, simulationError: { InstructionError: [0, "Custom"] } }).prepare(source),
    /simulation failed/u,
  );
  await assert.rejects(
    () => makeService({ source, transaction, networkFeeLamports: 200_001 }).prepare(source),
    /exceeds the configured limit/u,
  );
});

test("bridge provider states map to explicit lifecycle states", () => {
  assert.equal(mapBridgeProviderStatus("None"), "broadcast-unknown");
  assert.equal(mapBridgeProviderStatus("Created"), "relay-pending");
  assert.equal(mapBridgeProviderStatus("Fulfilled"), "destination-confirmed");
  assert.equal(mapBridgeProviderStatus("SentUnlock"), "destination-confirmed");
  assert.equal(mapBridgeProviderStatus("RelaySuccess"), "destination-confirmed");
  assert.equal(mapBridgeProviderStatus("OrderCancelled"), "refundable");
  assert.equal(mapBridgeProviderStatus("SentOrderCancel"), "refund-pending");
  assert.equal(mapBridgeProviderStatus("ClaimedOrderCancel"), "refunded");
});

test("Relay fulfillment without a destination hash stays reconcilable instead of being marked stuck", async () => {
  const source = contract();
  const service = makeService({
    source,
    transaction: unsignedTransaction(SOURCE_WALLET, DLN_SOURCE),
    providerStatus: "RelaySuccess",
    destinationTransactionHash: null,
  });
  const prepared = await service.prepare(source);
  const now = new Date();
  const receipt = await service.reconcile({
    id: crypto.randomUUID(), contractId: source.id, preflightId: prepared.preflight.id, orderId: prepared.preflight.orderId,
    state: "source-submitted", provider: "relay", destinationChainId: source.destinationChainId, destinationAssetAddress: source.destinationAsset.address,
    sourceWallet: source.sourceWallet, destinationRecipient: source.destinationRecipient, amountIn: source.amountIn,
    minimumDestinationAmount: source.minimumDestinationAmount, expectedDestinationAmount: prepared.proposal.quote.estimatedDestinationAmount,
    transactionDigest: prepared.preflight.transactionDigest, sourceSignature: "1".repeat(64), sourceSlot: null,
    destinationTransactionHash: null, destinationBlockNumber: null, actualDestinationAmount: null, providerStatus: null,
    fee: prepared.proposal.quote.fee, actualSourceNetworkFeeLamports: null, sourceWalletPreLamports: null,
    sourceWalletPostLamports: null, actualSourceWalletOutflowLamports: null, sourceTokenPreRawAmount: null,
    sourceTokenPostRawAmount: null, actualSourceTokenDebited: null, transactionSigned: true, broadcastAttempted: true, sourceVerifiedAt: null, destinationVerifiedAt: null,
    timeoutAt: new Date(now.getTime() - 60_000).toISOString(), lastError: null, createdAt: now.toISOString(), updatedAt: now.toISOString(),
  });
  assert.equal(receipt.state, "relay-fulfilled-unverified");
  assert.match(receipt.lastError ?? "", /independent verification/u);
});

test("controlled bridge acceptance permits release-controlled bridge candidates", () => {
  const source = contract();
  const candidate = {
    ...source,
    provider: "debridge-dln" as const,
    maximumTotalFeeUsd: 5.0,
    minimumDestinationAmount: "100000",
  };
  assert.equal(isControlledBridgeAcceptanceCandidate(candidate, "debridge-dln", 2.6155), true);
  assert.equal(isControlledBridgeAcceptanceCandidate({ ...candidate, amountIn: "10000001" }, "debridge-dln", 2.6155), false);
  assert.equal(isControlledBridgeAcceptanceCandidate({ ...candidate, minimumDestinationAmount: "0" }, "debridge-dln", 2.6155), false);
  assert.equal(isControlledBridgeAcceptanceCandidate(candidate, "debridge-dln", 10.01), false);
});

test("bridge execution persists the local signature before exactly one broadcast and reconciles destination settlement", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1),
  );
  const source = contract(String(signer.address));
  const transaction = unsignedTransaction(String(signer.address), DLN_SOURCE);
  let sendCount = 0;
  let persistedBeforeSend = false;
  const destinationHash = `0x${"cd".repeat(32)}`;
  const service = makeService({
    source,
    transaction,
    signer,
    execution: true,
    destinationTransactionHash: destinationHash,
    onSend: (encoded) => {
      sendCount += 1;
      assert.equal(persistedBeforeSend, true);
      return getSignatureFromTransaction(
        getTransactionDecoder().decode(Buffer.from(encoded, "base64")),
      )!;
    },
  });
  const prepared = await service.prepare(source);
  const receipt = await service.execute(
    source.id,
    prepared.preflight.id,
    "correct password",
    async (signedReceipt) => {
      assert.equal(signedReceipt.state, "source-signed");
      assert.equal(signedReceipt.broadcastAttempted, false);
      persistedBeforeSend = true;
    },
  );
  assert.equal(sendCount, 1);
  assert.equal(receipt.broadcastAttempted, true);
  assert.equal(receipt.state, "destination-confirmed");
  assert.equal(receipt.providerStatus, "Fulfilled");
  assert.equal(receipt.destinationTransactionHash, destinationHash);
  assert.equal(receipt.actualSourceNetworkFeeLamports, 5_000);
  assert.equal(receipt.sourceWalletPreLamports, "100000000");
  assert.equal(receipt.sourceWalletPostLamports, "97955720");
  assert.equal(receipt.actualSourceWalletOutflowLamports, "2044280");
  assert.equal(receipt.sourceTokenPreRawAmount, "25000000");
  assert.equal(receipt.sourceTokenPostRawAmount, "15000000");
  assert.equal(receipt.actualSourceTokenDebited, "10000000");
});

test("bridge execution never broadcasts when signed-receipt persistence fails", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1),
  );
  const source = contract(String(signer.address));
  let sendCount = 0;
  const service = makeService({
    source,
    transaction: unsignedTransaction(String(signer.address), DLN_SOURCE),
    signer,
    execution: true,
    onSend: () => {
      sendCount += 1;
      return "1".repeat(64);
    },
  });
  const prepared = await service.prepare(source);
  await assert.rejects(
    () => service.execute(source.id, prepared.preflight.id, "correct password", async () => {
      throw new Error("disk unavailable");
    }),
    /disk unavailable/u,
  );
  assert.equal(sendCount, 0);
});

test("bridge execution records broadcast-unknown and never retries a transport failure", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1),
  );
  const source = contract(String(signer.address));
  let sendCount = 0;
  const service = makeService({
    source,
    transaction: unsignedTransaction(String(signer.address), DLN_SOURCE),
    signer,
    execution: true,
    verificationState: "not-found",
    onSend: () => {
      sendCount += 1;
      throw new Error("RPC timeout after request started");
    },
  });
  const prepared = await service.prepare(source);
  const receipt = await service.execute(
    source.id,
    prepared.preflight.id,
    "correct password",
    async () => {},
  );
  assert.equal(sendCount, 1);
  assert.equal(receipt.state, "broadcast-unknown");
  assert.equal(receipt.broadcastAttempted, true);
  assert.match(receipt.lastError ?? "", /Never rebroadcast/u);
});

function contract(sourceWallet = SOURCE_WALLET): BridgeContract {
  const createdAt = new Date();
  return {
    id: crypto.randomUUID(),
    provider: "debridge-dln",
    sourceChainId: BRIDGE_SOLANA_CHAIN_ID,
    destinationChainId: BRIDGE_BASE_CHAIN_ID,
    sourceAsset: { address: BRIDGE_SOLANA_USDC_MINT, symbol: "USDC", decimals: 6 },
    destinationAsset: { address: BRIDGE_BASE_USDC_ADDRESS, symbol: "USDC", decimals: 6 },
    sourceWallet,
    destinationRecipient: DESTINATION_RECIPIENT,
    amountIn: "1000000",
    minimumDestinationAmount: "980000",
    maximumTotalFeeUsd: 2,
    deadline: new Date(createdAt.getTime() + 15 * 60_000).toISOString(),
    timeoutSeconds: 3_600,
    refundPolicy: "provider-cancel-only",
    createdAt: createdAt.toISOString(),
  };
}

function makeService(input: {
  source: BridgeContract;
  transaction: string;
  registered?: boolean;
  sourceBalance?: string;
  digest?: `sha256:${string}`;
  simulationError?: unknown;
  networkFeeLamports?: number;
  onProvider?: () => void;
  signer?: Awaited<ReturnType<typeof createKeyPairSignerFromPrivateKeyBytes>>;
  execution?: boolean;
  onSend?: (encoded: string) => string;
  verificationState?: "finalized" | "confirmed" | "processed" | "not-found" | "failed";
  providerStatus?: "Created" | "Fulfilled" | "RelaySuccess";
  destinationTransactionHash?: string | null;
}): BridgeMissionService {
  const rawTransaction = Buffer.from(input.transaction, "base64");
  const prepared: PreparedBridgeQuote = {
    provider: "debridge-dln",
    contract: input.source,
    unsignedTransactionHex: rawTransaction.toString("hex"),
    evidence: BridgeQuoteEvidenceSchema.parse({
      contractId: input.source.id,
      provider: "debridge-dln",
      orderId: ORDER_ID,
      route: "deBridge DLN - Solana USDC to Base USDC",
      amountIn: input.source.amountIn,
      estimatedDestinationAmount: "990000",
      estimatedFulfillmentSeconds: 180,
      quoteCreatedAt: new Date().toISOString(),
      quoteExpiresAt: new Date(Date.now() + 20_000).toISOString(),
      transactionDigest: input.digest
        ?? `sha256:${createHash("sha256").update(rawTransaction).digest("hex")}`,
      fee: {
        sourceNetworkFeeLamports: "5000",
        sourceAccountFundingLamports: "2039280",
        protocolFeeSourceUnits: "4000",
        relayerFeeSourceUnits: "5000",
        destinationGasUsd: null,
        totalFeeUsd: 0.01,
      },
    }),
  };
  const client = {
    prepareQuote: async () => {
      input.onProvider?.();
      return prepared;
    },
    getOrderStatus: async () => ({
      orderId: ORDER_ID,
      providerStatus: input.providerStatus ?? (input.destinationTransactionHash === undefined ? "Created" : "Fulfilled"),
      destinationTransactionHash: input.destinationTransactionHash ?? null,
    }),
    verifyDestinationReceipt: async () => ({
      state: "confirmed" as const,
      blockNumber: 12_345,
      actualDestinationAmount: "990000",
    }),
  } satisfies Pick<BridgeClientService, "prepareQuote" | "getOrderStatus" | "verifyDestinationReceipt">;
  const reads = {
    portfolio: async () => ({
      address: input.source.sourceWallet,
      slot: 123,
      solBalance: "100000000",
      solUsdPrice: 150,
      totalUsd: 151,
      assets: [{
        mint: BRIDGE_SOLANA_USDC_MINT,
        amount: input.sourceBalance ?? "1000000",
        decimals: 6,
        uiAmount: "1",
        usdPrice: 1,
        usdValue: 1,
      }],
      verifiedAt: new Date().toISOString(),
    }),
    simulateUnsignedTransaction: async () => ({
      slot: 124,
      err: input.simulationError ?? null,
      logs: [],
      unitsConsumed: 125_000,
      feeLamports: input.networkFeeLamports ?? 5_000,
      accountCreationFundingLamports: 2_039_280,
      estimatedWalletOutflowLamports: "2044280",
    }),
    verifyTransactionSignature: async () => ({
      state: input.verificationState ?? "finalized",
      slot: 125,
      error: input.verificationState === "failed" ? "source transaction failed" : null,
      verifiedAt: new Date().toISOString(),
    }),
    transactionSettlement: async () => ({
      slot: 125,
      feeLamports: 5_000,
      walletPreLamports: "100000000",
      walletPostLamports: "97955720",
    }),
    tokenTransactionSettlement: async () => ({
      slot: 125,
      feeLamports: 5_000,
      walletPreLamports: "100000000",
      walletPostLamports: "97955720",
      tokenMint: BRIDGE_SOLANA_USDC_MINT,
      tokenPreRawAmount: "25000000",
      tokenPostRawAmount: "15000000",
      tokenRawDelta: "-10000000",
      accountCreationFundingLamports: 0,
    }),
  } satisfies Pick<MainnetReadService, "portfolio" | "simulateUnsignedTransaction" | "verifyTransactionSignature" | "transactionSettlement" | "tokenTransactionSettlement">;
  const wallets = {
    listWallets: async () => input.registered === false ? [] : [{
      address: input.source.sourceWallet,
      primary: true,
      createdAt: new Date().toISOString(),
    }],
    withWalletSigner: async <T>(_address: string, operation: (signer: NonNullable<typeof input.signer>) => Promise<T>) => {
      if (input.signer === undefined) throw new Error("signing is not expected in prepare-only tests");
      return operation(input.signer);
    },
  } as unknown as Pick<WalletOnboardingService, "listWallets" | "withWalletSigner">;
  const settings = {
    get: () => ({
      maxNetworkFeeLamports: 200_000,
      maxFeePercent: 5,
      defaultSlippageBps: 50,
      maxSlippageBps: 300,
      defaultDeadlineMinutes: 30,
      priority: "standard",
    } satisfies TransactionSettings),
  } satisfies Pick<TransactionSettingsService, "get">;
  return new BridgeMissionService(client, reads, wallets, settings, input.execution === true ? {
    passwords: { verify: async (password) => password === "correct password" },
    emergencyStop: { assertExecutionAllowed: () => {} },
    readiness: { gateFor: () => ({ require: () => {} }) as never },
    rpc: {
      sendTransaction: async (encoded) => input.onSend?.(encoded) ?? "1".repeat(64),
    },
  } : null);
}

function unsignedTransaction(walletValue: string, programValue: string): string {
  const wallet = address(walletValue);
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (value) => setTransactionMessageFeePayer(wallet, value),
    (value) => setTransactionMessageLifetimeUsingBlockhash({
      blockhash: blockhash("11111111111111111111111111111111"),
      lastValidBlockHeight: 1n,
    }, value),
    (value) => appendTransactionMessageInstruction({
      programAddress: address(programValue),
    }, value),
  );
  return Buffer.from(getTransactionEncoder().encode(compileTransaction(message))).toString("base64");
}
