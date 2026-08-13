import assert from "node:assert/strict";
import test from "node:test";

import { address, appendTransactionMessageInstruction, blockhash, compileTransaction, createKeyPairSignerFromPrivateKeyBytes, createTransactionMessage, getTransactionDecoder, getTransactionEncoder, pipe, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash } from "@solana/kit";
import type { LimitOrderContractPreview } from "@silfable/contracts";

import type { MainnetReadService } from "../integrations/read-only.js";
import type { JupiterTriggerV2Client } from "../integrations/trigger-v2.js";
import type { WalletOnboardingService } from "../wallet/onboarding.js";
import { LimitOrderService } from "./limit-order.js";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("limit-order deposit is simulated unsigned and the exact cached transaction is signed once", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
  const transaction = unsignedTransaction(signer.address, "11111111111111111111111111111111");
  const preview = previewFor(signer.address);
  let signed = false;
  const reads = {
    portfolio: async () => ({ address: signer.address, slot: 1, solBalance: "1", solUsdPrice: 150, totalUsd: 150, assets: [], verifiedAt: new Date().toISOString() }),
    prices: async () => new Map([[SOL, { usdPrice: 150, createdAt: null, blockId: 1 }]]),
    simulateUnsignedTransaction: async () => ({ slot: 2, err: null, logs: [], unitsConsumed: 400, feeLamports: 5000 }),
    verifyTransactionSignature: async () => ({ state: "finalized" as const, slot: 9, error: null, verifiedAt: new Date().toISOString() }),
  } as unknown as MainnetReadService;
  const wallets = { withWalletSigner: async <T>(_address: string, operation: (value: typeof signer) => Promise<T>) => operation(signer) } as unknown as WalletOnboardingService;
  const trigger = {
    getOrRegisterVault: async () => ({ userPubkey: signer.address, vaultPubkey: SOL, privyVaultId: "vault-id" }),
    craftSingleDeposit: async () => ({ transaction, requestId: "deposit-request", receiverAddress: SOL, mint: SOL, amount: "100000000", tokenDecimals: 9, inputTokenAccount: USDC }),
    createSingleOrder: async (input: { depositSignedTx: string }) => { signed = getTransactionDecoder().decode(Buffer.from(input.depositSignedTx, "base64")).signatures[signer.address] !== null; return { id: "order-123456", txSignature: "1".repeat(64), depositConfirmed: true }; },
  } as unknown as JupiterTriggerV2Client;
  const service = new LimitOrderService({ reads, wallets, trigger });
  const simulation = await service.simulate(preview);
  assert.equal(simulation.status, "passed"); assert.equal(simulation.transactionSigned, false); assert.equal(simulation.broadcastAttempted, false);
  const receipt = await service.execute(preview, simulation.id);
  assert.equal(receipt.status, "active"); assert.equal(receipt.chainVerification, "finalized"); assert.equal(signed, true);
  await assert.rejects(() => service.execute(preview, simulation.id), /expired/u);
});

test("limit-order simulation blocks a deposit whose receiver is not the authenticated vault", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
  const reads = { portfolio: async () => ({ address: signer.address, slot: 1, solBalance: "1", solUsdPrice: 150, totalUsd: 150, assets: [], verifiedAt: new Date().toISOString() }), prices: async () => new Map([[SOL, { usdPrice: 150, createdAt: null, blockId: 1 }]]) } as unknown as MainnetReadService;
  const trigger = { getOrRegisterVault: async () => ({ userPubkey: signer.address, vaultPubkey: SOL, privyVaultId: "vault-id" }), craftSingleDeposit: async () => ({ transaction: "unused", requestId: "deposit-request", receiverAddress: USDC, mint: SOL, amount: "100000000", tokenDecimals: 9, inputTokenAccount: USDC }) } as unknown as JupiterTriggerV2Client;
  const service = new LimitOrderService({ reads, wallets: {} as WalletOnboardingService, trigger });
  const simulation = await service.simulate(previewFor(signer.address));
  assert.equal(simulation.status, "blocked"); assert.match(simulation.error ?? "", /not bound/u);
});

