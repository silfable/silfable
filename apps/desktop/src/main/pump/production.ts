import {
  encodeAndInspectPumpV2Instruction,
  type PumpV2EncodedInstruction,
} from "./codec.js";
import { calculatePumpFeePreview, type PumpFeePreview } from "./fees.js";
import { derivePumpExecutableQuote, type PumpExecutableQuoteEvidence } from "./quote.js";
import {
  resolvePumpV2FinalizedBuildEvidence,
  type PumpFinalizedAccountReader,
  type PumpV2FinalizedBuildEvidence,
} from "./state.js";
import {
  simulatePumpKitUnsignedTransaction,
  type PumpKitSimulationRpc,
} from "./simulation-kit.js";
import { PumpSimulationArtifactSchema, type PumpSimulationArtifact } from "@silfable/contracts";
import {
  buildAndInspectPumpKitUnsignedTransaction,
  type PumpKitUnsignedTransactionArtifact,
} from "./transaction-codec.js";

export type PumpKitFinalizedTransactionReader = PumpFinalizedAccountReader & {
  getLatestBlockhashAndContext(config: {
    commitment: "finalized";
    minContextSlot: number;
  }): Promise<{
    context: { slot: number };
    value: { blockhash: string; lastValidBlockHeight: number };
  }>;
};

export type PumpV2ProductionBuildInput = {
  side: "buy" | "sell";
  walletAddress: string;
  tokenMint: string;
  inputAmount: string;
  minimumOutputAmount: string;
  maxTotalFeeBps: number;
};

export type PumpV2ProductionUnsignedBuild = {
  codec: "silfable-pump-v2";
  stateEvidence: PumpV2FinalizedBuildEvidence;
  feePreview: PumpFeePreview;
  instruction: PumpV2EncodedInstruction;
  unsignedTransaction: PumpKitUnsignedTransactionArtifact;
  signingAttempted: false;
  broadcastAttempted: false;
};

export type PumpV2ProductionSimulationInput = PumpV2ProductionBuildInput & {
  maxSlippageBps: number;
  maxNetworkFeeLamports: number;
  maxFeePercent: number;
};

export type PumpV2ProductionSimulation = PumpV2ProductionUnsignedBuild & {
  executableQuote: PumpExecutableQuoteEvidence;
  simulation: PumpSimulationArtifact;
};

export async function buildPumpV2ProductionUnsignedTransaction(
  reader: PumpKitFinalizedTransactionReader,
  input: PumpV2ProductionBuildInput,
): Promise<PumpV2ProductionUnsignedBuild> {
  const evidence = await resolvePumpV2FinalizedBuildEvidence(reader, input.tokenMint);
  return buildPumpV2ProductionUnsignedTransactionFromEvidence(reader, input, evidence);
}

