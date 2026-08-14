import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Keypair, VersionedTransaction } from "@solana/web3.js";

import type { PumpTradeContractPreview } from "@silfable/contracts";

import { RuntimeDatabase } from "../storage/database.js";
import { evaluatePumpTradeEligibility } from "./eligibility.js";
import { evaluatePumpExecutionReadiness } from "./execution-readiness.js";
import { PUMP_PROGRAM_ID } from "./inspector.js";
import { evaluatePumpFinalRevalidation, PumpPreparedExecutionService } from "./prepared-execution.js";
import {
  buildAndSimulatePumpV2ProductionTransactionFromEvidence,
  buildPumpV2ProductionUnsignedTransactionFromEvidence,
} from "./production.js";
import { EncryptedPumpReceiptService } from "./receipt-store.js";
import { PumpReceiptReconciliationService } from "./receipt-reconciliation.js";
import { PumpRiskLedgerService } from "./risk-ledger.js";
import { DEFAULT_PUMP_RISK_SETTINGS, assertPumpProposalWithinRisk } from "./risk-settings.js";
import { PumpMainnetRpc } from "./rpc.js";
import { broadcastPumpTransaction, signPumpVersionedTransaction, verifyDigestMatchesTransaction } from "./signer.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";

class MemorySecrets {
  value: string | null = null;
  async getSecret() { return this.value; }
  async setSecret(_name: string, value: string) { this.value = value; }
}

const WALLET_KEYPAIR = Keypair.generate();
const WALLET_ADDRESS = WALLET_KEYPAIR.publicKey.toBase58();
const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const BLOCKHASH = "8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";

test("Minimum-value Mainnet Buy Validation Matrix: 1,000 lamport buy proposal", async () => {
  const minBuyInput = {
    side: "buy" as const,
    walletAddress: WALLET_ADDRESS,
    tokenMint: MINT,
    inputAmount: "1000",
    minimumOutputAmount: "100",
    maxTotalFeeBps: 500,
  };

  const buildResult = await buildPumpV2ProductionUnsignedTransactionFromEvidence(
    blockhashReader(501),
    minBuyInput,
    mockEvidence()
  );

  assert.equal(buildResult.codec, "silfable-pump-v2");
  assert.equal(buildResult.feePreview.allowed, true);
  assert.equal(buildResult.unsignedTransaction.signed, false);
  assert.equal(buildResult.unsignedTransaction.inspection.allowed, true);

  const tx = VersionedTransaction.deserialize(buildResult.unsignedTransaction.serialized);
  const bytesCount = buildResult.unsignedTransaction.inspection.serializedBytes;
  assert.ok(bytesCount > 0);

  const signedTx = signPumpVersionedTransaction(tx, WALLET_KEYPAIR);
  assert.equal(signedTx.signatures[0]?.some((b) => b !== 0), true);
});

test("Minimum-value Mainnet Sell Validation Matrix: 1 raw token unit sell proposal", async () => {
  const minSellInput = {
    side: "sell" as const,
    walletAddress: WALLET_ADDRESS,
    tokenMint: MINT,
    inputAmount: "1",
    minimumOutputAmount: "1",
    maxTotalFeeBps: 500,
  };

  const buildResult = await buildPumpV2ProductionUnsignedTransactionFromEvidence(
    blockhashReader(501),
    minSellInput,
    mockEvidence()
  );

  assert.equal(buildResult.codec, "silfable-pump-v2");
  assert.equal(buildResult.feePreview.allowed, true);
  assert.equal(buildResult.unsignedTransaction.signed, false);

  const tx = VersionedTransaction.deserialize(buildResult.unsignedTransaction.serialized);
  const signedTx = signPumpVersionedTransaction(tx, WALLET_KEYPAIR);
  assert.equal(signedTx.signatures[0]?.some((b) => b !== 0), true);
});

