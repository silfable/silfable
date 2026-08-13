import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inspectPumpInstructionPlan,
  PUMP_FEE_PROGRAM_ID,
  PUMP_IDL_REVISION,
  PUMP_PROGRAM_ID,
  PUMP_SWAP_PROGRAM_ID,
  pumpInstructionManifest,
  SOL_MINT,
  type PumpInstructionPlan,
} from "./inspector.js";

const TOKEN_MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const DYNAMIC_ADDRESS = "SysvarRent111111111111111111111111111111111";

test("pinned Pump inspector accepts only the exact audited buy account manifest", () => {
  const plan = planFor("pump", "buy");
  const result = inspectPumpInstructionPlan(plan);
  assert.equal(result.allowed, true);
  assert.equal(result.idlRevision, PUMP_IDL_REVISION);
  assert.equal(result.instructionName, "buy_exact_quote_in_v2");
  assert.equal(result.checks.every((check) => check.status === "pass"), true);
});

test("PumpSwap inspector rejects extra accounts and a mismatched signer binding", () => {
  const plan = planFor("pumpswap", "sell");
  plan.accounts.push({ role: "remaining_account", address: DYNAMIC_ADDRESS, signer: false, writable: false });
  plan.accounts.find((account) => account.role === "user")!.address = DYNAMIC_ADDRESS;
  const result = inspectPumpInstructionPlan(plan);
  assert.equal(result.allowed, false);
  assert.equal(result.checks.find((check) => check.code === "account_count")?.status, "fail");
  assert.equal(result.checks.find((check) => check.code === "wallet_binding")?.status, "fail");
  assert.equal(result.checks.find((check) => check.code === "sole_signer")?.status, "fail");
});

test("inspector rejects a Pump instruction substituted with the PumpSwap program", () => {
  const plan = planFor("pump", "sell");
  plan.programId = PUMP_SWAP_PROGRAM_ID;
  const result = inspectPumpInstructionPlan(plan);
  assert.equal(result.allowed, false);
  assert.equal(result.checks.find((check) => check.code === "program")?.status, "fail");
});

function planFor(venue: "pump" | "pumpswap", side: "buy" | "sell"): PumpInstructionPlan {
  const manifest = pumpInstructionManifest(venue, side);
  return {
    venue,
    side,
    programId: manifest.programId,
    discriminator: manifest.discriminator,
    tokenMint: TOKEN_MINT,
    quoteMint: SOL_MINT,
    walletAddress: WALLET,
    accounts: manifest.roles.map((expected) => ({
      role: expected.name,
      address: expected.fixedAddress ?? roleAddress(expected.name),
      signer: expected.signer,
      writable: expected.writable,
    })),
  };
}

function roleAddress(role: string): string {
  if (role === "user") return WALLET;
  if (role === "mint" || role === "base_mint") return TOKEN_MINT;
  if (role === "quote_mint") return SOL_MINT;
  if (role === "token_program" || role === "base_token_program" || role === "quote_token_program") return TOKEN_PROGRAM;
  if (role === "program") return PUMP_PROGRAM_ID;
  if (role === "fee_program") return PUMP_FEE_PROGRAM_ID;
  return DYNAMIC_ADDRESS;
}