export async function buildPumpV2ProductionUnsignedTransactionFromEvidence(
  reader: Pick<PumpKitFinalizedTransactionReader, "getLatestBlockhashAndContext">,
  input: PumpV2ProductionBuildInput,
  stateEvidence: PumpV2FinalizedBuildEvidence,
): Promise<PumpV2ProductionUnsignedBuild> {
  if (stateEvidence.mint !== input.tokenMint) {
    throw new Error("Pump finalized evidence does not match the requested token mint");
  }
  const feeRecipient = stateEvidence.feeRecipients[0];
  const buybackFeeRecipient = stateEvidence.buybackFeeRecipients[0];
  if (feeRecipient === undefined || buybackFeeRecipient === undefined) {
    throw new Error("Pump finalized fee-recipient evidence is incomplete");
  }
  const feePreview = calculatePumpFeePreview({
    side: input.side,
    rawInputAmount: input.inputAmount,
    maxTotalFeeBps: input.maxTotalFeeBps,
    evidence: stateEvidence,
  });
  if (!feePreview.allowed) {
    throw new Error("Pump finalized trading fees exceed the configured maximum");
  }
  const instruction = await encodeAndInspectPumpV2Instruction({
    side: input.side,
    walletAddress: input.walletAddress,
    tokenMint: input.tokenMint,
    tokenProgram: stateEvidence.tokenProgram,
    creator: stateEvidence.creator,
    feeRecipient,
    authorizedFeeRecipients: stateEvidence.feeRecipients,
    buybackFeeRecipient,
    authorizedBuybackFeeRecipients: stateEvidence.buybackFeeRecipients,
    inputAmount: input.inputAmount,
    minimumOutputAmount: input.minimumOutputAmount,
  });
  const blockhash = await reader.getLatestBlockhashAndContext({
    commitment: "finalized",
    minContextSlot: stateEvidence.slot,
  });
  const unsignedTransaction = buildAndInspectPumpKitUnsignedTransaction({
    walletAddress: input.walletAddress,
    instruction,
    recentBlockhash: blockhash.value.blockhash,
    lastValidBlockHeight: blockhash.value.lastValidBlockHeight,
    blockhashContextSlot: blockhash.context.slot,
    minimumEvidenceSlot: stateEvidence.slot,
  });
  return {
    codec: "silfable-pump-v2",
    stateEvidence,
    feePreview,
    instruction,
    unsignedTransaction,
    signingAttempted: false,
    broadcastAttempted: false,
  };
}

export async function buildAndSimulatePumpV2ProductionTransaction(
  rpc: PumpKitFinalizedTransactionReader & PumpKitSimulationRpc,
  input: PumpV2ProductionSimulationInput,
): Promise<PumpV2ProductionSimulation> {
  const evidence = await resolvePumpV2FinalizedBuildEvidence(rpc, input.tokenMint);
  return buildAndSimulatePumpV2ProductionTransactionFromEvidence(rpc, input, evidence);
}

export async function buildAndSimulatePumpV2ProductionTransactionFromEvidence(
  rpc: Pick<PumpKitFinalizedTransactionReader, "getLatestBlockhashAndContext"> & PumpKitSimulationRpc,
  input: PumpV2ProductionSimulationInput,
  evidence: PumpV2FinalizedBuildEvidence,
): Promise<PumpV2ProductionSimulation> {
  const feePreview = calculatePumpFeePreview({ side: input.side, rawInputAmount: input.inputAmount, maxTotalFeeBps: input.maxTotalFeeBps, evidence });
  if (!feePreview.allowed) throw new Error("Pump finalized trading fees exceed the configured maximum");
  const executableQuote = derivePumpExecutableQuote({
    side: input.side,
    inputAmount: input.inputAmount,
    approvedMinimumOutputAmount: input.minimumOutputAmount,
    maxSlippageBps: input.maxSlippageBps,
    evidence,
    feePreview,
  });
  const build = await buildPumpV2ProductionUnsignedTransactionFromEvidence(rpc, {
    ...input,
    minimumOutputAmount: executableQuote.minimumOutputAmount,
  }, evidence);
  return simulateProductionBuild(rpc, input, build, executableQuote);
}

async function simulateProductionBuild(
  rpc: PumpKitSimulationRpc,
  input: PumpV2ProductionSimulationInput,
  build: PumpV2ProductionUnsignedBuild,
  executableQuote: PumpExecutableQuoteEvidence,
): Promise<PumpV2ProductionSimulation> {
  const rawSimulation = await simulatePumpKitUnsignedTransaction({
    rpc,
    transaction: build.unsignedTransaction,
    instructionData: build.instruction.data,
    plan: build.instruction.plan,
    evidence: build.stateEvidence,
    feePreview: build.feePreview,
    maxNetworkFeeLamports: input.maxNetworkFeeLamports,
    maxFeePercent: input.maxFeePercent,
  });
  const simulation = PumpSimulationArtifactSchema.parse({ ...rawSimulation, quoteEvidence: executableQuote });
  return { ...build, executableQuote, simulation };
}
