import { randomUUID } from "node:crypto";
import { getBase58Decoder } from "@solana/kit";
import { VersionedTransaction, type Keypair } from "@solana/web3.js";
import {
  PumpExecutionRecordSchema,
  type PumpExecutionRecord,
  type PumpExecutionReceipt,
  type PumpFinalRevalidation,
  type PumpTradeContractPreview,
} from "@silfable/contracts";

import type { PumpV2ProductionSimulation } from "./production.js";
import type { PumpSwapProductionSimulation } from "./pumpswap-production.js";
import {
  signPumpVersionedTransaction,
  verifyDigestMatchesTransaction,
} from "./signer.js";

export type SignedPumpExecution = {
  transaction: VersionedTransaction;
  execution: PumpExecutionRecord;
};

export function createSignedPumpExecution(input: {
  preview: PumpTradeContractPreview;
  production: PumpV2ProductionSimulation | PumpSwapProductionSimulation;
  revalidation: PumpFinalRevalidation;
  keypair: Keypair;
  now?: Date;
  executionId?: string;
}): SignedPumpExecution {
  const now = input.now ?? new Date();
  if (input.revalidation.status !== "ready-for-password"
    || input.revalidation.previewId !== input.preview.id
    || input.revalidation.walletAddress !== input.preview.walletAddress
    || input.revalidation.tokenMint !== input.preview.tokenMint
    || input.revalidation.side !== input.preview.side
    || input.revalidation.checks.some((check) => !check.passed)
    || Date.parse(input.revalidation.expiresAt) <= now.getTime()) {
    throw new Error("Pump final approval is stale or blocked");
  }
  if (input.keypair.publicKey.toBase58() !== input.preview.walletAddress) {
    throw new Error("Pump signer does not match the approved session wallet");
  }
  verifyDigestMatchesTransaction(
    input.production.unsignedTransaction.serialized,
    input.revalidation.finalTransactionDigest,
  );
  const transaction = VersionedTransaction.deserialize(
    input.production.unsignedTransaction.serialized,
  );
  signPumpVersionedTransaction(transaction, input.keypair);
  const signatureBytes = transaction.signatures[0];
  if (signatureBytes === undefined || !signatureBytes.some((byte) => byte !== 0)) {
    throw new Error("Pump transaction signature was not produced");
  }
  const signature = getBase58Decoder().decode(signatureBytes);
  const timestamp = now.toISOString();
  return {
    transaction,
    execution: PumpExecutionRecordSchema.parse({
      id: input.executionId ?? randomUUID(),
      previewId: input.preview.id,
      signature,
      walletAddress: input.preview.walletAddress,
      tokenMint: input.preview.tokenMint,
      side: input.preview.side,
      transactionDigest: input.revalidation.finalTransactionDigest,
      lastValidBlockHeight: input.production.unsignedTransaction.lastValidBlockHeight,
      status: "signed-not-broadcast",
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  };
}

export function markPumpBroadcastUnknown(
  execution: PumpExecutionRecord,
  error: string | null,
  now = new Date(),
): PumpExecutionRecord {
  return PumpExecutionRecordSchema.parse({
    ...execution,
    status: "broadcast-unknown",
    error: error === null ? null : safeExecutionError(error),
    updatedAt: now.toISOString(),
  });
}

export function markPumpExecutionFailed(
  execution: PumpExecutionRecord,
  error: string,
  now = new Date(),
): PumpExecutionRecord {
  return PumpExecutionRecordSchema.parse({
    ...execution,
    status: "failed",
    error: safeExecutionError(error),
    updatedAt: now.toISOString(),
  });
}

export function markPumpExecutionFinalized(
  execution: PumpExecutionRecord,
  receipt: PumpExecutionReceipt,
  now = new Date(),
): PumpExecutionRecord {
  return PumpExecutionRecordSchema.parse({
    ...execution,
    status: "finalized",
    error: null,
    receipt,
    updatedAt: now.toISOString(),
  });
}

export function safeExecutionError(error: string): string {
  const normalized = error.replace(/\s+/gu, " ").trim();
  if (/timeout|timed out|fetch failed|network|unknown|abort|aborted/iu.test(normalized)) {
    return "Broadcast status is unknown. Silfable will verify the locally derived signature and will not broadcast this transaction again.";
  }
  if (/blockhash/iu.test(normalized)) {
    return "The approved blockhash expired before confirmation. Verify the signature before preparing a new transaction.";
  }
  if (/insufficient funds/iu.test(normalized)) {
    return "The wallet did not have enough finalized balance for this transaction and its fees.";
  }
  if (/slippage|minimum.*output/iu.test(normalized)) {
    return "The approved minimum output could not be preserved.";
  }
  return normalized.length > 0
    ? normalized.slice(0, 500)
    : "Pump execution failed safely. Verify the signature before trying again.";
}
