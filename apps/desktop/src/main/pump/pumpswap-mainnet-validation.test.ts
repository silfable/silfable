import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAndSimulatePumpSwapProductionTransactionFromEvidence,
  pumpSwapEvidenceForPolicy,
  type PumpSwapProductionSimulationInput,
} from "./pumpswap-production.js";
import { type PumpSwapFinalizedBuildEvidence } from "./pumpswap-state.js";
import { evaluatePumpTradeEligibility } from "./eligibility.js";
import { evaluatePumpExecutionReadiness } from "./execution-readiness.js";
import { assertPumpProposalWithinRisk, DEFAULT_PUMP_RISK_SETTINGS } from "./risk-settings.js";
import { PumpPreparedExecutionService } from "./prepared-execution.js";

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
const TEST_NOW = new Date("2026-07-22T00:00:00.000Z");

function buildSimulationInput(side: "buy" | "sell", inputAmount: string, minimumOutputAmount: string): PumpSwapProductionSimulationInput {
  return {
    side,
    walletAddress: WALLET,
    tokenMint: MINT,
    inputAmount,
    minimumOutputAmount,
    maxTotalFeeBps: 500,
    maxSlippageBps: 300,
    maxNetworkFeeLamports: 100_000,
    maxFeePercent: 5,
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
    verifiedAt: TEST_NOW.toISOString(),
  };
}

function mockRpc() {
  return {
    async getFeeForMessage() {
      return { context: { slot: 501 }, value: 5_000 };
    },
    async getLatestBlockhashAndContext() {
      return {
        context: { slot: 501 },
        value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1_000 },
      };
    },
    async simulateTransaction(_tx: any, config: any) {
      const addresses: string[] = config?.accounts?.addresses ?? [];
      return {
        context: { slot: 501 },
        value: {
          err: null,
          logs: ["Program pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA invoke [1]", "Program pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA success"],
          unitsConsumed: 25_000,
          returnData: null,
          innerInstructions: [],
          accounts: addresses.map(() => ({ lamports: 1000000, data: ["", "base64"], owner: TOKEN_PROGRAM, executable: false, rentEpoch: 0 })),
        },
      };
    },
    async getMultipleAccountsInfoAndContext(addresses: string[]) {
      return {
        context: { slot: 501 },
        value: addresses.map(() => ({ data: new Uint8Array(165), owner: TOKEN_PROGRAM })),
      };
    },
  };
}

test("Minimum-value PumpSwap Buy Validation Matrix: 1,000 lamports buy proposal", async () => {
  const input = buildSimulationInput("buy", "1000000", "100");
  const build = await buildAndSimulatePumpSwapProductionTransactionFromEvidence(
    mockRpc() as any,
    input,
    mockEvidence(),
  );

  assert.equal(build.codec, "silfable-pumpswap");
  assert.equal(build.feePreview.allowed, true);
  assert.equal(build.unsignedTransaction.inspection.allowed, true);
  assert.equal(build.simulation.error, null);
});

test("Minimum-value PumpSwap Sell Validation Matrix: 1 raw token unit sell proposal", async () => {
  const input = buildSimulationInput("sell", "1000000", "1000");
  const build = await buildAndSimulatePumpSwapProductionTransactionFromEvidence(
    mockRpc() as any,
    input,
    mockEvidence(),
  );

  assert.equal(build.codec, "silfable-pumpswap");
  assert.equal(build.feePreview.allowed, true);
  assert.equal(build.unsignedTransaction.inspection.allowed, true);
  assert.equal(build.simulation.error, null);
});

test("Full End-to-End PumpSwap Pipeline Validation Matrix", async () => {
  const input = buildSimulationInput("buy", "1000000", "100");
  const build = await buildAndSimulatePumpSwapProductionTransactionFromEvidence(
    mockRpc() as any,
    input,
    mockEvidence(),
  );

  const riskEvidence = assertPumpProposalWithinRisk({
    side: "buy",
    inputAmount: "1000000",
    maxSlippageBps: 300,
    walletSolLamports: "1000000000",
    maxNetworkFeeLamports: 100000,
    settings: DEFAULT_PUMP_RISK_SETTINGS,
    usage: {
      dailySpendLamports: "0",
      perTokenExposureLamports: "0",
      totalExposureLamports: "0",
      openPositions: 0,
      transactionsThisHour: 0,
    },
  });

  const eligibilityEvidence = evaluatePumpTradeEligibility({
    venue: "pumpswap-migrated",
    side: "buy",
    tokenMint: MINT,
    inputAmount: "1000000",
    state: pumpSwapEvidenceForPolicy(mockEvidence()),
    fee: build.feePreview,
    quote: build.executableQuote,
    risk: riskEvidence,
    simulation: build.simulation,
    now: TEST_NOW,
  });
  assert.equal(eligibilityEvidence.venue, "pumpswap-migrated");

  const preview = {
    id: "00000000-0000-4000-8000-000000000020",
    status: "ready-for-review" as const,
    lifecycle: "proposal-only" as const,
    goal: "PumpSwap trade",
    side: "buy" as const,
    venue: "pumpswap-migrated" as const,
    walletAddress: WALLET,
    tokenMint: MINT,
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: MINT,
    inputAmount: "1000000",
    maxSolExposureLamports: "1000000",
    minimumOutputAmount: "100",
    maxSlippageBps: 300,
    deadlineAt: "2026-07-22T01:00:00.000Z",
    stopConditions: ["Stop on failure"],
    risk: { mintAuthority: null, freezeAuthority: null, top10ConcentrationPercent: 20, liquidityVerified: true, evidenceSlot: 500 },
    quote: null,
    checks: [{ code: "exact_mint_valid" as const, status: "pass" as const, message: "Exact mint bound" }],
    executionAllowed: false as const,
    createdAt: "2026-07-22T00:00:00.000Z",
  };
  const simulationEvidence = {
    ...build.simulation,
    simulatedAt: TEST_NOW.toISOString(),
    riskEvidence,
    eligibilityEvidence,
  };
  const simulation = {
    ...simulationEvidence,
    executionReadiness: evaluatePumpExecutionReadiness({
      sessionWalletAddress: WALLET,
      sessionTokenMint: MINT,
      preview,
      simulation: simulationEvidence,
      now: TEST_NOW,
    }),
  };

  const preparedService = new PumpPreparedExecutionService();

  const prepared = preparedService.prepare({
    sessionId: "00000000-0000-4000-8000-000000000001",
    preview,
    production: build,
    simulation,
    buildInput: input,
    now: TEST_NOW,
  });

  assert.equal(prepared.initialStateSlot, 500);
});