test("Full End-to-End Restricted Execution Pipeline Validation Matrix", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-mainnet-matrix-"));
  const dbPath = join(directory, "runtime.sqlite3");
  const secrets = new MemorySecrets();
  let database: RuntimeDatabase | null = null;

  try {
    database = await RuntimeDatabase.open(dbPath);
    const riskLedger = new PumpRiskLedgerService(database, secrets);
    const receiptStore = new EncryptedPumpReceiptService(database, secrets);
    const preparedService = new PumpPreparedExecutionService();

    const preview = mockPreview("buy", WALLET_ADDRESS, MINT);
    const buildInput = {
      side: "buy" as const,
      walletAddress: WALLET_ADDRESS,
      tokenMint: MINT,
      inputAmount: "1000000",
      minimumOutputAmount: "100",
      maxTotalFeeBps: 500,
      maxSlippageBps: 300,
      maxNetworkFeeLamports: 50000,
      maxFeePercent: 10,
    };

    const mockRpc = {
      ...blockhashReader(501),
      async getMultipleAccountsInfoAndContext(addrs: string[]) {
        return { context: { slot: 501 }, value: addrs.map(() => null) };
      },
      async getFeeForMessage() {
        return { context: { slot: 501 }, value: 5000 };
      },
      async simulateTransaction(_tx: string, config: { accounts?: { addresses?: string[] } }) {
        const addresses = config?.accounts?.addresses ?? [];
        return {
          context: { slot: 501 },
          value: {
            err: null,
            logs: [
              `Program ${PUMP_PROGRAM_ID} invoke [1]`,
              `Program ${PUMP_PROGRAM_ID} success`,
            ],
            unitsConsumed: 25000,
            innerInstructions: [],
            accounts: addresses.map(() => null),
          },
        };
      },
    };

    const build = await buildAndSimulatePumpV2ProductionTransactionFromEvidence(
      mockRpc,
      buildInput,
      mockEvidence()
    );

    const riskEvidence = assertPumpProposalWithinRisk({
      side: "buy",
      inputAmount: "1000000",
      maxSlippageBps: 300,
      walletSolLamports: "100000000",
      maxNetworkFeeLamports: 50000,
      settings: DEFAULT_PUMP_RISK_SETTINGS,
      usage: await riskLedger.usageFor(MINT),
    });

    const TEST_NOW = new Date("2026-07-22T00:00:10.000Z");

    const eligibilityEvidence = evaluatePumpTradeEligibility({
      side: "buy",
      tokenMint: MINT,
      inputAmount: "1000000",
      state: build.stateEvidence,
      fee: build.feePreview,
      quote: build.executableQuote,
      risk: riskEvidence,
      simulation: build.simulation,
      now: TEST_NOW,
    });

    const simulationEvidence = {
      ...build.simulation,
      simulatedAt: TEST_NOW.toISOString(),
      riskEvidence,
      eligibilityEvidence,
    };
    const simulation = {
      ...simulationEvidence,
      executionReadiness: evaluatePumpExecutionReadiness({
        sessionWalletAddress: WALLET_ADDRESS,
        sessionTokenMint: MINT,
        preview,
        simulation: simulationEvidence,
        now: TEST_NOW,
      }),
    };

    // 1. Prepare Execution
    const prepared = preparedService.prepare({
      sessionId: "00000000-0000-4000-8000-000000000001",
      preview,
      production: build,
      simulation,
      buildInput,
      now: TEST_NOW,
    });

    // 2. Consume Prepared & Evaluate Final Revalidation
    const consumed = preparedService.consume({
      sessionId: "00000000-0000-4000-8000-000000000001",
      preview,
      now: TEST_NOW,
    });

    const revalidation = evaluatePumpFinalRevalidation({
      prepared: consumed,
      preview,
      production: build,
      simulation,
      risk: riskEvidence,
      now: TEST_NOW,
    });

    const failedChecks = revalidation.checks.filter((c) => !c.passed);
    assert.deepEqual(failedChecks, []);
    assert.equal(revalidation.status, "ready-for-password");
    assert.equal(revalidation.requiredConfirmation, "EXECUTE PUMP MAINNET");

    // 3. Verify Digest & Local Signing
    verifyDigestMatchesTransaction(build.unsignedTransaction.serialized, revalidation.finalTransactionDigest);
    const tx = VersionedTransaction.deserialize(build.unsignedTransaction.serialized);
    const signedTx = signPumpVersionedTransaction(tx, WALLET_KEYPAIR);

    // 4. Mock RPC Broadcast
    const dummySignature = "2".repeat(64);
    const rpc = new PumpMainnetRpc({
      rpcUrl: "https://rpc.example.test",
      fetch: async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: "1", result: dummySignature })),
    });

    const broadcastResult = await broadcastPumpTransaction({ signedTransaction: signedTx, rpc });
    assert.equal(broadcastResult.signature, dummySignature);

    // 5. Reconcile Settlement & Record Receipt
    const reconciler = new PumpReceiptReconciliationService({
      async verifyTransactionSignature() { return { state: "finalized", slot: 501, error: null, verifiedAt: "2026-07-22T00:01:00.000Z" }; },
      async pumpTransactionSettlement() { return { slot: 501, feeLamports: 5_000, walletPreLamports: "100000000", walletPostLamports: "98995000", tokenMint: MINT, tokenPreRawAmount: "0", tokenPostRawAmount: "100", tokenRawDelta: "100", accountCreationFundingLamports: 0 }; },
    });

    const receipt = await reconciler.reconcile({
      receiptId: "00000000-0000-4000-8000-000000000099",
      preview,
      signature: dummySignature,
    });

    await receiptStore.saveReceipt(receipt);
    await riskLedger.recordReceipt(receipt);

    // Verify stored state
    const savedReceipt = await receiptStore.getReceipt(receipt.id);
    assert.equal(savedReceipt?.signature, dummySignature);
    const updatedUsage = await riskLedger.usageFor(MINT);
    assert.equal(updatedUsage.dailySpendLamports, "1000000");
  } finally {
    if (database) database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

function blockhashReader(slot: number) {
  return {
    async getLatestBlockhashAndContext(config: { commitment: "finalized"; minContextSlot: number }) {
      return { context: { slot }, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1_000 } };
    },
  };
}

