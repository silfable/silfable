import {
  bondingCurvePda,
  creatorVaultPda,
  feeSharingConfigPda,
  getPumpProgram,
  quoteAta,
  userVolumeAccumulatorPda,
} from "@pump-fun/pump-sdk";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";

import {
  inspectPumpInstructionPlan,
  pumpInstructionManifest,
  PUMP_IDL_REVISION,
  SOL_MINT,
  type PumpInspectionResult,
  type PumpInstructionPlan,
} from "./inspector.js";
import {
  resolvePumpV2FinalizedBuildEvidence,
  type PumpFinalizedAccountReader,
  type PumpV2FinalizedBuildEvidence,
} from "./state.js";
import { calculatePumpFeePreview, type PumpFeePreview } from "./fees.js";
import {
  buildAndInspectPumpUnsignedTransaction,
  type PumpUnsignedTransactionArtifact,
} from "./transaction.js";

const OFFLINE_CONNECTION = new Connection("http://127.0.0.1:8899", "finalized");
const RAW_AMOUNT_PATTERN = /^[1-9]\d*$/u;
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const MAX_U64 = 18_446_744_073_709_551_615n;

export type PumpV2InstructionBuildInput = {
  side: "buy" | "sell";
  walletAddress: string;
  tokenMint: string;
  tokenProgram: string;
  creator: string;
  feeRecipient: string;
  authorizedFeeRecipients: string[];
  buybackFeeRecipient: string;
  authorizedBuybackFeeRecipients: string[];
  inputAmount: string;
  minimumOutputAmount: string;
};

export type PumpV2InstructionBuild = {
  sdkVersion: "1.36.0";
  idlRevision: string;
  instruction: TransactionInstruction;
  plan: PumpInstructionPlan;
  inspection: PumpInspectionResult;
  transactionBuilt: false;
  signingAttempted: false;
  broadcastAttempted: false;
};

export type PumpV2FinalizedInstructionBuildInput = Pick<
  PumpV2InstructionBuildInput,
  "side" | "walletAddress" | "tokenMint" | "inputAmount" | "minimumOutputAmount"
> & { maxTotalFeeBps: number };

export type PumpV2FinalizedInstructionBuild = PumpV2InstructionBuild & {
  stateEvidence: PumpV2FinalizedBuildEvidence;
  feePreview: PumpFeePreview;
};

export type PumpFinalizedTransactionReader = PumpFinalizedAccountReader & {
  getLatestBlockhashAndContext(config: {
    commitment: "finalized";
    minContextSlot: number;
  }): Promise<{
    context: { slot: number };
    value: { blockhash: string; lastValidBlockHeight: number };
  }>;
};

export type PumpV2UnsignedTransactionBuild = Omit<PumpV2FinalizedInstructionBuild, "transactionBuilt"> & {
  transactionBuilt: true;
  unsignedTransaction: PumpUnsignedTransactionArtifact;
};

export async function buildAndInspectPumpV2UnsignedTransactionFromFinalizedState(
  reader: PumpFinalizedTransactionReader,
  input: PumpV2FinalizedInstructionBuildInput,
): Promise<PumpV2UnsignedTransactionBuild> {
  const build = await buildAndInspectPumpV2InstructionFromFinalizedState(reader, input);
  const blockhash = await reader.getLatestBlockhashAndContext({
    commitment: "finalized",
    minContextSlot: build.stateEvidence.slot,
  });
  const unsignedTransaction = buildAndInspectPumpUnsignedTransaction({
    walletAddress: input.walletAddress,
    instruction: build.instruction,
    plan: build.plan,
    recentBlockhash: blockhash.value.blockhash,
    lastValidBlockHeight: blockhash.value.lastValidBlockHeight,
    blockhashContextSlot: blockhash.context.slot,
    minimumEvidenceSlot: build.stateEvidence.slot,
  });
  return { ...build, transactionBuilt: true, unsignedTransaction };
}

export async function buildAndInspectPumpV2InstructionFromFinalizedState(
  reader: PumpFinalizedAccountReader,
  input: PumpV2FinalizedInstructionBuildInput,
): Promise<PumpV2FinalizedInstructionBuild> {
  const stateEvidence = await resolvePumpV2FinalizedBuildEvidence(reader, input.tokenMint);
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
  if (!feePreview.allowed) throw new Error("Pump finalized trading fees exceed the configured maximum");
  const { maxTotalFeeBps: _maxTotalFeeBps, ...instructionInput } = input;
  const build = await buildAndInspectPumpV2Instruction({
    ...instructionInput,
    tokenProgram: stateEvidence.tokenProgram,
    creator: stateEvidence.creator,
    feeRecipient,
    authorizedFeeRecipients: stateEvidence.feeRecipients,
    buybackFeeRecipient,
    authorizedBuybackFeeRecipients: stateEvidence.buybackFeeRecipients,
  });
  return { ...build, stateEvidence, feePreview };
}

