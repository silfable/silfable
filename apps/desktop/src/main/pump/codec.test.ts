import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAndInspectPumpV2Instruction } from "./builder.js";
import { encodeAndInspectPumpV2Instruction, type PumpV2CodecInput } from "./codec.js";
import { PUMP_IDL_REVISION } from "./inspector.js";

const WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";
const TOKEN_MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const CREATOR = "SysvarRent111111111111111111111111111111111";
const FEE_RECIPIENT = "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV";
const BUYBACK_RECIPIENT = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKaH8GQfjmU9mq";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

for (const side of ["buy", "sell"] as const) {
  test(`local Pump v2 ${side} codec is byte-for-byte identical to the pinned official SDK`, async () => {
    const codec = await encodeAndInspectPumpV2Instruction(input(side));
    const sdk = await buildAndInspectPumpV2Instruction(input(side));

    assert.equal(codec.idlRevision, PUMP_IDL_REVISION);
    assert.equal(codec.programAddress, sdk.instruction.programId.toBase58());
    assert.deepEqual([...codec.data], [...sdk.instruction.data]);
    assert.deepEqual(
      codec.plan.accounts,
      sdk.plan.accounts,
    );
    assert.equal(codec.inspection.allowed, true);
    assert.equal(codec.transactionBuilt, false);
    assert.equal(codec.signingAttempted, false);
    assert.equal(codec.broadcastAttempted, false);
  });
}

test("local Pump codec rejects unauthorized recipients before deriving instruction accounts", async () => {
  const value = input("buy");
  value.authorizedFeeRecipients = [BUYBACK_RECIPIENT];
  await assert.rejects(
    () => encodeAndInspectPumpV2Instruction(value),
    /fee recipient is not present/u,
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
