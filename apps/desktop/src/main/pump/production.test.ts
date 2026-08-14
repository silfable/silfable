import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPumpV2ProductionUnsignedTransactionFromEvidence,
  type PumpV2ProductionBuildInput,
} from "./production.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";

const WALLET = "AY8Ti7Tr7iUGksWJ7GjYy3vkE2YBv6qj9BnE8HtYCf8f";
const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const BLOCKHASH = "8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";

test("production Pump pipeline creates only a locally inspected unsigned transaction", async () => {
  const result = await buildPumpV2ProductionUnsignedTransactionFromEvidence(blockhashReader(501), buildInput(), evidence());
  assert.equal(result.codec, "silfable-pump-v2");
  assert.equal(result.feePreview.allowed, true);
  assert.equal(result.instruction.inspection.allowed, true);
  assert.equal(result.unsignedTransaction.inspection.allowed, true);
  assert.equal(result.unsignedTransaction.signed, false);
  assert.equal(result.unsignedTransaction.broadcastAttempted, false);
  assert.equal(result.signingAttempted, false);
  assert.equal(result.broadcastAttempted, false);
});

test("production Pump pipeline rejects stale blockhash and excessive finalized fees", async () => {
  await assert.rejects(
    () => buildPumpV2ProductionUnsignedTransactionFromEvidence(blockhashReader(499), buildInput(), evidence()),
    /blockhash predates/u,
  );
  const expensive = evidence();
  expensive.feeSchedule.protocolFeeBps = "500";
  expensive.feeSchedule.creatorFeeBps = "100";
  await assert.rejects(
    () => buildPumpV2ProductionUnsignedTransactionFromEvidence(blockhashReader(501), buildInput(), expensive),
    /fees exceed/u,
  );
});

function blockhashReader(slot: number) {
  return {
    async getLatestBlockhashAndContext(config: { commitment: "finalized"; minContextSlot: number }) {
      assert.deepEqual(config, { commitment: "finalized", minContextSlot: 500 });
      return { context: { slot }, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1_000 } };
    },
  };
}

function buildInput(): PumpV2ProductionBuildInput {
  return {
    side: "buy",
    walletAddress: WALLET,
    tokenMint: MINT,
    inputAmount: "1000000",
    minimumOutputAmount: "100000",
    maxTotalFeeBps: 500,
  };
}

function evidence(): PumpV2FinalizedBuildEvidence {
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
