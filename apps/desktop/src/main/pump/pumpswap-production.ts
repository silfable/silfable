import {
  encodeAndInspectPumpSwapInstruction,
  type PumpSwapEncodedInstruction,
} from "./pumpswap-codec.js";
import { calculatePumpFeePreview, type PumpFeePreview } from "./fees.js";
import { derivePumpExecutableQuote, type PumpExecutableQuoteEvidence } from "./quote.js";
import {
  resolvePumpSwapFinalizedBuildEvidence,
  type PumpSwapFinalizedAccountReader,
  type PumpSwapFinalizedBuildEvidence,
} from "./pumpswap-state.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";
import {
  simulatePumpKitUnsignedTransaction,
  type PumpKitSimulationRpc,
} from "./simulation-kit.js";
import { PumpSimulationArtifactSchema, type PumpSimulationArtifact } from "@silfable/contracts";
import {
  buildAndInspectPumpKitUnsignedTransaction,
  type PumpKitUnsignedTransactionArtifact,
} from "./transaction-codec.js";
import { getProgramDerivedAddress, address, getAddressEncoder } from "@solana/kit";

const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const textEncoder = new TextEncoder();
const addressEncoder = getAddressEncoder();

export type PumpSwapKitFinalizedTransactionReader = PumpSwapFinalizedAccountReader & {
  getLatestBlockhashAndContext(config: {
    commitment: "finalized";
    minContextSlot: number;
  }): Promise<{
    context: { slot: number };
    value: { blockhash: string; lastValidBlockHeight: number };
  }>;
};

export type PumpSwapProductionBuildInput = {
  side: "buy" | "sell";
  walletAddress: string;
  tokenMint: string;
  inputAmount: string;
  minimumOutputAmount: string;
  maxTotalFeeBps: number;
};

export type PumpSwapProductionUnsignedBuild = {
  codec: "silfable-pumpswap";
  stateEvidence: PumpSwapFinalizedBuildEvidence;
  feePreview: PumpFeePreview;
  instruction: PumpSwapEncodedInstruction;
  unsignedTransaction: PumpKitUnsignedTransactionArtifact;
  signingAttempted: false;
  broadcastAttempted: false;
};

export type PumpSwapProductionSimulationInput = PumpSwapProductionBuildInput & {
  maxSlippageBps: number;
  maxNetworkFeeLamports: number;
  maxFeePercent: number;
};

export type PumpSwapProductionSimulation = PumpSwapProductionUnsignedBuild & {
  executableQuote: PumpExecutableQuoteEvidence;
  simulation: PumpSimulationArtifact;
};

export function pumpSwapEvidenceForPolicy(
  evidence: PumpSwapFinalizedBuildEvidence,
): PumpV2FinalizedBuildEvidence {
  return {
    mint: evidence.mint,
    tokenProgram: evidence.tokenProgram,
    creator: evidence.coinCreatorVaultAuthority,
    mintSecurity: evidence.mintSecurity,
    feeRecipients: [evidence.protocolFeeRecipient],
    buybackFeeRecipients: [evidence.protocolFeeRecipient],
    curve: {
      virtualTokenReserves: evidence.baseReserves,
      virtualQuoteReserves: evidence.quoteReserves,
      realTokenReserves: evidence.baseReserves,
      tokenTotalSupply: "1000000000000000",
      mayhemMode: false,
    },
    slot: evidence.slot,
    commitment: evidence.commitment,
    verifiedAt: evidence.verifiedAt,
    feeSchedule: {
      source: "global-fallback",
      protocolFeeBps: evidence.feeSchedule.protocolFeeBps,
      creatorFeeBps: evidence.feeSchedule.creatorFeeBps,
      buybackAllocationBps: evidence.feeSchedule.buybackAllocationBps,
      tiers: [],
    },
  };
}

export async function buildPumpSwapProductionUnsignedTransaction(
  reader: PumpSwapKitFinalizedTransactionReader,
  input: PumpSwapProductionBuildInput,
): Promise<PumpSwapProductionUnsignedBuild> {
  const evidence = await resolvePumpSwapFinalizedBuildEvidence(reader, input.tokenMint);
  return buildPumpSwapProductionUnsignedTransactionFromEvidence(reader, input, evidence);
}

