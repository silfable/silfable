import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAndInspectPumpV2Instruction } from "./builder.js";
import { PUMP_IDL_REVISION } from "./inspector.js";

const WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";
const TOKEN_MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const CREATOR = "SysvarRent111111111111111111111111111111111";
const FEE_RECIPIENT = "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV";
const BUYBACK_RECIPIENT = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKaH8GQfjmU9mq";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

test("official SDK builds a Pump v2 exact-quote buy instruction that passes the pinned inspector", async () => {
  const build = await buildAndInspectPumpV2Instruction(input("buy"));
  assert.equal(build.sdkVersion, "1.36.0");
  assert.equal(build.idlRevision, PUMP_IDL_REVISION);
  assert.equal(build.inspection.allowed, true);
  assert.equal(build.inspection.instructionName, "buy_exact_quote_in_v2");
  assert.equal(build.transactionBuilt, false);
  assert.equal(build.signingAttempted, false);
  assert.equal(build.broadcastAttempted, false);
});

test("official SDK builds a Pump v2 sell instruction that passes the separate sell manifest", async () => {
  const build = await buildAndInspectPumpV2Instruction(input("sell"));
  assert.equal(build.inspection.allowed, true);
  assert.equal(build.inspection.instructionName, "sell_v2");
  assert.equal(build.plan.accounts.filter((account) => account.signer).length, 1);
  assert.equal(build.plan.accounts.find((account) => account.signer)?.address, WALLET);
});

test("Pump v2 builder rejects a fee recipient that is not in finalized Global evidence", async () => {
  const value = input("buy");
  value.authorizedFeeRecipients = [BUYBACK_RECIPIENT];
  await assert.rejects(() => buildAndInspectPumpV2Instruction(value), /fee recipient is not present/u);
});

function input(side: "buy" | "sell") {
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
