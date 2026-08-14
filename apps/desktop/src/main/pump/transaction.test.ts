import assert from "node:assert/strict";
import { test } from "node:test";

import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

import { buildAndInspectPumpV2Instruction } from "./builder.js";
import { buildAndInspectPumpUnsignedTransaction, inspectPumpUnsignedTransaction } from "./transaction.js";

const WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";
const BLOCKHASH = PublicKey.default.toBase58();

test("Pump unsigned transaction round-trips through strict serialized inspection", async () => {
  const build = await instruction();
  const artifact = buildAndInspectPumpUnsignedTransaction({
    walletAddress: WALLET,
    instruction: build.instruction,
    plan: build.plan,
    recentBlockhash: BLOCKHASH,
    lastValidBlockHeight: 999,
    blockhashContextSlot: 500,
    minimumEvidenceSlot: 400,
  });
  assert.equal(artifact.inspection.allowed, true);
  assert.equal(artifact.inspection.signerCount, 1);
  assert.equal(artifact.inspection.instructionCount, 1);
  assert.equal(artifact.inspection.addressLookupCount, 0);
  assert.equal(artifact.signed, false);
  assert.equal(artifact.simulated, false);
  assert.equal(artifact.broadcastAttempted, false);
  assert.equal(VersionedTransaction.deserialize(Buffer.from(artifact.serializedBase64, "base64")).signatures[0]!.every((value) => value === 0), true);
});

test("Pump serialized inspector rejects an injected top-level transfer", async () => {
  const build = await instruction();
  const message = new TransactionMessage({
    payerKey: new PublicKey(WALLET),
    recentBlockhash: BLOCKHASH,
    instructions: [
      build.instruction,
      SystemProgram.transfer({ fromPubkey: new PublicKey(WALLET), toPubkey: PublicKey.default, lamports: 1 }),
    ],
  }).compileToV0Message();
  const inspection = inspectPumpUnsignedTransaction({
    serialized: new VersionedTransaction(message).serialize(),
    walletAddress: WALLET,
    plan: build.plan,
    expectedBlockhash: BLOCKHASH,
    expectedInstructionData: build.instruction.data,
  });
  assert.equal(inspection.allowed, false);
  assert.equal(inspection.checks.find((check) => check.code === "instruction_count")?.status, "fail");
});

test("Pump unsigned builder rejects a blockhash older than finalized state evidence", async () => {
  const build = await instruction();
  assert.throws(() => buildAndInspectPumpUnsignedTransaction({
    walletAddress: WALLET,
    instruction: build.instruction,
    plan: build.plan,
    recentBlockhash: BLOCKHASH,
    lastValidBlockHeight: 999,
    blockhashContextSlot: 399,
    minimumEvidenceSlot: 400,
  }), /predates the finalized state evidence/u);
});

async function instruction() {
  return buildAndInspectPumpV2Instruction({
    side: "buy",
    walletAddress: WALLET,
    tokenMint: "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump",
    tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    creator: "SysvarRent111111111111111111111111111111111",
    feeRecipient: "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV",
    authorizedFeeRecipients: ["62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"],
    buybackFeeRecipient: "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKaH8GQfjmU9mq",
    authorizedBuybackFeeRecipients: ["4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKaH8GQfjmU9mq"],
    inputAmount: "1000000",
    minimumOutputAmount: "100000",
  });
}