export async function buildPumpSwapProductionUnsignedTransactionFromEvidence(
  reader: Pick<PumpSwapKitFinalizedTransactionReader, "getLatestBlockhashAndContext">,
  input: PumpSwapProductionBuildInput,
  stateEvidence: PumpSwapFinalizedBuildEvidence,
): Promise<PumpSwapProductionUnsignedBuild> {
  if (stateEvidence.mint !== input.tokenMint) {
    throw new Error("PumpSwap finalized evidence does not match the requested token mint");
  }

  const feePreview = calculatePumpFeePreview({
    side: input.side,
    rawInputAmount: input.inputAmount,
    maxTotalFeeBps: input.maxTotalFeeBps,
    evidence: {
      mint: stateEvidence.mint,
      tokenProgram: stateEvidence.tokenProgram,
      creator: stateEvidence.coinCreatorVaultAuthority,
      mintSecurity: stateEvidence.mintSecurity,
      feeRecipients: [stateEvidence.protocolFeeRecipient],
      buybackFeeRecipients: [stateEvidence.protocolFeeRecipient],
      curve: {
        virtualTokenReserves: stateEvidence.baseReserves,
        virtualQuoteReserves: stateEvidence.quoteReserves,
        realTokenReserves: stateEvidence.baseReserves,
        tokenTotalSupply: "1000000000000000",
        mayhemMode: false,
      },
      slot: stateEvidence.slot,
      commitment: stateEvidence.commitment,
      verifiedAt: stateEvidence.verifiedAt,
      feeSchedule: {
        source: "global-fallback",
        protocolFeeBps: stateEvidence.feeSchedule.protocolFeeBps,
        creatorFeeBps: stateEvidence.feeSchedule.creatorFeeBps,
        buybackAllocationBps: stateEvidence.feeSchedule.buybackAllocationBps,
        tiers: [],
      },
    },
  });

  if (!feePreview.allowed) {
    throw new Error("PumpSwap finalized trading fees exceed the configured maximum");
  }

  const userBaseTokenAccount = await deriveAta(input.walletAddress, input.tokenMint, stateEvidence.tokenProgram);
  const userQuoteTokenAccount = await deriveAta(input.walletAddress, SOL_MINT, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

  const instruction = await encodeAndInspectPumpSwapInstruction({
    side: input.side,
    walletAddress: input.walletAddress,
    tokenMint: input.tokenMint,
    tokenProgram: stateEvidence.tokenProgram,
    pool: stateEvidence.pool,
    userBaseTokenAccount,
    userQuoteTokenAccount,
    poolBaseTokenAccount: stateEvidence.baseVault,
    poolQuoteTokenAccount: stateEvidence.quoteVault,
    protocolFeeRecipient: stateEvidence.protocolFeeRecipient,
    protocolFeeRecipientTokenAccount: stateEvidence.protocolFeeRecipientTokenAccount,
    coinCreatorVaultAta: stateEvidence.coinCreatorVaultAta,
    coinCreatorVaultAuthority: stateEvidence.coinCreatorVaultAuthority,
    inputAmount: input.inputAmount,
    minimumOutputAmount: input.minimumOutputAmount,
  });

  const blockhashResponse = await reader.getLatestBlockhashAndContext({
    commitment: "finalized",
    minContextSlot: stateEvidence.slot,
  });
  if (blockhashResponse.context.slot < stateEvidence.slot) {
    throw new Error("Blockhash context slot is older than finalized state evidence");
  }

  const unsignedTransaction = await buildAndInspectPumpKitUnsignedTransaction({
    walletAddress: input.walletAddress,
    instruction: instruction as any,
    recentBlockhash: blockhashResponse.value.blockhash,
    lastValidBlockHeight: blockhashResponse.value.lastValidBlockHeight,
    blockhashContextSlot: blockhashResponse.context.slot,
    minimumEvidenceSlot: stateEvidence.slot,
  });

  return {
    codec: "silfable-pumpswap",
    stateEvidence,
    feePreview,
    instruction,
    unsignedTransaction,
    signingAttempted: false,
    broadcastAttempted: false,
  };
}

export async function buildAndSimulatePumpSwapProductionTransactionFromEvidence(
  rpc: PumpSwapKitFinalizedTransactionReader & PumpKitSimulationRpc,
  input: PumpSwapProductionSimulationInput,
  stateEvidence: PumpSwapFinalizedBuildEvidence,
): Promise<PumpSwapProductionSimulation> {
  const build = await buildPumpSwapProductionUnsignedTransactionFromEvidence(
    rpc,
    input,
    stateEvidence,
  );

  const executableQuote = derivePumpExecutableQuote({
    side: input.side,
    inputAmount: input.inputAmount,
    approvedMinimumOutputAmount: input.minimumOutputAmount,
    maxSlippageBps: input.maxSlippageBps,
    feePreview: build.feePreview,
    evidence: {
      mint: stateEvidence.mint,
      tokenProgram: stateEvidence.tokenProgram,
      creator: stateEvidence.coinCreatorVaultAuthority,
      mintSecurity: stateEvidence.mintSecurity,
      feeRecipients: [stateEvidence.protocolFeeRecipient],
      buybackFeeRecipients: [stateEvidence.protocolFeeRecipient],
      curve: {
        virtualTokenReserves: stateEvidence.baseReserves,
        virtualQuoteReserves: stateEvidence.quoteReserves,
        realTokenReserves: stateEvidence.baseReserves,
        tokenTotalSupply: "1000000000000000",
        mayhemMode: false,
      },
      slot: stateEvidence.slot,
      commitment: stateEvidence.commitment,
      verifiedAt: stateEvidence.verifiedAt,
      feeSchedule: {
        source: "global-fallback",
        protocolFeeBps: stateEvidence.feeSchedule.protocolFeeBps,
        creatorFeeBps: stateEvidence.feeSchedule.creatorFeeBps,
        buybackAllocationBps: stateEvidence.feeSchedule.buybackAllocationBps,
        tiers: [],
      },
    },
  });

  const simulation = await simulatePumpKitUnsignedTransaction({
    rpc,
    transaction: build.unsignedTransaction,
    instructionData: build.instruction.data,
    plan: build.instruction.plan,
    evidence: {
      mint: stateEvidence.mint,
      tokenProgram: stateEvidence.tokenProgram,
      creator: stateEvidence.coinCreatorVaultAuthority,
      mintSecurity: stateEvidence.mintSecurity,
      feeRecipients: [stateEvidence.protocolFeeRecipient],
      buybackFeeRecipients: [stateEvidence.protocolFeeRecipient],
      curve: {
        virtualTokenReserves: stateEvidence.baseReserves,
        virtualQuoteReserves: stateEvidence.quoteReserves,
        realTokenReserves: stateEvidence.baseReserves,
        tokenTotalSupply: "1000000000000000",
        mayhemMode: false,
      },
      slot: stateEvidence.slot,
      commitment: stateEvidence.commitment,
      verifiedAt: stateEvidence.verifiedAt,
      feeSchedule: {
        source: "global-fallback",
        protocolFeeBps: stateEvidence.feeSchedule.protocolFeeBps,
        creatorFeeBps: stateEvidence.feeSchedule.creatorFeeBps,
        buybackAllocationBps: stateEvidence.feeSchedule.buybackAllocationBps,
        tiers: [],
      },
    },
    feePreview: build.feePreview,
    maxNetworkFeeLamports: input.maxNetworkFeeLamports,
    maxFeePercent: input.maxFeePercent,
  });

  return {
    ...build,
    executableQuote,
    simulation,
  };
}

export async function buildAndSimulatePumpSwapProductionTransaction(
  rpc: PumpSwapKitFinalizedTransactionReader & PumpKitSimulationRpc,
  input: PumpSwapProductionSimulationInput,
): Promise<PumpSwapProductionSimulation> {
  const evidence = await resolvePumpSwapFinalizedBuildEvidence(rpc, input.tokenMint);
  return buildAndSimulatePumpSwapProductionTransactionFromEvidence(rpc, input, evidence);
}

async function deriveAta(walletAddress: string, mintAddress: string, tokenProgram: string): Promise<string> {
  const [ata] = await getProgramDerivedAddress({
    programAddress: address(ASSOCIATED_TOKEN_PROGRAM_ID),
    seeds: [
      addressEncoder.encode(address(walletAddress)),
      addressEncoder.encode(address(tokenProgram)),
      addressEncoder.encode(address(mintAddress)),
    ],
  });
  return ata;
}