export async function buildAndInspectPumpV2Instruction(input: PumpV2InstructionBuildInput): Promise<PumpV2InstructionBuild> {
  validateBuildInput(input);
  const user = new PublicKey(input.walletAddress);
  const mint = new PublicKey(input.tokenMint);
  const tokenProgram = new PublicKey(input.tokenProgram);
  const creator = new PublicKey(input.creator);
  const feeRecipient = new PublicKey(input.feeRecipient);
  const buybackFeeRecipient = new PublicKey(input.buybackFeeRecipient);
  const quoteMint = NATIVE_MINT;
  const quoteTokenProgram = TOKEN_PROGRAM_ID;
  const bondingCurve = bondingCurvePda(mint);
  const creatorVault = creatorVaultPda(creator);
  const userVolumeAccumulator = userVolumeAccumulatorPda(user);
  const associatedBaseUser = getAssociatedTokenAddressSync(mint, user, true, tokenProgram);
  const program = getPumpProgram(OFFLINE_CONNECTION);
  const accounts = {
    baseMint: mint,
    quoteMint,
    baseTokenProgram: tokenProgram,
    quoteTokenProgram,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    feeRecipient,
    associatedQuoteFeeRecipient: quoteAta(feeRecipient, quoteMint, quoteTokenProgram),
    buybackFeeRecipient,
    associatedQuoteBuybackFeeRecipient: quoteAta(buybackFeeRecipient, quoteMint, quoteTokenProgram),
    bondingCurve,
    associatedBaseBondingCurve: getAssociatedTokenAddressSync(mint, bondingCurve, true, tokenProgram),
    associatedQuoteBondingCurve: quoteAta(bondingCurve, quoteMint, quoteTokenProgram),
    user,
    associatedBaseUser,
    associatedQuoteUser: quoteAta(user, quoteMint, quoteTokenProgram),
    creatorVault,
    associatedCreatorVault: quoteAta(creatorVault, quoteMint, quoteTokenProgram),
    sharingConfig: feeSharingConfigPda(mint),
    userVolumeAccumulator,
    associatedUserVolumeAccumulator: quoteAta(userVolumeAccumulator, quoteMint, quoteTokenProgram),
  };
  const instruction = input.side === "buy"
    ? await program.methods.buyExactQuoteInV2(new BN(input.inputAmount), new BN(input.minimumOutputAmount)).accountsPartial(accounts).instruction()
    : await program.methods.sellV2(new BN(input.inputAmount), new BN(input.minimumOutputAmount)).accountsPartial(accounts).instruction();
  const manifest = pumpInstructionManifest("pump", input.side);
  const plan: PumpInstructionPlan = {
    venue: "pump",
    side: input.side,
    programId: instruction.programId.toBase58(),
    discriminator: [...instruction.data.subarray(0, 8)],
    tokenMint: input.tokenMint,
    quoteMint: SOL_MINT,
    walletAddress: input.walletAddress,
    accounts: manifest.roles.map((role, index) => {
      const meta = instruction.keys[index];
      if (meta === undefined) throw new Error(`Pump SDK omitted required account role ${role.name}`);
      return { role: role.name, address: meta.pubkey.toBase58(), signer: meta.isSigner, writable: meta.isWritable };
    }),
  };
  if (instruction.keys.length !== manifest.roles.length) throw new Error("Pump SDK returned an unaudited account count");
  const inspection = inspectPumpInstructionPlan(plan);
  if (!inspection.allowed) {
    const failed = inspection.checks.find((check) => check.status === "fail");
    throw new Error(`Pump v2 instruction failed the pinned inspector${failed ? `: ${failed.code}` : ""}`);
  }
  return {
    sdkVersion: "1.36.0",
    idlRevision: PUMP_IDL_REVISION,
    instruction,
    plan,
    inspection,
    transactionBuilt: false,
    signingAttempted: false,
    broadcastAttempted: false,
  };
}

function validateBuildInput(input: PumpV2InstructionBuildInput): void {
  for (const [name, address] of Object.entries({ walletAddress: input.walletAddress, tokenMint: input.tokenMint, creator: input.creator, feeRecipient: input.feeRecipient, buybackFeeRecipient: input.buybackFeeRecipient })) {
    if (!ADDRESS_PATTERN.test(address)) throw new Error(`Pump ${name} is invalid`);
  }
  if (input.tokenMint === SOL_MINT) throw new Error("Pump token mint cannot be SOL");
  if (input.tokenProgram !== TOKEN_PROGRAM_ID.toBase58() && input.tokenProgram !== TOKEN_2022_PROGRAM_ID.toBase58()) throw new Error("Pump token program is not allowlisted");
  if (!input.authorizedFeeRecipients.includes(input.feeRecipient)) throw new Error("Pump fee recipient is not present in finalized Global state");
  if (!input.authorizedBuybackFeeRecipients.includes(input.buybackFeeRecipient)) throw new Error("Pump buyback fee recipient is not present in finalized Global state");
  for (const [name, amount] of Object.entries({ inputAmount: input.inputAmount, minimumOutputAmount: input.minimumOutputAmount })) {
    if (!RAW_AMOUNT_PATTERN.test(amount) || BigInt(amount) > MAX_U64) throw new Error(`Pump ${name} is not a positive u64 amount`);
  }
}
