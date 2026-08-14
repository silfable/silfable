import assert from "node:assert/strict";
import test from "node:test";

import { encodeAndInspectPumpSwapInstruction, type PumpSwapCodecInput } from "./pumpswap-codec.js";

const WALLET = "11111111111111111111111111111111";
const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const POOL = "22222222222222222222222222222222";

function sampleInput(side: "buy" | "sell"): PumpSwapCodecInput {
  return {
    side,
    walletAddress: WALLET,
    tokenMint: MINT,
    tokenProgram: TOKEN_PROGRAM,
    pool: POOL,
    userBaseTokenAccount: "33333333333333333333333333333333",
    userQuoteTokenAccount: "44444444444444444444444444444444",
    poolBaseTokenAccount: "55555555555555555555555555555555",
    poolQuoteTokenAccount: "66666666666666666666666666666666",
    protocolFeeRecipient: "77777777777777777777777777777777",
    protocolFeeRecipientTokenAccount: "88888888888888888888888888888888",
    coinCreatorVaultAta: "99999999999999999999999999999999",
    coinCreatorVaultAuthority: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    inputAmount: "1000000",
    minimumOutputAmount: "100",
  };
}

test("PumpSwap local codec encodes valid buy_exact_quote_in instruction", async () => {
  const encoded = await encodeAndInspectPumpSwapInstruction(sampleInput("buy"));
  assert.equal(encoded.codec, "silfable-pumpswap");
  assert.equal(encoded.plan.venue, "pumpswap");
  assert.equal(encoded.plan.side, "buy");
  assert.equal(encoded.inspection.allowed, true);
  assert.equal(encoded.data.length, 24);
});

test("PumpSwap local codec encodes valid sell instruction", async () => {
  const encoded = await encodeAndInspectPumpSwapInstruction(sampleInput("sell"));
  assert.equal(encoded.codec, "silfable-pumpswap");
  assert.equal(encoded.plan.venue, "pumpswap");
  assert.equal(encoded.plan.side, "sell");
  assert.equal(encoded.inspection.allowed, true);
  assert.equal(encoded.data.length, 24);
});

test("PumpSwap local codec rejects invalid numerical amounts", async () => {
  await assert.rejects(
    () => encodeAndInspectPumpSwapInstruction({ ...sampleInput("buy"), inputAmount: "0" }),
    /input amount is invalid/,
  );
  await assert.rejects(
    () => encodeAndInspectPumpSwapInstruction({ ...sampleInput("sell"), minimumOutputAmount: "-5" }),
    /minimum output amount is invalid/,
  );
});