test("limit-order verifyExecutionReceipt updates status based on signature verification", async () => {
  const goodSig = "1".repeat(64);
  const badSig = "2".repeat(64);
  const reads = {
    verifyTransactionSignature: async (sig: string) => ({
      state: sig === goodSig ? ("finalized" as const) : ("failed" as const),
      slot: 100,
      error: sig === goodSig ? null : "Transaction failed on chain",
      verifiedAt: "2026-07-24T12:00:00.000Z",
    }),
  } as unknown as MainnetReadService;
  const service = new LimitOrderService({ reads, wallets: {} as WalletOnboardingService, trigger: {} as JupiterTriggerV2Client });
  const pendingReceipt = {
    id: "00000000-0000-4000-8000-000000000001", previewId: "00000000-0000-4000-8000-000000000002", simulationId: "00000000-0000-4000-8000-000000000003",
    orderId: "order-123456", status: "unknown" as const, depositSignature: goodSig, vaultAddress: SOL, explorerUrl: `https://explorer.solana.com/tx/${goodSig}`,
    depositConfirmed: false, chainVerification: "unavailable" as const, chainSlot: null, error: "Pending", verifiedAt: null, createdAt: "2026-07-24T10:00:00.000Z",
  };
  const verified = await service.verifyExecutionReceipt(pendingReceipt);
  assert.equal(verified.status, "active");
  assert.equal(verified.depositConfirmed, true);
  assert.equal(verified.chainSlot, 100);

  const failedReceipt = await service.verifyExecutionReceipt({ ...pendingReceipt, depositSignature: badSig });
  assert.equal(failedReceipt.status, "failed");
  assert.equal(failedReceipt.depositConfirmed, false);
});

test("limit-order verifyCancelReceipt updates status based on signature verification", async () => {
  const goodSig = "1".repeat(64);
  const badSig = "2".repeat(64);
  const reads = {
    verifyTransactionSignature: async (sig: string) => ({
      state: sig === goodSig ? ("finalized" as const) : ("failed" as const),
      slot: 105,
      error: sig === goodSig ? null : "Withdrawal failed on chain",
      verifiedAt: "2026-07-24T12:05:00.000Z",
    }),
  } as unknown as MainnetReadService;
  const service = new LimitOrderService({ reads, wallets: {} as WalletOnboardingService, trigger: {} as JupiterTriggerV2Client });
  const pendingCancel = {
    id: "00000000-0000-4000-8000-000000000010", orderId: "order-123456", simulationId: "00000000-0000-4000-8000-000000000011",
    status: "unknown" as const, withdrawalSignature: goodSig, explorerUrl: `https://explorer.solana.com/tx/${goodSig}`,
    chainVerification: "unavailable" as const, chainSlot: null, error: "Pending", verifiedAt: null, createdAt: "2026-07-24T10:00:00.000Z",
  };
  const verified = await service.verifyCancelReceipt(pendingCancel);
  assert.equal(verified.status, "cancelled");
  assert.equal(verified.chainSlot, 105);

  const failedCancel = await service.verifyCancelReceipt({ ...pendingCancel, withdrawalSignature: badSig });
  assert.equal(failedCancel.status, "failed");
});