function mockPreview(side: "buy" | "sell", wallet: string, mint: string): PumpTradeContractPreview {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    status: "ready-for-review",
    lifecycle: "proposal-only",
    goal: "Pump trade",
    side,
    venue: "bonding-curve-active",
    walletAddress: wallet,
    tokenMint: mint,
    inputMint: side === "buy" ? "So11111111111111111111111111111111111111112" : mint,
    outputMint: side === "buy" ? mint : "So11111111111111111111111111111111111111112",
    inputAmount: "1000000",
    maxSolExposureLamports: "1000000",
    minimumOutputAmount: "100",
    maxSlippageBps: 300,
    deadlineAt: "2026-07-22T01:00:00.000Z",
    stopConditions: ["Stop on failure"],
    risk: { mintAuthority: null, freezeAuthority: null, top10ConcentrationPercent: 20, liquidityVerified: true, evidenceSlot: 500 },
    quote: null,
    checks: [{ code: "exact_mint_valid", status: "pass", message: "Exact mint bound" }],
    executionAllowed: false,
    createdAt: "2026-07-22T00:00:00.000Z",
  };
}

function mockEvidence(): PumpV2FinalizedBuildEvidence {
  return {
    mint: MINT,
    tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    mintSecurity: { initialized: true, mintAuthority: null, freezeAuthority: null },
    creator: "5L5k7gtNLbeXdzpvNrFshg1E1id1ceUDfc6vPUTxp98q",
    feeRecipients: ["62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"],
    buybackFeeRecipients: ["5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD"],
    curve: { virtualTokenReserves: "1000000000000000", virtualQuoteReserves: "1000000", realTokenReserves: "800000000000000", tokenTotalSupply: "1000000000000000", mayhemMode: false },
    feeSchedule: { source: "fee-config", protocolFeeBps: "95", creatorFeeBps: "30", buybackAllocationBps: "5000", tiers: [] },
    slot: 500,
    commitment: "finalized",
    verifiedAt: "2026-07-22T00:00:00.000Z",
  };
}
