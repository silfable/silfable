import assert from "node:assert/strict";
import { test } from "node:test";

import { PUMP_PROGRAM_ID } from "./inspector.js";
import {
  buildAndSimulatePumpV2ProductionTransactionFromEvidence,
  buildPumpV2ProductionUnsignedTransactionFromEvidence,
} from "./production.js";
import { simulatePumpKitUnsignedTransaction, type PumpKitSimulationRpc } from "./simulation-kit.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";

const WALLET = "AY8Ti7Tr7iUGksWJ7GjYy3vkE2YBv6qj9BnE8HtYCf8f";
const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const BLOCKHASH = "8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";

test("production-safe Pump simulation reports fee, rent, compute, and no execution authority", async () => {
  const rpc = {
    ...simulationRpc(5_000),
    async getLatestBlockhashAndContext() {
      return { context: { slot: 501 }, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1_000 } };
    },
  };
  const production = await buildAndSimulatePumpV2ProductionTransactionFromEvidence(rpc, {
    side: "buy",
    walletAddress: WALLET,
    tokenMint: MINT,
    inputAmount: "1000000",
    minimumOutputAmount: "100000",
    maxTotalFeeBps: 500,
    maxSlippageBps: 100,
    maxNetworkFeeLamports: 10_000,
    maxFeePercent: 1,
  }, evidence());
  const result = production.simulation;
  const encodedMinimum = new DataView(production.instruction.data.buffer, production.instruction.data.byteOffset, production.instruction.data.byteLength).getBigUint64(16, true);
  assert.equal(encodedMinimum.toString(), production.executableQuote.minimumOutputAmount);
  assert.deepEqual(result.quoteEvidence, production.executableQuote);
  assert.equal(result.status, "passed");
  assert.equal(result.unitsConsumed, 120_000);
  assert.equal(result.networkFeeLamports, 5_000);
  assert.equal(result.rentLamports, 2_039_280);
  assert.equal(result.networkFeePercent, 0.5);
  assert.equal(result.feeRisk, "reasonable");
  assert.equal(result.transactionSigned, false);
  assert.equal(result.broadcastAttempted, false);
});

test("production-safe Pump simulation blocks a fee above the user ceiling", async () => {
  const build = await unsignedBuild();
  const result = await simulatePumpKitUnsignedTransaction({
    rpc: simulationRpc(20_000),
    transaction: build.unsignedTransaction,
    instructionData: build.instruction.data,
    plan: build.instruction.plan,
    evidence: build.stateEvidence,
    feePreview: build.feePreview,
    maxNetworkFeeLamports: 10_000,
    maxFeePercent: 1,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.feeRisk, "extreme");
  assert.match(result.error ?? "", /fee guard/u);
});

async function unsignedBuild() {
  const state = evidence();
  return buildPumpV2ProductionUnsignedTransactionFromEvidence({
    async getLatestBlockhashAndContext() {
      return { context: { slot: 501 }, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1_000 } };
    },
  }, {
    side: "buy",
    walletAddress: WALLET,
    tokenMint: MINT,
    inputAmount: "1000000",
    minimumOutputAmount: "100000",
    maxTotalFeeBps: 500,
  }, state);
}

function simulationRpc(fee: number): PumpKitSimulationRpc {
  const owner = "11111111111111111111111111111111";
  return {
    async getMultipleAccountsInfoAndContext(addresses) {
      return { context: { slot: 502 }, value: addresses.map((_, index) => index === 0 ? null : { lamports: 1, owner, data: new Uint8Array([0]) }) };
    },
    async getFeeForMessage(messageBase64, config) {
      assert.equal(Buffer.from(messageBase64, "base64").length > 0, true);
      assert.deepEqual(config, { commitment: "confirmed" });
      return { context: { slot: 502 }, value: fee };
    },
    async simulateTransaction(transactionBase64, config) {
      assert.equal(Buffer.from(transactionBase64, "base64").length > 0, true);
      assert.equal(config.sigVerify, false);
      assert.equal(config.replaceRecentBlockhash, false);
      const accountCount = config.accounts.addresses.length;
      return {
        context: { slot: 502 },
        value: {
          err: null,
          logs: [`Program ${PUMP_PROGRAM_ID} invoke [1]`, `Program ${PUMP_PROGRAM_ID} success`],
          unitsConsumed: 120_000,
          accounts: Array.from({ length: accountCount }, (_, index) => ({ lamports: index === 0 ? 2_039_280 : 1, data: ["AA==", "base64"] as [string, "base64"] })),
          innerInstructions: [],
        },
      };
    },
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