test("limit-order receipt verification fails safely without calling a write client", async () => {
  let writeClientAccesses = 0;
  const reads = {
    verifyTransactionSignature: async () => {
      throw new Error("RPC verification timed out");
    },
  } as unknown as MainnetReadService;
  const trigger = new Proxy(
    {},
    {
      get() {
        writeClientAccesses += 1;
        throw new Error("Verification must not access the Jupiter write client");
      },
    },
  ) as JupiterTriggerV2Client;
  const service = new LimitOrderService({
    reads,
    wallets: {} as WalletOnboardingService,
    trigger,
  });
  const execution = await service.verifyExecutionReceipt({
    id: "00000000-0000-4000-8000-000000000030",
    previewId: "00000000-0000-4000-8000-000000000031",
    simulationId: "00000000-0000-4000-8000-000000000032",
    orderId: "order-123456",
    status: "unknown",
    depositSignature: "3".repeat(64),
    vaultAddress: SOL,
    explorerUrl: `https://explorer.solana.com/tx/${"3".repeat(64)}`,
    depositConfirmed: false,
    chainVerification: "unavailable",
    chainSlot: null,
    error: "Pending",
    verifiedAt: null,
    createdAt: "2026-07-24T10:00:00.000Z",
  });
  const cancellation = await service.verifyCancelReceipt({
    id: "00000000-0000-4000-8000-000000000033",
    orderId: "order-123456",
    simulationId: "00000000-0000-4000-8000-000000000034",
    status: "unknown",
    withdrawalSignature: "4".repeat(64),
    explorerUrl: `https://explorer.solana.com/tx/${"4".repeat(64)}`,
    chainVerification: "unavailable",
    chainSlot: null,
    error: "Pending",
    verifiedAt: null,
    createdAt: "2026-07-24T10:00:00.000Z",
  });

  assert.equal(execution.status, "unknown");
  assert.match(execution.error ?? "", /timed out/u);
  assert.equal(cancellation.status, "unknown");
  assert.match(cancellation.error ?? "", /timed out/u);
  assert.equal(writeClientAccesses, 0);
});

test("limit-order simulation handles USDC to SOL swap preview", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
  const transaction = unsignedTransaction(signer.address, "11111111111111111111111111111111");
  const preview: LimitOrderContractPreview = {
    ...previewFor(signer.address),
    inputMint: USDC,
    outputMint: SOL,
    triggerMint: SOL,
    goal: "Buy SOL when price drops below $140",
  };
  const reads = {
    portfolio: async () => ({ address: signer.address, slot: 1, solBalance: "1", solUsdPrice: 150, totalUsd: 250, assets: [{ mint: USDC, symbol: "USDC", amount: "1000000000", balance: "1000", decimals: 6, usdPrice: 1, usdValue: 1000, logoUri: null }], verifiedAt: new Date().toISOString() }),
    prices: async () => new Map([[USDC, { usdPrice: 1, createdAt: null, blockId: 1 }], [SOL, { usdPrice: 150, createdAt: null, blockId: 1 }]]),
    simulateUnsignedTransaction: async () => ({ slot: 2, err: null, logs: [], unitsConsumed: 400, feeLamports: 5000 }),
  } as unknown as MainnetReadService;
  const trigger = {
    getOrRegisterVault: async () => ({ userPubkey: signer.address, vaultPubkey: SOL, privyVaultId: "vault-id" }),
    craftSingleDeposit: async () => ({ transaction, requestId: "deposit-usdc-req", receiverAddress: SOL, mint: USDC, amount: "100000000", tokenDecimals: 6, inputTokenAccount: USDC }),
  } as unknown as JupiterTriggerV2Client;
  const service = new LimitOrderService({ reads, wallets: {} as WalletOnboardingService, trigger });
  const simulation = await service.simulate(preview);
  assert.equal(simulation.status, "passed");
  assert.equal(simulation.transactionSigned, false);
});

function previewFor(walletAddress: string): LimitOrderContractPreview { return { id: "00000000-0000-4000-8000-000000000020", status: "ready-for-review", goal: "Sell 0.1 SOL above $200", walletAddress, inputMint: SOL, outputMint: USDC, inputAmount: "100000000", triggerMint: SOL, triggerCondition: "above", triggerPriceUsd: 200, maxSlippageBps: 100, expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), estimatedInputValueUsd: 15, checks: [{ code: "minimum_order_value", status: "pass", message: "Minimum met" }], executionAllowed: false, lifecycle: "preview-only", createdAt: new Date().toISOString() }; }
function unsignedTransaction(walletValue: string, program: string): string { const wallet = address(walletValue); const message = pipe(createTransactionMessage({ version: 0 }), (value) => setTransactionMessageFeePayer(wallet, value), (value) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: blockhash("11111111111111111111111111111111"), lastValidBlockHeight: 1n }, value), (value) => appendTransactionMessageInstruction({ programAddress: address(program) }, value)); return Buffer.from(getTransactionEncoder().encode(compileTransaction(message))).toString("base64"); }
