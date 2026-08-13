import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPumpSwapProductionUnsignedTransactionFromEvidence,
  type PumpSwapProductionBuildInput,
} from "./pumpswap-production.js";
import { type PumpSwapFinalizedBuildEvidence } from "./pumpswap-state.js";

const WALLET = "AY8Ti7Tr7iUGksWJ7GjYy3vkE2YBv6qj9BnE8HtYCf8f";
const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const BLOCKHASH = "8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";
const POOL = "8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";
const BASE_VAULT = "9opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";
const QUOTE_VAULT = "AopHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";
const FEE_RECIP = "BopHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";
const FEE_RECIP_ATA = "CopHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";
const CREATOR_ATA = "DopHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";
const CREATOR_AUTH = "EopHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";

function buildInput(): PumpSwapProductionBuildInput {
  return {
    side: "buy",
    walletAddress: WALLET,
    tokenMint: MINT,
    inputAmount: "1000000",
    minimumOutputAmount: "100",
    maxTotalFeeBps: 500,
  };
}

function mockEvidence(): PumpSwapFinalizedBuildEvidence {
  return {
    mint: MINT,
    tokenProgram: TOKEN_PROGRAM,
    pool: POOL,
    baseVault: BASE_VAULT,
    quoteVault: QUOTE_VAULT,
    baseReserves: "1000000000",
    quoteReserves: "1000000000",
    coinCreatorVaultAta: CREATOR_ATA,
    coinCreatorVaultAuthority: CREATOR_AUTH,
    protocolFeeRecipient: FEE_RECIP,
    protocolFeeRecipientTokenAccount: FEE_RECIP_ATA,
    mintSecurity: {
      initialized: true,
      mintAuthority: null,
      freezeAuthority: null,
    },
    feeSchedule: {
      protocolFeeBps: "100",
      creatorFeeBps: "50",
      buybackAllocationBps: "0",
    },
    slot: 500,
    commitment: "finalized",
    verifiedAt: new Date().toISOString(),
  };
}

function blockhashReader(contextSlot = 500) {
  return {
    async getLatestBlockhashAndContext() {
      return {
        context: { slot: contextSlot },
        value: {
          blockhash: BLOCKHASH,
          lastValidBlockHeight: 1000,
        },
      };
    },
  };
}

test("production-safe PumpSwap buy transaction preserves audited SDK instruction semantics", async () => {
  const result = await buildPumpSwapProductionUnsignedTransactionFromEvidence(
    blockhashReader(501),
    buildInput(),
    mockEvidence(),
  );

  assert.equal(result.codec, "silfable-pumpswap");
  assert.equal(result.signingAttempted, false);
  assert.equal(result.broadcastAttempted, false);
  assert.equal(result.unsignedTransaction.inspection.allowed, true);
  assert.equal(result.unsignedTransaction.inspection.signerCount, 1);
  assert.equal(result.unsignedTransaction.signed, false);
});

test("production-safe PumpSwap transaction rejects blockhash evidence older than finalized state", async () => {
  await assert.rejects(
    () =>
      buildPumpSwapProductionUnsignedTransactionFromEvidence(
        blockhashReader(499),
        buildInput(),
        mockEvidence(),
      ),
    /older than finalized state evidence/,
  );
});
