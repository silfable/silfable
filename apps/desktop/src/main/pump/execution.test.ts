import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  Keypair,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import type {
  PumpExecutionReceipt,
  PumpFinalRevalidation,
  PumpTradeContractPreview,
} from "@silfable/contracts";
import type { PumpV2ProductionSimulation } from "./production.js";
import {
  createSignedPumpExecution,
  markPumpBroadcastUnknown,
  markPumpExecutionFailed,
  markPumpExecutionFinalized,
  safeExecutionError,
} from "./execution.js";

const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const BLOCKHASH = "8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";
const PREVIEW_ID = "00000000-0000-4000-8000-000000000020";
const EXECUTION_ID = "00000000-0000-4000-8000-000000000099";
const NOW = new Date("2026-07-22T00:00:10.000Z");

test("manual Pump signer creates a locally verifiable, scope-bound execution record", () => {
  const keypair = Keypair.generate();
  const transaction = unsignedTransaction(keypair);
  const serialized = transaction.serialize();
  const digest = createHash("sha256").update(serialized).digest("hex");
  const preview = pumpPreview(keypair.publicKey.toBase58());
  const signed = createSignedPumpExecution({
    preview,
    production: production(serialized),
    revalidation: revalidation(preview, digest),
    keypair,
    now: NOW,
    executionId: EXECUTION_ID,
  });

  assert.equal(signed.execution.status, "signed-not-broadcast");
  assert.equal(signed.execution.signature.length >= 64, true);
  assert.equal(signed.execution.walletAddress, preview.walletAddress);
  assert.equal(signed.execution.transactionDigest, digest);
  assert.equal(signed.transaction.signatures[0]?.some((byte) => byte !== 0), true);
});

test("manual Pump signer rejects a wallet or digest mismatch", () => {
  const keypair = Keypair.generate();
  const other = Keypair.generate();
  const serialized = unsignedTransaction(keypair).serialize();
  const digest = createHash("sha256").update(serialized).digest("hex");
  const preview = pumpPreview(keypair.publicKey.toBase58());

  assert.throws(() => createSignedPumpExecution({
    preview,
    production: production(serialized),
    revalidation: revalidation(preview, digest),
    keypair: other,
    now: NOW,
  }), /signer does not match/u);
  assert.throws(() => createSignedPumpExecution({
    preview,
    production: production(serialized),
    revalidation: revalidation(preview, "0".repeat(64)),
    keypair,
    now: NOW,
  }), /digest mismatch/u);
});

test("Pump execution status transitions never fabricate a finalized receipt", () => {
  const keypair = Keypair.generate();
  const serialized = unsignedTransaction(keypair).serialize();
  const digest = createHash("sha256").update(serialized).digest("hex");
  const preview = pumpPreview(keypair.publicKey.toBase58());
  const signed = createSignedPumpExecution({
    preview,
    production: production(serialized),
    revalidation: revalidation(preview, digest),
    keypair,
    now: NOW,
    executionId: EXECUTION_ID,
  }).execution;

  const unknown = markPumpBroadcastUnknown(signed, "network timeout", NOW);
  assert.equal(unknown.status, "broadcast-unknown");
  assert.match(unknown.error ?? "", /will not broadcast/u);

  const failed = markPumpExecutionFailed(unknown, "InstructionError", NOW);
  assert.equal(failed.status, "failed");
  assert.equal(failed.receipt, undefined);

  const receipt = finalizedReceipt(unknown);
  const finalized = markPumpExecutionFinalized(unknown, receipt, NOW);
  assert.equal(finalized.status, "finalized");
  assert.equal(finalized.receipt?.signature, unknown.signature);
});

test("Pump timeout and abort evidence is converted into a safe no-rebroadcast message", () => {
  for (const error of [
    "RPC request timed out",
    "This operation was aborted",
    "fetch failed",
  ]) {
    const message = safeExecutionError(error);
    assert.match(message, /status is unknown/u);
    assert.match(message, /will not broadcast/u);
    assert.doesNotMatch(message, /RPC request timed out|operation was aborted|fetch failed/u);
  }
});

function unsignedTransaction(keypair: Keypair): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: BLOCKHASH,
    instructions: [],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

function production(serialized: Uint8Array): PumpV2ProductionSimulation {
  return {
    unsignedTransaction: {
      serialized,
      signed: false,
      lastValidBlockHeight: 1_000,
    },
    broadcastAttempted: false,
  } as unknown as PumpV2ProductionSimulation;
}

function pumpPreview(walletAddress: string): PumpTradeContractPreview {
  return {
    id: PREVIEW_ID,
    status: "ready-for-review",
    lifecycle: "proposal-only",
    goal: "Buy exact Pump mint",
    side: "buy",
    venue: "bonding-curve-active",
    walletAddress,
    tokenMint: MINT,
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: MINT,
    inputAmount: "1000000",
    maxSolExposureLamports: "1000000",
    minimumOutputAmount: "100000",
    maxSlippageBps: 300,
    deadlineAt: "2026-07-22T01:00:00.000Z",
    stopConditions: ["Stop on any policy failure"],
    risk: { mintAuthority: null, freezeAuthority: null, top10ConcentrationPercent: 20, liquidityVerified: true, evidenceSlot: 500 },
    quote: null,
    checks: [{ code: "exact_mint_valid", status: "pass", message: "Exact mint bound" }],
    executionAllowed: false,
    createdAt: "2026-07-22T00:00:00.000Z",
  };
}

function revalidation(preview: PumpTradeContractPreview, digest: string): PumpFinalRevalidation {
  const ids = ["cache-binding", "proposal-binding", "wallet-binding", "mint-binding", "parameter-binding", "finalized-state", "quote-floor", "fresh-blockhash", "final-simulation", "fee-guard", "risk-policy", "unsigned"] as const;
  return {
    status: "ready-for-password",
    previewId: preview.id,
    walletAddress: preview.walletAddress,
    tokenMint: preview.tokenMint,
    side: preview.side,
    initialTransactionDigest: digest,
    finalTransactionDigest: digest,
    initialStateSlot: 500,
    finalStateSlot: 501,
    finalSimulationSlot: 501,
    checks: ids.map((id) => ({ id, passed: true, message: "Pass" })),
    requiresMasterPassword: true,
    requiredConfirmation: "EXECUTE PUMP MAINNET",
    signingAttempted: false,
    broadcastAttempted: false,
    executionAllowed: false,
    evaluatedAt: NOW.toISOString(),
    expiresAt: "2026-07-22T00:01:10.000Z",
  };
}

function finalizedReceipt(execution: ReturnType<typeof markPumpBroadcastUnknown>): PumpExecutionReceipt {
  return {
    id: execution.id,
    previewId: execution.previewId,
    signature: execution.signature,
    walletAddress: execution.walletAddress,
    tokenMint: execution.tokenMint,
    side: execution.side,
    status: "finalized",
    slot: 501,
    networkFeeLamports: 5_000,
    accountCreationFundingLamports: 0,
    walletLamportDelta: "-1005000",
    tokenRawDelta: "100000",
    actualInputAmount: "1000000",
    actualOutputAmount: "100000",
    chainVerification: "finalized",
    signingSource: "future-local-signer",
    broadcastAttempted: true,
    reconciledAt: NOW.toISOString(),
  };
}
