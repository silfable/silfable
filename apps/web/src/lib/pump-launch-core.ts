import { createHash } from "node:crypto";

import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const MAYHEM_PROGRAM_ID = new PublicKey("MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e");
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
export const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey("ComputeBudget111111111111111111111111111111");
export const PUMP_CREATE_V2_DISCRIMINATOR = Uint8Array.from([214, 144, 76, 236, 95, 139, 49, 180]);
export const PUMP_LAUNCH_COMPUTE_LIMIT = 300_000;

export const PUMP_LAUNCH_ALLOWED_PROGRAMS = new Set([
  PUMP_PROGRAM_ID.toBase58(),
  MAYHEM_PROGRAM_ID.toBase58(),
  TOKEN_2022_PROGRAM_ID.toBase58(),
  ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
  SYSTEM_PROGRAM_ID.toBase58(),
  COMPUTE_BUDGET_PROGRAM_ID.toBase58(),
]);

export type PumpLaunchBuildInput = {
  creatorWallet: string;
  mintAddress: string;
  name: string;
  symbol: string;
  metadataUri: string;
  recentBlockhash: string;
  priorityFeeLamports: bigint;
};

export function buildPumpLaunchTransaction(input: PumpLaunchBuildInput): {
  transaction: VersionedTransaction;
  writableAddresses: string[];
} {
  const creator = new PublicKey(input.creatorWallet);
  const mint = new PublicKey(input.mintAddress);
  const [mintAuthority] = PublicKey.findProgramAddressSync([Buffer.from("mint-authority")], PUMP_PROGRAM_ID);
  const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP_PROGRAM_ID);
  const [associatedBondingCurve] = PublicKey.findProgramAddressSync(
    [bondingCurve.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const [global] = PublicKey.findProgramAddressSync([Buffer.from("global")], PUMP_PROGRAM_ID);
  const [globalParams] = PublicKey.findProgramAddressSync([Buffer.from("global-params")], MAYHEM_PROGRAM_ID);
  const [solVault] = PublicKey.findProgramAddressSync([Buffer.from("sol-vault")], MAYHEM_PROGRAM_ID);
  const [mayhemState] = PublicKey.findProgramAddressSync([Buffer.from("mayhem-state"), mint.toBuffer()], MAYHEM_PROGRAM_ID);
  const [mayhemTokenVault] = PublicKey.findProgramAddressSync(
    [solVault.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const [eventAuthority] = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], PUMP_PROGRAM_ID);

  const createInstruction = new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: [
      { pubkey: mint, isSigner: true, isWritable: true },
      { pubkey: mintAuthority, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: global, isSigner: false, isWritable: false },
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MAYHEM_PROGRAM_ID, isSigner: false, isWritable: true },
      { pubkey: globalParams, isSigner: false, isWritable: false },
      { pubkey: solVault, isSigner: false, isWritable: true },
      { pubkey: mayhemState, isSigner: false, isWritable: true },
      { pubkey: mayhemTokenVault, isSigner: false, isWritable: true },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: encodeCreateV2Data(input),
  });
  const microLamports = priorityMicroLamports(input.priorityFeeLamports);
  const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: PUMP_LAUNCH_COMPUTE_LIMIT })];
  if (microLamports > 0) instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
  instructions.push(createInstruction);
  const message = new TransactionMessage({ payerKey: creator, recentBlockhash: input.recentBlockhash, instructions }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  inspectPumpLaunchTransaction(transaction, input.creatorWallet, input.mintAddress);
  return {
    transaction,
    writableAddresses: [...new Set(createInstruction.keys.filter((key) => key.isWritable).map((key) => key.pubkey.toBase58()))],
  };
}

