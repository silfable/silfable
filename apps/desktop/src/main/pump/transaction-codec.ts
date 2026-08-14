import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";

import { inspectPumpInstructionPlan, type PumpInstructionPlan } from "./inspector.js";
import type { PumpV2EncodedInstruction } from "./codec.js";

export type PumpKitUnsignedTransactionInspection = {
  allowed: boolean;
  checks: Array<{ code: string; status: "pass" | "fail"; message: string }>;
  signerCount: number;
  instructionCount: number;
  addressLookupCount: number;
  serializedBytes: number;
};

export type PumpKitUnsignedTransactionArtifact = {
  serialized: Uint8Array;
  serializedBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  blockhashContextSlot: number;
  inspection: PumpKitUnsignedTransactionInspection;
  signed: false;
  simulated: false;
  broadcastAttempted: false;
};

export function buildAndInspectPumpKitUnsignedTransaction(input: {
  walletAddress: string;
  instruction: PumpV2EncodedInstruction;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  blockhashContextSlot: number;
  minimumEvidenceSlot: number;
}): PumpKitUnsignedTransactionArtifact {
  validateBlockhashEvidence(input);
  if (input.instruction.plan.walletAddress !== input.walletAddress) {
    throw new Error("Pump codec wallet does not match the transaction payer");
  }
  const instruction = {
    programAddress: address(input.instruction.programAddress),
    accounts: input.instruction.plan.accounts.map((account) => ({
      address: address(account.address),
      role: accountRole(account.signer, account.writable),
    })),
    data: input.instruction.data,
  };
  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (message) => setTransactionMessageFeePayer(address(input.walletAddress), message),
    (message) => setTransactionMessageLifetimeUsingBlockhash({
      blockhash: blockhash(input.recentBlockhash),
      lastValidBlockHeight: BigInt(input.lastValidBlockHeight),
    }, message),
    (message) => appendTransactionMessageInstruction(instruction, message),
  );
  const serialized = Uint8Array.from(getTransactionEncoder().encode(
    compileTransaction(transactionMessage),
  ));
  const inspection = inspectPumpKitUnsignedTransaction({
    serialized,
    walletAddress: input.walletAddress,
    plan: input.instruction.plan,
    expectedBlockhash: input.recentBlockhash,
    expectedInstructionData: input.instruction.data,
  });
  if (!inspection.allowed) {
    const failure = inspection.checks.find((check) => check.status === "fail");
    throw new Error(
      `Pump Kit unsigned transaction failed inspection${failure ? `: ${failure.code}` : ""}`,
    );
  }
  return {
    serialized,
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

export function inspectPumpKitUnsignedTransaction(input: {
  serialized: Uint8Array;
  walletAddress: string;
  plan: PumpInstructionPlan;
  expectedBlockhash: string;
  expectedInstructionData: Uint8Array;
}): PumpKitUnsignedTransactionInspection {
  const checks: PumpKitUnsignedTransactionInspection["checks"] = [];
  let decoded: ReturnType<ReturnType<typeof getTransactionDecoder>["decode"]>;
  try {
    decoded = getTransactionDecoder().decode(input.serialized);
  } catch {
    add(checks, "decode", false, "Serialized transaction decodes as a Solana transaction.");
    return result(checks, 0, 0, 0, input.serialized.length);
  }
  add(checks, "decode", true, "Serialized transaction decodes as a Solana transaction.");
  const message = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
  const signatures = Object.entries(decoded.signatures);
  const lookupCount = message.version === 0 ? message.addressTableLookups?.length ?? 0 : 0;
  add(checks, "version", message.version === 0, "Transaction uses the pinned v0 message format.");
  add(checks, "blockhash", String(message.lifetimeToken) === input.expectedBlockhash, "Transaction is bound to the fetched finalized blockhash.");
  add(checks, "lookup_tables", lookupCount === 0, "Transaction contains no address lookup tables.");
  add(checks, "signer_count", message.header.numSignerAccounts === 1 && signatures.length === 1, "Exactly one signature is required.");
  add(checks, "unsigned", signatures.length === 1 && signatures[0]?.[1] === null, "The transaction signature remains empty.");
  add(checks, "payer", String(message.staticAccounts[0]) === input.walletAddress, "The selected wallet is the transaction payer and sole signer.");
  if (message.version !== 0) {
    add(checks, "instruction_count", false, "Transaction contains exactly one audited top-level instruction.");
    add(checks, "instruction", false, "Compiled Pump instruction is present.");
    add(checks, "instruction_data", false, "Serialized instruction data remains byte-for-byte identical.");
    return result(checks, message.header.numSignerAccounts, 0, lookupCount, input.serialized.length);
  }
  add(checks, "instruction_count", message.instructions.length === 1, "Transaction contains exactly one audited top-level instruction.");

  const compiled = message.instructions[0];
  if (compiled === undefined) {
    add(checks, "instruction", false, "Compiled Pump instruction is present.");
    add(checks, "instruction_data", false, "Serialized instruction data remains byte-for-byte identical.");
  } else {
    const program = message.staticAccounts[compiled.programAddressIndex];
    const indexes = compiled.accountIndices ?? [];
    const reconstructed: PumpInstructionPlan = {
      ...input.plan,
      programId: program === undefined ? "" : String(program),
      discriminator: [...(compiled.data ?? new Uint8Array()).subarray(0, 8)],
      accounts: input.plan.accounts.map((planned, index) => {
        const accountIndex = indexes[index];
        return {
          ...planned,
          address: accountIndex === undefined ? "" : String(message.staticAccounts[accountIndex] ?? ""),
          signer: accountIndex === undefined ? false : isSigner(message, accountIndex),
          writable: accountIndex === undefined ? false : isWritable(message, accountIndex),
        };
      }),
    };
    add(checks, "instruction", indexes.length === input.plan.accounts.length && inspectPumpInstructionPlan(reconstructed).allowed, "Decoded program and account bindings pass the pinned Pump inspector.");
    add(checks, "instruction_data", equalBytes(compiled.data ?? new Uint8Array(), input.expectedInstructionData), "Serialized instruction data remains byte-for-byte identical to the local codec output.");
  }
  return result(checks, message.header.numSignerAccounts, message.instructions.length, lookupCount, input.serialized.length);
}

function accountRole(signer: boolean, writable: boolean): AccountRole {
  if (signer && writable) return AccountRole.WRITABLE_SIGNER;
  if (signer) return AccountRole.READONLY_SIGNER;
  if (writable) return AccountRole.WRITABLE;
  return AccountRole.READONLY;
}

function isSigner(
  message: ReturnType<ReturnType<typeof getCompiledTransactionMessageDecoder>["decode"]>,
  accountIndex: number,
): boolean {
  return accountIndex < message.header.numSignerAccounts;
}

function isWritable(
  message: ReturnType<ReturnType<typeof getCompiledTransactionMessageDecoder>["decode"]>,
  accountIndex: number,
): boolean {
  if (accountIndex < message.header.numSignerAccounts) {
    return accountIndex < message.header.numSignerAccounts - message.header.numReadonlySignerAccounts;
  }
  return accountIndex < message.staticAccounts.length - message.header.numReadonlyNonSignerAccounts;
}

function validateBlockhashEvidence(input: {
  recentBlockhash: string;
  lastValidBlockHeight: number;
  blockhashContextSlot: number;
  minimumEvidenceSlot: number;
}): void {
  try {
    blockhash(input.recentBlockhash);
  } catch {
    throw new Error("Pump recent blockhash is invalid");
  }
  if (!Number.isSafeInteger(input.lastValidBlockHeight) || input.lastValidBlockHeight < 1) {
    throw new Error("Pump last valid block height is invalid");
  }
  if (!Number.isSafeInteger(input.blockhashContextSlot) || input.blockhashContextSlot < input.minimumEvidenceSlot) {
    throw new Error("Pump blockhash predates the finalized state evidence");
  }
}

function result(
  checks: PumpKitUnsignedTransactionInspection["checks"],
  signerCount: number,
  instructionCount: number,
  addressLookupCount: number,
  serializedBytes: number,
): PumpKitUnsignedTransactionInspection {
  return {
    allowed: checks.every((check) => check.status === "pass"),
    checks,
    signerCount,
    instructionCount,
    addressLookupCount,
    serializedBytes,
  };
}

function add(
  checks: PumpKitUnsignedTransactionInspection["checks"],
  code: string,
  passed: boolean,
  message: string,
): void {
  checks.push({ code, status: passed ? "pass" : "fail", message: passed ? message : `${message} Check failed.` });
}

function equalBytes(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
