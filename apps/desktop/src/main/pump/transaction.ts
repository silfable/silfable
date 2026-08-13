import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";

import { inspectPumpInstructionPlan, type PumpInstructionPlan } from "./inspector.js";

const ZERO_SIGNATURE = new Uint8Array(64);

export type PumpUnsignedTransactionInspection = {
  allowed: boolean;
  checks: Array<{ code: string; status: "pass" | "fail"; message: string }>;
  signerCount: number;
  instructionCount: number;
  addressLookupCount: number;
  serializedBytes: number;
};

export type PumpUnsignedTransactionArtifact = {
  transaction: VersionedTransaction;
  serializedBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  blockhashContextSlot: number;
  inspection: PumpUnsignedTransactionInspection;
  signed: false;
  simulated: false;
  broadcastAttempted: false;
};

export function buildAndInspectPumpUnsignedTransaction(input: {
  walletAddress: string;
  instruction: TransactionInstruction;
  plan: PumpInstructionPlan;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  blockhashContextSlot: number;
  minimumEvidenceSlot: number;
}): PumpUnsignedTransactionArtifact {
  validateBlockhashEvidence(input);
  const message = new TransactionMessage({
    payerKey: new PublicKey(input.walletAddress),
    recentBlockhash: input.recentBlockhash,
    instructions: [input.instruction],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  const serialized = transaction.serialize();
  const inspection = inspectPumpUnsignedTransaction({
    serialized,
    walletAddress: input.walletAddress,
    plan: input.plan,
    expectedBlockhash: input.recentBlockhash,
    expectedInstructionData: input.instruction.data,
  });
  if (!inspection.allowed) {
    const failure = inspection.checks.find((check) => check.status === "fail");
    throw new Error(`Pump unsigned transaction failed inspection${failure ? `: ${failure.code}` : ""}`);
  }
  return {
    transaction,
    serializedBase64: Buffer.from(serialized).toString("base64"),
    recentBlockhash: input.recentBlockhash,
    lastValidBlockHeight: input.lastValidBlockHeight,
    blockhashContextSlot: input.blockhashContextSlot,
    inspection,
    signed: false,
    simulated: false,
    broadcastAttempted: false,
  };
}

export function inspectPumpUnsignedTransaction(input: {
  serialized: Uint8Array;
  walletAddress: string;
  plan: PumpInstructionPlan;
  expectedBlockhash: string;
  expectedInstructionData: Uint8Array;
}): PumpUnsignedTransactionInspection {
  const checks: PumpUnsignedTransactionInspection["checks"] = [];
  let transaction: VersionedTransaction;
  try {
    transaction = VersionedTransaction.deserialize(input.serialized);
  } catch {
    add(checks, "decode", false, "Serialized transaction decodes as a Solana versioned transaction.");
    return result(checks, 0, 0, 0, input.serialized.length);
  }
  add(checks, "decode", true, "Serialized transaction decodes as a Solana versioned transaction.");
  add(checks, "version", transaction.message.version === 0, "Transaction uses the pinned v0 message format.");
  add(checks, "blockhash", transaction.message.recentBlockhash === input.expectedBlockhash, "Transaction is bound to the fetched finalized blockhash.");
  add(checks, "lookup_tables", transaction.message.addressTableLookups.length === 0, "Transaction contains no address lookup tables.");
  add(checks, "signer_count", transaction.message.header.numRequiredSignatures === 1 && transaction.signatures.length === 1, "Exactly one signature is required.");
  add(checks, "unsigned", transaction.signatures.length === 1 && equalBytes(transaction.signatures[0]!, ZERO_SIGNATURE), "The serialized transaction contains only the zero placeholder signature.");
  const payer = transaction.message.staticAccountKeys[0]?.toBase58();
  add(checks, "payer", payer === input.walletAddress, "The selected session wallet is the transaction payer and sole signer.");
  add(checks, "instruction_count", transaction.message.compiledInstructions.length === 1, "Transaction contains exactly one audited top-level instruction.");

  const decodedInstruction = transaction.message.compiledInstructions[0];
  if (decodedInstruction === undefined) {
    add(checks, "instruction", false, "Compiled Pump instruction is present.");
  } else {
    const program = transaction.message.staticAccountKeys[decodedInstruction.programIdIndex];
    const accountIndexes = [...decodedInstruction.accountKeyIndexes];
    const accounts = accountIndexes.map((index) => transaction.message.staticAccountKeys[index]);
    const keysComplete = accounts.every((account): account is PublicKey => account !== undefined);
    const reconstructed: PumpInstructionPlan = {
      ...input.plan,
      programId: program?.toBase58() ?? "",
      discriminator: [...decodedInstruction.data.subarray(0, 8)],
      accounts: input.plan.accounts.map((planned, index) => ({
        ...planned,
        address: accounts[index]?.toBase58() ?? "",
        signer: accountIndexes[index] === undefined ? false : transaction.message.isAccountSigner(accountIndexes[index]!),
        writable: accountIndexes[index] === undefined ? false : transaction.message.isAccountWritable(accountIndexes[index]!),
      })),
    };
    const instructionInspection = keysComplete && accounts.length === input.plan.accounts.length
      ? inspectPumpInstructionPlan(reconstructed)
      : null;
    add(checks, "instruction", instructionInspection?.allowed === true, "Decoded program, discriminator, account order, signer, writable, mint, and wallet bindings pass the pinned Pump inspector.");
    add(checks, "instruction_data", equalBytes(decodedInstruction.data, input.expectedInstructionData), "Serialized instruction data remains byte-for-byte identical to the audited builder output.");
  }
  return result(checks, transaction.message.header.numRequiredSignatures, transaction.message.compiledInstructions.length, transaction.message.addressTableLookups.length, input.serialized.length);
}

function validateBlockhashEvidence(input: {
  recentBlockhash: string;
  lastValidBlockHeight: number;
  blockhashContextSlot: number;
  minimumEvidenceSlot: number;
}): void {
  try { new PublicKey(input.recentBlockhash); } catch { throw new Error("Pump recent blockhash is invalid"); }
  if (!Number.isSafeInteger(input.lastValidBlockHeight) || input.lastValidBlockHeight < 1) throw new Error("Pump last valid block height is invalid");
  if (!Number.isSafeInteger(input.blockhashContextSlot) || input.blockhashContextSlot < input.minimumEvidenceSlot) {
    throw new Error("Pump blockhash predates the finalized state evidence");
  }
}

function result(checks: PumpUnsignedTransactionInspection["checks"], signerCount: number, instructionCount: number, addressLookupCount: number, serializedBytes: number): PumpUnsignedTransactionInspection {
  return { allowed: checks.every((check) => check.status === "pass"), checks, signerCount, instructionCount, addressLookupCount, serializedBytes };
}

function add(checks: PumpUnsignedTransactionInspection["checks"], code: string, passed: boolean, success: string): void {
  checks.push({ code, status: passed ? "pass" : "fail", message: passed ? success : `${success} Check failed.` });
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
