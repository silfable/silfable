import assert from "node:assert/strict";
import { test } from "node:test";

import { PublicKey, type AccountInfo } from "@solana/web3.js";

import { buildAndInspectPumpV2Instruction } from "./builder.js";
import { calculatePumpFeePreview } from "./fees.js";
import { PUMP_PROGRAM_ID } from "./inspector.js";
import { simulatePumpUnsignedTransaction, type PumpSimulationRpc } from "./simulation.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";
import { buildAndInspectPumpUnsignedTransaction } from "./transaction.js";

const WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";

test("Pump unsigned simulation reports compute, network fee, created-account funding, and invoked programs", async () => {
  const fixture = await artifact();
  const simulation = await simulatePumpUnsignedTransaction({
    ...fixture,
    rpc: rpc(),
    maxNetworkFeeLamports: 200_000,
    maxFeePercent: 5,
    now: new Date("2026-07-22T00:00:00.000Z"),
  });
  assert.equal(simulation.status, "passed");
  assert.equal(simulation.unitsConsumed, 123_456);
  assert.equal(simulation.networkFeeLamports, 5_000);
  assert.equal(simulation.rentLamports, 2_039_280);
  assert.equal(simulation.invokedPrograms.includes(PUMP_PROGRAM_ID), true);
  assert.equal(simulation.transactionSigned, false);
  assert.equal(simulation.broadcastAttempted, false);
});

test("Pump simulation blocks a non-allowlisted invoked program", async () => {
  const fixture = await artifact();
  const simulation = await simulatePumpUnsignedTransaction({
    ...fixture,
    rpc: rpc({ extraProgram: "Vote111111111111111111111111111111111111111" }),
    maxNetworkFeeLamports: 200_000,
    maxFeePercent: 5,
  });
  assert.equal(simulation.status, "blocked");
  assert.match(simulation.error ?? "", /non-allowlisted program/u);
});

test("Pump simulation fee guard blocks excessive network fee without signing", async () => {
  const fixture = await artifact();
  const simulation = await simulatePumpUnsignedTransaction({
    ...fixture,
    rpc: rpc({ feeLamports: 250_000 }),
    maxNetworkFeeLamports: 200_000,
    maxFeePercent: 30,
  });
  assert.equal(simulation.status, "blocked");
  assert.equal(simulation.feeRisk, "extreme");
  assert.equal(simulation.transactionSigned, false);
  assert.equal(simulation.broadcastAttempted, false);
});

async function artifact() {
  const instruction = await buildAndInspectPumpV2Instruction({
    side: "buy", walletAddress: WALLET, tokenMint: evidence().mint, tokenProgram: evidence().tokenProgram,
    creator: evidence().creator, feeRecipient: evidence().feeRecipients[0]!, authorizedFeeRecipients: evidence().feeRecipients,
    buybackFeeRecipient: evidence().buybackFeeRecipients[0]!, authorizedBuybackFeeRecipients: evidence().buybackFeeRecipients,
    inputAmount: "1000000", minimumOutputAmount: "100000",
  });
  const transaction = buildAndInspectPumpUnsignedTransaction({
    walletAddress: WALLET,
    instruction: instruction.instruction,
    plan: instruction.plan,
    recentBlockhash: PublicKey.default.toBase58(),
    lastValidBlockHeight: 999,
    blockhashContextSlot: 500,
    minimumEvidenceSlot: 400,
  });
  const state = evidence();
  return {
    transaction,
    instructionData: instruction.instruction.data,
    plan: instruction.plan,
    evidence: state,
    feePreview: calculatePumpFeePreview({ side: "buy" as const, rawInputAmount: "1000000", maxTotalFeeBps: 500, evidence: state }),
  };
}

function rpc(options: { feeLamports?: number; extraProgram?: string } = {}): PumpSimulationRpc {
  const account = (): AccountInfo<Buffer> => ({ data: Buffer.alloc(1), executable: false, lamports: 1, owner: PublicKey.default, rentEpoch: 0 });
  return {
    async getMultipleAccountsInfoAndContext(addresses) {
      return { context: { slot: 501 }, value: addresses.map((_, index) => index === 0 ? null : account()) };
    },
    async getFeeForMessage() {
      return { context: { slot: 501 }, value: options.feeLamports ?? 5_000 };
    },
    async simulateTransaction(_transaction, config) {
      const logs = [
        `Program ${PUMP_PROGRAM_ID} invoke [1]`,
        "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [2]",
        ...(options.extraProgram ? [`Program ${options.extraProgram} invoke [2]`] : []),
      ];
      return {
        context: { slot: 502 },
        value: {
          err: null,
          logs,
          unitsConsumed: 123_456,
          innerInstructions: [{
            index: 0,
            instructions: [
              { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
              ...(options.extraProgram ? [{ programId: options.extraProgram }] : []),
            ],
          }],
          accounts: config.accounts.addresses.map((_, index) => ({ lamports: index === 0 ? 2_039_280 : 1, data: [Buffer.alloc(index === 0 ? 165 : 1).toString("base64"), "base64"] as [string, "base64"] })),
        },
      };
    },
  };
}

function evidence(): PumpV2FinalizedBuildEvidence {
  return {
    mint: "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump",
    tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    mintSecurity: { initialized: true, mintAuthority: null, freezeAuthority: null },
    creator: "5L5k7gtNLbeXdzpvNrFshg1E1id1ceUDfc6vPUTxp98q",
    feeRecipients: ["62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"],
    buybackFeeRecipients: ["5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD"],
    curve: { virtualTokenReserves: "1000000000000000", virtualQuoteReserves: "1000000", realTokenReserves: "800000000000000", tokenTotalSupply: "1000000000000000", mayhemMode: false },
    feeSchedule: { source: "fee-config", protocolFeeBps: "95", creatorFeeBps: "30", buybackAllocationBps: "0", tiers: [{ marketCapQuoteThreshold: "0", protocolFeeBps: "95", creatorFeeBps: "30" }] },
    slot: 400,
    commitment: "finalized",
    verifiedAt: "2026-07-22T00:00:00.000Z",
  };
}
