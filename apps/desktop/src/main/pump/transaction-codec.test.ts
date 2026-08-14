import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAndInspectPumpV2Instruction } from "./builder.js";
import { encodeAndInspectPumpV2Instruction, type PumpV2CodecInput } from "./codec.js";
import { buildAndInspectPumpUnsignedTransaction } from "./transaction.js";
import { buildAndInspectPumpKitUnsignedTransaction } from "./transaction-codec.js";

const WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";
const TOKEN_MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const CREATOR = "SysvarRent111111111111111111111111111111111";
const FEE_RECIPIENT = "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV";
const BUYBACK_RECIPIENT = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKaH8GQfjmU9mq";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const BLOCKHASH = "11111111111111111111111111111111";

for (const side of ["buy", "sell"] as const) {
  test(`production-safe Pump ${side} transaction preserves the audited SDK instruction semantics`, async () => {
    const codec = await encodeAndInspectPumpV2Instruction(input(side));
    const local = buildAndInspectPumpKitUnsignedTransaction({
      walletAddress: WALLET,
      instruction: codec,
      recentBlockhash: BLOCKHASH,
      lastValidBlockHeight: 123,
      blockhashContextSlot: 456_789,
      minimumEvidenceSlot: 456_000,
    });
    const sdk = await buildAndInspectPumpV2Instruction(input(side));
    const legacy = buildAndInspectPumpUnsignedTransaction({
      walletAddress: WALLET,
      instruction: sdk.instruction,
      plan: sdk.plan,
      recentBlockhash: BLOCKHASH,
      lastValidBlockHeight: 123,
      blockhashContextSlot: 456_789,
      minimumEvidenceSlot: 456_000,
    });

    assert.equal(local.inspection.allowed, true);
    assert.equal(legacy.inspection.allowed, true);
    assert.equal(local.inspection.signerCount, 1);
    assert.equal(local.inspection.instructionCount, 1);
    assert.equal(local.inspection.addressLookupCount, 0);
    assert.equal(local.serialized.length > 0, true);
    assert.equal(local.signed, false);
    assert.equal(local.simulated, false);
    assert.equal(local.broadcastAttempted, false);
  });
}

test("production-safe Pump transaction rejects blockhash evidence older than finalized state", async () => {
  const codec = await encodeAndInspectPumpV2Instruction(input("buy"));
  assert.throws(
    () => buildAndInspectPumpKitUnsignedTransaction({
      walletAddress: WALLET,
      instruction: codec,
      recentBlockhash: BLOCKHASH,
      lastValidBlockHeight: 123,
      blockhashContextSlot: 455_999,
      minimumEvidenceSlot: 456_000,
    }),
    /predates the finalized state/u,
  );
});

function input(side: "buy" | "sell"): PumpV2CodecInput {
  return {
    side,
    walletAddress: WALLET,
    tokenMint: TOKEN_MINT,
    tokenProgram: TOKEN_PROGRAM,
    creator: CREATOR,
    feeRecipient: FEE_RECIPIENT,
    authorizedFeeRecipients: [FEE_RECIPIENT],
    buybackFeeRecipient: BUYBACK_RECIPIENT,
    authorizedBuybackFeeRecipients: [BUYBACK_RECIPIENT],
    inputAmount: side === "buy" ? "1000000" : "100000",
    minimumOutputAmount: side === "buy" ? "100000" : "1000",
  };
}