export function inspectPumpLaunchTransaction(
  transaction: VersionedTransaction,
  expectedCreator?: string,
  expectedMint?: string,
): { creatorWallet: string; mintAddress: string } {
  if (transaction.message.version !== 0 || transaction.message.addressTableLookups.length !== 0) {
    throw new Error("Token launch transaction must be a lookup-free v0 transaction.");
  }
  const keys = transaction.message.staticAccountKeys;
  const header = transaction.message.header;
  if (header.numRequiredSignatures !== 2 || transaction.signatures.length !== 2) {
    throw new Error("Token launch must require exactly the creator and mint signatures.");
  }
  const creatorWallet = keys[0]?.toBase58();
  const mintAddress = keys[1]?.toBase58();
  if (!creatorWallet || !mintAddress || (expectedCreator && creatorWallet !== expectedCreator) || (expectedMint && mintAddress !== expectedMint)) {
    throw new Error("Token launch signer binding is invalid.");
  }
  const instructions = transaction.message.compiledInstructions;
  const create = instructions.at(-1);
  if (!create || keys[create.programIdIndex]?.toBase58() !== PUMP_PROGRAM_ID.toBase58()) {
    throw new Error("Token launch is not bound to the pinned Pump.fun program.");
  }
  if (create.accountKeyIndexes.length !== 16 || !equalBytes(create.data.subarray(0, 8), PUMP_CREATE_V2_DISCRIMINATOR)) {
    throw new Error("Pump.fun create_v2 instruction layout changed.");
  }
  const decompiled = TransactionMessage.decompile(transaction.message);
  if (decompiled.instructions.slice(0, -1).some((instruction) => !instruction.programId.equals(COMPUTE_BUDGET_PROGRAM_ID))) {
    throw new Error("Token launch contains a non-allowlisted outer instruction.");
  }
  const decodedCreate = decompiled.instructions.at(-1);
  if (!decodedCreate || decodedCreate.keys.length !== 16) throw new Error("Pump.fun create_v2 account layout changed.");
  const creator = new PublicKey(creatorWallet);
  const mint = new PublicKey(mintAddress);
  const [mintAuthority] = PublicKey.findProgramAddressSync([Buffer.from("mint-authority")], PUMP_PROGRAM_ID);
  const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP_PROGRAM_ID);
  const [associatedBondingCurve] = PublicKey.findProgramAddressSync([bondingCurve.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID);
  const [global] = PublicKey.findProgramAddressSync([Buffer.from("global")], PUMP_PROGRAM_ID);
  const [globalParams] = PublicKey.findProgramAddressSync([Buffer.from("global-params")], MAYHEM_PROGRAM_ID);
  const [solVault] = PublicKey.findProgramAddressSync([Buffer.from("sol-vault")], MAYHEM_PROGRAM_ID);
  const [mayhemState] = PublicKey.findProgramAddressSync([Buffer.from("mayhem-state"), mint.toBuffer()], MAYHEM_PROGRAM_ID);
  const [mayhemTokenVault] = PublicKey.findProgramAddressSync([solVault.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID);
  const [eventAuthority] = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], PUMP_PROGRAM_ID);
  const expected = [
    [mint, true, true], [mintAuthority, false, false], [bondingCurve, false, true], [associatedBondingCurve, false, true],
    [global, false, false], [creator, true, true], [SYSTEM_PROGRAM_ID, false, false], [TOKEN_2022_PROGRAM_ID, false, false],
    [ASSOCIATED_TOKEN_PROGRAM_ID, false, false], [MAYHEM_PROGRAM_ID, false, true], [globalParams, false, false], [solVault, false, true],
    [mayhemState, false, true], [mayhemTokenVault, false, true], [eventAuthority, false, false], [PUMP_PROGRAM_ID, false, false],
  ] as const;
  if (decodedCreate.keys.some((key, index) => {
    const binding = expected[index]!;
    return !key.pubkey.equals(binding[0]) || key.isSigner !== binding[1] || key.isWritable !== binding[2];
  })) {
    throw new Error("Pump.fun create_v2 account or signer binding changed.");
  }
  return { creatorWallet, mintAddress };
}

export function transactionDigest(transaction: VersionedTransaction): string {
  return createHash("sha256").update(transaction.serialize()).digest("hex");
}

export function invokedPrograms(logs: string[] | null | undefined): string[] {
  if (!logs) throw new Error("Token launch simulation logs are unavailable.");
  if (logs.some((line) => /log truncated/iu.test(line))) throw new Error("Token launch simulation logs were truncated.");
  return [...new Set(logs.map((line) => /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke \[\d+\]$/u.exec(line)?.[1]).filter((id): id is string => Boolean(id)))];
}

export function assertAllowedPrograms(programs: string[]): void {
  if (!programs.includes(PUMP_PROGRAM_ID.toBase58())) throw new Error("Simulation did not invoke the pinned Pump.fun program.");
  const denied = programs.find((program) => !PUMP_LAUNCH_ALLOWED_PROGRAMS.has(program));
  if (denied) throw new Error(`Simulation invoked a non-allowlisted program: ${denied}`);
}

function encodeCreateV2Data(input: Pick<PumpLaunchBuildInput, "creatorWallet" | "name" | "symbol" | "metadataUri">): Buffer {
  return Buffer.concat([
    Buffer.from(PUMP_CREATE_V2_DISCRIMINATOR),
    borshString(input.name.trim(), "name"),
    borshString(input.symbol.trim().toUpperCase(), "symbol"),
    borshString(input.metadataUri.trim(), "metadata URI"),
    new PublicKey(input.creatorWallet).toBuffer(),
    Buffer.from([0, 0]),
  ]);
}

function borshString(value: string, label: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length === 0 || bytes.length > 512) throw new Error(`Token launch ${label} is invalid.`);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function priorityMicroLamports(capLamports: bigint): number {
  const value = Number((capLamports * BigInt(1_000_000)) / BigInt(PUMP_LAUNCH_COMPUTE_LIMIT));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Priority fee cap is invalid.");
  return value;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
