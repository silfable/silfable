import { createHash } from "node:crypto";

import {
  PumpLaunchPreflightSchema,
  PumpLaunchFinalRevalidationSchema,
  PumpLaunchExecutionRecordSchema,
  type PumpLaunchDraft,
  type PumpLaunchExecutionRecord,
  type PumpLaunchFinalRevalidation,
  type PumpLaunchPreflight,
} from "@silfable/contracts";
import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getProgramDerivedAddress,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getTransactionDecoder,
  getTransactionEncoder,
  getSignatureFromTransaction,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type KeyPairSigner,
} from "@solana/kit";

import {
  encodeAndInspectPumpLaunchInstruction,
  inspectPumpLaunchInstruction,
  PUMP_LAUNCH_CODEC_REVISION,
  type PumpLaunchEncodedInstruction,
} from "./launch-codec.js";
import { PUMP_PROGRAM_ID } from "./inspector.js";
import type {
  PumpMainnetRpc,
  PumpRpcAccount,
  PumpRpcSimulationAccount,
} from "./rpc.js";
import { allowedSolanaPrograms } from "../security/solana-program-policy.js";
import { decodePumpGlobalLaunchReadiness } from "./state.js";

const SDK_VERSION = "1.36.0";
const COMPUTE_UNIT_LIMIT = 300_000;
const PREPARED_TTL_MS = 10 * 60_000;
const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";
const PROGRAM_INVOKE_PATTERN = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke \[\d+\]$/u;
const ALLOWED_PROGRAMS = allowedSolanaPrograms("pump-token-launch");

type GlobalReadiness = {
  createV2Enabled: boolean;
  mayhemModeEnabled: boolean;
  isCashbackEnabled: boolean;
};

export type PumpLaunchPreflightRpc = Pick<
  PumpMainnetRpc,
  | "getMultipleAccountsInfoAndContext"
  | "getLatestBlockhashAndContext"
  | "getBalanceAndContext"
  | "getFeeForMessage"
  | "getBlockHeight"
  | "simulateTransaction"
>;

export type PreparedPumpLaunch = {
  preflight: PumpLaunchPreflight;
  unsignedTransactionBase64: string;
  messageBase64: string;
  writableAddresses: string[];
  mintSigner: KeyPairSigner;
};

export type SignedPumpLaunch = {
  signedTransactionBase64: string;
  execution: PumpLaunchExecutionRecord;
};

export class PumpLaunchPreflightService {
  readonly #rpc: PumpLaunchPreflightRpc;
  readonly #decodeGlobal: (account: PumpRpcAccount) => GlobalReadiness;
  readonly #prepared = new Map<string, PreparedPumpLaunch>();
  readonly #revalidations = new Map<string, PumpLaunchFinalRevalidation>();
  readonly #consumed = new Set<string>();

  constructor(
    rpc: PumpLaunchPreflightRpc,
    input: { decodeGlobal?: (account: PumpRpcAccount) => GlobalReadiness } = {},
  ) {
    this.#rpc = rpc;
    this.#decodeGlobal = input.decodeGlobal ?? ((account) => decodePumpGlobalLaunchReadiness(account.data));
  }

  async prepare(input: {
    draft: PumpLaunchDraft;
    metadataUri: string;
    now?: Date;
  }): Promise<PumpLaunchPreflight> {
    const now = input.now ?? new Date();
    assertPreflightDraft(input.draft, input.metadataUri, now);
    this.#prune(now);

    const globalAddress = await deriveGlobalAddress();
    const globalEvidence = await this.#rpc.getMultipleAccountsInfoAndContext(
      [globalAddress],
      { commitment: "finalized" },
    );
    const globalAccount = globalEvidence.value[0];
    if (globalAccount === null || globalAccount === undefined) throw new Error("Pump.fun global Mainnet account is unavailable");
    if (globalAccount.owner !== PUMP_PROGRAM_ID) throw new Error("Pump.fun global Mainnet account owner is invalid");
    const global = this.#decodeGlobal(globalAccount);
    if (!global.createV2Enabled) throw new Error("Pump.fun create_v2 is disabled by current Mainnet state");

    const mintSigner = await generateKeyPairSigner(false);
    const launchInstruction = await encodeAndInspectPumpLaunchInstruction({
      creatorWallet: input.draft.creatorWallet,
      mintAddress: mintSigner.address,
      name: input.draft.metadata.name,
      symbol: input.draft.metadata.symbol,
      metadataUri: input.metadataUri,
    });
    const blockhashEvidence = await this.#rpc.getLatestBlockhashAndContext({
      commitment: "finalized",
      minContextSlot: globalEvidence.context.slot,
    });
    if (blockhashEvidence.context.slot < globalEvidence.context.slot) {
      throw new Error("Token launch blockhash predates finalized Pump.fun state");
    }

    const priority = priorityFee(input.draft.maxPriorityFeeLamports);
    const transaction = buildAndInspectUnsignedLaunchTransaction({
      creatorWallet: input.draft.creatorWallet,
      mintAddress: mintSigner.address,
      launchInstruction,
      recentBlockhash: blockhashEvidence.value.blockhash,
      lastValidBlockHeight: blockhashEvidence.value.lastValidBlockHeight,
      priorityMicroLamports: priority.microLamports,
    });
    const writableAddresses = [...new Set(launchInstruction.accounts
      .filter((account) => account.writable)
      .map((account) => account.address))];
    const [preAccounts, balance, fee, simulation] = await Promise.all([
      this.#rpc.getMultipleAccountsInfoAndContext(writableAddresses, { commitment: "finalized" }),
      this.#rpc.getBalanceAndContext(input.draft.creatorWallet, { commitment: "finalized" }),
      this.#rpc.getFeeForMessage(transaction.messageBase64, { commitment: "confirmed" }),
      this.#rpc.simulateTransaction(transaction.transactionBase64, {
        commitment: "confirmed",
        sigVerify: false,
        replaceRecentBlockhash: false,
        innerInstructions: true,
        accounts: { encoding: "base64", addresses: writableAddresses },
      }),
    ]);
    if (
      preAccounts.context.slot < globalEvidence.context.slot
      || simulation.context.slot < globalEvidence.context.slot
      || fee.context.slot < globalEvidence.context.slot
      || balance.context.slot < globalEvidence.context.slot
    ) {
      throw new Error("Token launch preflight evidence predates finalized Pump.fun state");
    }
    if (simulation.value.err !== null) {
      throw new Error(`Token launch simulation failed safely: ${friendlySimulationError(simulation.value.err, simulation.value.logs)}`);
    }
    if (fee.value === null) throw new Error("Token launch network fee could not be verified");

    const invokedPrograms = invokedProgramIds(simulation.value.logs);
    if (!invokedPrograms.includes(PUMP_PROGRAM_ID)) {
      throw new Error("Token launch simulation did not invoke the pinned Pump.fun program");
    }
    const deniedProgram = invokedPrograms.find((program) => !ALLOWED_PROGRAMS.has(program));
    if (deniedProgram !== undefined) {
      throw new Error(`Token launch simulation invoked a non-allowlisted program: ${deniedProgram}`);
    }
    const rentLamports = createdAccountFunding(
      preAccounts.value,
      simulation.value.accounts,
      writableAddresses.length,
    );
    const totalOutflow = BigInt(fee.value) + BigInt(rentLamports);
    if (totalOutflow > BigInt(input.draft.maxCreatorOutflowLamports)) {
      throw new Error("Token launch fee and rent exceed the approved creator outflow cap");
    }
    if (BigInt(balance.value) < totalOutflow) {
      throw new Error("Creator wallet balance is insufficient for the simulated launch fee and rent");
    }

    const expiresAt = new Date(Math.min(
      Date.parse(input.draft.deadlineAt),
      now.getTime() + PREPARED_TTL_MS,
    )).toISOString();
    const preflight = PumpLaunchPreflightSchema.parse({
      id: crypto.randomUUID(),
      draftId: input.draft.id,
      creatorWallet: input.draft.creatorWallet,
      mintAddress: mintSigner.address,
      metadataUri: input.metadataUri,
      programId: PUMP_PROGRAM_ID,
      instructionName: "create_v2",
      sdkVersion: SDK_VERSION,
      signerAddresses: [input.draft.creatorWallet, mintSigner.address],
      transactionDigest: createHash("sha256").update(transaction.serialized).digest("hex"),
      recentBlockhash: blockhashEvidence.value.blockhash,
      lastValidBlockHeight: blockhashEvidence.value.lastValidBlockHeight,
      simulationSlot: simulation.context.slot,
      computeUnitLimit: COMPUTE_UNIT_LIMIT,
      computeUnitsConsumed: safeUnits(simulation.value.unitsConsumed),
      networkFeeLamports: String(fee.value),
      priorityFeeLamports: priority.lamports.toString(),
      rentLamports: String(rentLamports),
      totalEstimatedOutflowLamports: totalOutflow.toString(),
      invokedPrograms,
      checks: [
        pass("draft", "Draft is current, Solana/SOL scoped, and contains no initial purchase."),
        pass("metadata", "A public HTTPS or IPFS metadata URI is bound to this preflight."),
        pass("global", "Finalized Pump.fun state permits the pinned create_v2 instruction."),
        pass("instruction", `Program, discriminator, accounts, and options match ${PUMP_LAUNCH_CODEC_REVISION}.`),
        pass("signers", "Only the selected creator wallet and newly generated mint are required signers."),
        pass("simulation", "Unsigned Mainnet simulation completed without a program error."),
        pass("programs", "Every invoked program is in the Token Launch allowlist."),
        pass("fee", "Network and priority fees were estimated from the exact unsigned message."),
        pass("outflow", "Estimated fee plus account rent is within the approved creator outflow cap."),
        pass("balance", "Finalized creator balance covers the estimated launch outflow."),
        pass("no-execution", "No wallet secret was accessed and no signature or broadcast was attempted."),
      ],
      lifecycle: "unsigned-preflight",
      signed: false,
      broadcastAttempted: false,
      executionAllowed: false,
      expiresAt,
      simulatedAt: now.toISOString(),
    });
    this.#replacePrepared(input.draft.id, {
      preflight,
      unsignedTransactionBase64: transaction.transactionBase64,
      messageBase64: transaction.messageBase64,
      writableAddresses,
      mintSigner,
    });
    return preflight;
  }

  getPrepared(preflightId: string, now = new Date()): PreparedPumpLaunch | null {
    this.#prune(now);
    return this.#prepared.get(preflightId) ?? null;
  }

  clear(): void {
    this.#prepared.clear();
    this.#revalidations.clear();
    this.#consumed.clear();
  }

  async finalRevalidate(input: {
    draft: PumpLaunchDraft;
    preflightId: string;
    now?: Date;
  }): Promise<PumpLaunchFinalRevalidation> {
    const now = input.now ?? new Date();
    const prepared = this.getPrepared(input.preflightId, now);
    if (prepared === null) throw new Error("Token launch preflight expired or is unavailable");
    if (this.#consumed.has(input.preflightId)) throw new Error("Token launch preflight has already been consumed");
    const bindingPassed = prepared.preflight.draftId === input.draft.id
      && prepared.preflight.creatorWallet === input.draft.creatorWallet
      && prepared.preflight.transactionDigest.length === 64;
    if (!bindingPassed) throw new Error("Token launch preflight does not match the reviewed draft");

    const [blockHeight, balance, fee, simulation] = await Promise.all([
      this.#rpc.getBlockHeight({ commitment: "finalized" }),
      this.#rpc.getBalanceAndContext(input.draft.creatorWallet, { commitment: "finalized" }),
      this.#rpc.getFeeForMessage(prepared.messageBase64, { commitment: "confirmed" }),
      this.#rpc.simulateTransaction(prepared.unsignedTransactionBase64, {
        commitment: "confirmed",
        sigVerify: false,
        replaceRecentBlockhash: false,
        innerInstructions: true,
        accounts: { encoding: "base64", addresses: prepared.writableAddresses },
      }),
    ]);
    const programs = invokedProgramIds(simulation.value.logs);
    const blockhashLive = blockHeight <= prepared.preflight.lastValidBlockHeight;
    const simulationPassed = simulation.value.err === null;
    const programsPassed = programs.includes(PUMP_PROGRAM_ID) && programs.every((program) => ALLOWED_PROGRAMS.has(program));
    const feePassed = fee.value !== null && BigInt(fee.value) <= BigInt(input.draft.maxCreatorOutflowLamports);
    const totalOutflow = BigInt(prepared.preflight.totalEstimatedOutflowLamports);
    const balancePassed = BigInt(balance.value) >= totalOutflow;
    const checks: PumpLaunchFinalRevalidation["checks"] = [
      finalCheck("cache-binding", true, "The exact volatile preflight is still present."),
      finalCheck("draft-binding", prepared.preflight.draftId === input.draft.id, "Draft identity remains unchanged."),
      finalCheck("wallet-binding", prepared.preflight.creatorWallet === input.draft.creatorWallet, "Creator wallet remains bound to the reviewed draft."),
      finalCheck("mint-binding", prepared.mintSigner.address === prepared.preflight.mintAddress, "The volatile mint signer matches the reviewed mint."),
      finalCheck("digest-binding", digestBase64(prepared.unsignedTransactionBase64) === prepared.preflight.transactionDigest, "The exact unsigned transaction digest remains unchanged."),
      finalCheck("blockhash-live", blockhashLive, "The approved blockhash remains live."),
      finalCheck("final-simulation", simulationPassed, "The exact unsigned transaction passed a fresh simulation."),
      finalCheck("program-allowlist", programsPassed, "Fresh simulation invoked only allowlisted programs."),
      finalCheck("fee-cap", feePassed, "Fresh network fee remains within the creator outflow cap."),
      finalCheck("balance", balancePassed, "Finalized creator balance still covers the estimated outflow."),
      finalCheck("unsigned", transactionIsUnsigned(prepared.unsignedTransactionBase64), "Both required signatures remain empty."),
      finalCheck("one-shot", !this.#consumed.has(input.preflightId), "This preflight has not been consumed."),
    ];
    const evaluatedAt = now.toISOString();
    const revalidation = PumpLaunchFinalRevalidationSchema.parse({
      id: crypto.randomUUID(),
      draftId: input.draft.id,
      preflightId: input.preflightId,
      creatorWallet: prepared.preflight.creatorWallet,
      mintAddress: prepared.preflight.mintAddress,
      transactionDigest: prepared.preflight.transactionDigest,
      status: checks.every((check) => check.passed) ? "ready-for-password" : "blocked",
      finalSimulationSlot: simulation.context.slot,
      currentBlockHeight: blockHeight,
      checks,
      requiresMasterPassword: true,
      requiredConfirmation: "LAUNCH TOKEN MAINNET",
      signingAttempted: false,
      broadcastAttempted: false,
      executionAllowed: false,
      evaluatedAt,
      expiresAt: new Date(Math.min(Date.parse(prepared.preflight.expiresAt), now.getTime() + 2 * 60_000)).toISOString(),
    });
    this.#revalidations.set(revalidation.id, revalidation);
    return revalidation;
  }

  async signPrepared(input: {
    revalidationId: string;
    walletSigner: KeyPairSigner;
    now?: Date;
  }): Promise<SignedPumpLaunch> {
    const now = input.now ?? new Date();
    const revalidation = this.#revalidations.get(input.revalidationId);
    if (
      revalidation === undefined
      || revalidation.status !== "ready-for-password"
      || Date.parse(revalidation.expiresAt) <= now.getTime()
      || revalidation.checks.some((check) => !check.passed)
    ) {
      throw new Error("Token launch final approval is stale or blocked");
    }
    const prepared = this.getPrepared(revalidation.preflightId, now);
    if (prepared === null) throw new Error("Token launch preflight expired or is unavailable");
    if (this.#consumed.has(revalidation.preflightId)) throw new Error("Token launch preflight has already been consumed");
    if (input.walletSigner.address !== revalidation.creatorWallet || prepared.mintSigner.address !== revalidation.mintAddress) {
      throw new Error("Token launch signer set does not match final approval");
    }
    if (digestBase64(prepared.unsignedTransactionBase64) !== revalidation.transactionDigest) {
      throw new Error("Token launch transaction digest changed before signing");
    }
    this.#consumed.add(revalidation.preflightId);
    this.#revalidations.delete(revalidation.id);
    const decoded = getTransactionDecoder().decode(Buffer.from(prepared.unsignedTransactionBase64, "base64"));
    const signed = await partiallySignTransaction(
      [input.walletSigner.keyPair, prepared.mintSigner.keyPair],
      decoded,
    );
    if (Object.values(signed.signatures).some((signature) => signature === null)) {
      throw new Error("Token launch did not produce every required signature");
    }
    const signature = getSignatureFromTransaction(signed);
    // The mint private key must not outlive the single approved signing
    // operation. Recovery relies only on the persisted transaction signature
    // and never attempts to reconstruct or rebroadcast the transaction.
    this.#prepared.delete(revalidation.preflightId);
    const timestamp = now.toISOString();
    return {
      signedTransactionBase64: Buffer.from(getTransactionEncoder().encode(signed)).toString("base64"),
      execution: PumpLaunchExecutionRecordSchema.parse({
        id: crypto.randomUUID(),
        draftId: revalidation.draftId,
        preflightId: revalidation.preflightId,
        revalidationId: revalidation.id,
        signature,
        creatorWallet: revalidation.creatorWallet,
        mintAddress: revalidation.mintAddress,
        transactionDigest: revalidation.transactionDigest,
        lastValidBlockHeight: prepared.preflight.lastValidBlockHeight,
        status: "signed-not-broadcast",
        networkFeeLamports: Number(prepared.preflight.networkFeeLamports),
        rentLamports: Number(prepared.preflight.rentLamports),
        totalEstimatedOutflowLamports: prepared.preflight.totalEstimatedOutflowLamports,
        finalizedSlot: null,
        mintAccountVerified: false,
        actualNetworkFeeLamports: null,
        actualAccountFundingLamports: null,
        walletPreLamports: null,
        walletPostLamports: null,
        actualWalletOutflowLamports: null,
        settlementVerified: false,
        finalizedAt: null,
        error: null,
        signedLocally: true,
        broadcastAttempted: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    };
  }

  #replacePrepared(draftId: string, next: PreparedPumpLaunch): void {
    for (const [id, prepared] of this.#prepared.entries()) {
      if (prepared.preflight.draftId === draftId) this.#prepared.delete(id);
    }
    this.#prepared.set(next.preflight.id, next);
  }

  #prune(now: Date): void {
    for (const [id, prepared] of this.#prepared.entries()) {
      if (Date.parse(prepared.preflight.expiresAt) <= now.getTime()) this.#prepared.delete(id);
    }
  }
}

export function markPumpLaunchBroadcastUnknown(
  execution: PumpLaunchExecutionRecord,
  error: string | null,
  now = new Date(),
): PumpLaunchExecutionRecord {
  return PumpLaunchExecutionRecordSchema.parse({
    ...execution,
    status: "broadcast-unknown",
    broadcastAttempted: true,
    error: error === null ? null : safeLaunchError(error),
    updatedAt: now.toISOString(),
  });
}

export function markPumpLaunchFailed(
  execution: PumpLaunchExecutionRecord,
  error: string,
  now = new Date(),
): PumpLaunchExecutionRecord {
  return PumpLaunchExecutionRecordSchema.parse({
    ...execution,
    status: "failed",
    broadcastAttempted: true,
    error: safeLaunchError(error),
    updatedAt: now.toISOString(),
  });
}

export function markPumpLaunchFinalized(
  execution: PumpLaunchExecutionRecord,
  settlement: {
    slot: number;
    feeLamports: number;
    accountCreationFundingLamports: number;
    walletPreLamports: string;
    walletPostLamports: string;
    walletOutflowLamports: string;
  },
  now = new Date(),
): PumpLaunchExecutionRecord {
  return PumpLaunchExecutionRecordSchema.parse({
    ...execution,
    status: "finalized",
    finalizedSlot: settlement.slot,
    mintAccountVerified: true,
    actualNetworkFeeLamports: settlement.feeLamports,
    actualAccountFundingLamports: settlement.accountCreationFundingLamports,
    walletPreLamports: settlement.walletPreLamports,
    walletPostLamports: settlement.walletPostLamports,
    actualWalletOutflowLamports: settlement.walletOutflowLamports,
    settlementVerified: true,
    finalizedAt: now.toISOString(),
    error: null,
    broadcastAttempted: true,
    updatedAt: now.toISOString(),
  });
}

async function deriveGlobalAddress(): Promise<string> {
  const [global] = await getProgramDerivedAddress({
    programAddress: address(PUMP_PROGRAM_ID),
    seeds: [new TextEncoder().encode("global")],
  });
  return global;
}

function buildAndInspectUnsignedLaunchTransaction(input: {
  creatorWallet: string;
  mintAddress: string;
  launchInstruction: PumpLaunchEncodedInstruction;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  priorityMicroLamports: number;
}): {
  serialized: Uint8Array;
  transactionBase64: string;
  messageBase64: string;
} {
  const computeLimit = kitInstruction(
    COMPUTE_BUDGET_PROGRAM_ID,
    Uint8Array.of(2, ...u32(COMPUTE_UNIT_LIMIT)),
  );
  const computePrice = kitInstruction(
    COMPUTE_BUDGET_PROGRAM_ID,
    Uint8Array.of(3, ...u64(BigInt(input.priorityMicroLamports))),
  );
  const launch = {
    programAddress: address(input.launchInstruction.programAddress),
    accounts: input.launchInstruction.accounts.map((account) => ({
      address: address(account.address),
      role: accountRole(account.signer, account.writable),
    })),
    data: input.launchInstruction.data,
  };
  const base = pipe(
    createTransactionMessage({ version: 0 }),
    (value) => setTransactionMessageFeePayer(address(input.creatorWallet), value),
    (value) => setTransactionMessageLifetimeUsingBlockhash({
      blockhash: blockhash(input.recentBlockhash),
      lastValidBlockHeight: BigInt(input.lastValidBlockHeight),
    }, value),
    (value) => appendTransactionMessageInstruction(computeLimit, value),
  );
  const priced = input.priorityMicroLamports > 0
    ? appendTransactionMessageInstruction(computePrice, base)
    : base;
  const message = appendTransactionMessageInstruction(launch, priced);
  const compiled = compileTransaction(message);
  const serialized = Uint8Array.from(getTransactionEncoder().encode(compiled));
  inspectUnsignedLaunchTransaction(serialized, input);
  const decodedMessage = getCompiledTransactionMessageDecoder().decode(compiled.messageBytes);
  return {
    serialized,
    transactionBase64: Buffer.from(serialized).toString("base64"),
    messageBase64: Buffer.from(getCompiledTransactionMessageEncoder().encode(decodedMessage)).toString("base64"),
  };
}

function inspectUnsignedLaunchTransaction(
  serialized: Uint8Array,
  input: {
    creatorWallet: string;
    mintAddress: string;
    launchInstruction: PumpLaunchEncodedInstruction;
    recentBlockhash: string;
    priorityMicroLamports: number;
  },
): void {
  const decoded = getTransactionDecoder().decode(serialized);
  const message = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
  const signatures = Object.entries(decoded.signatures);
  if (message.version !== 0 || (message.addressTableLookups?.length ?? 0) !== 0) {
    throw new Error("Token launch transaction must use a lookup-free v0 message");
  }
  if (
    message.header.numSignerAccounts !== 2
    || signatures.length !== 2
    || signatures.some(([, signature]) => signature !== null)
    || String(message.staticAccounts[0]) !== input.creatorWallet
    || String(message.staticAccounts[1]) !== input.mintAddress
  ) {
    throw new Error("Token launch transaction signer set or unsigned state is invalid");
  }
  if (String(message.lifetimeToken) !== input.recentBlockhash) {
    throw new Error("Token launch transaction blockhash binding is invalid");
  }
  const expectedCount = input.priorityMicroLamports > 0 ? 3 : 2;
  if (message.instructions.length !== expectedCount) throw new Error("Token launch transaction instruction count is invalid");
  const compiled = message.instructions.at(-1);
  if (compiled === undefined) throw new Error("Token launch transaction is missing create_v2");
  const program = message.staticAccounts[compiled.programAddressIndex];
  if (String(program) !== PUMP_PROGRAM_ID) throw new Error("Token launch transaction program binding is invalid");
  const accounts = (compiled.accountIndices ?? []).map((index, accountIndex) => ({
    ...input.launchInstruction.accounts[accountIndex]!,
    address: String(message.staticAccounts[index]),
    signer: isSigner(message, index),
    writable: isWritable(message, index),
  }));
  const reconstructed = {
    programAddress: PUMP_PROGRAM_ID as typeof PUMP_PROGRAM_ID,
    accounts,
    data: Uint8Array.from(compiled.data ?? new Uint8Array()),
  };
  inspectPumpLaunchInstruction(reconstructed);
  if (!equalBytes(reconstructed.data, input.launchInstruction.data)) {
    throw new Error("Token launch transaction changed create_v2 instruction data");
  }
}

function kitInstruction(programAddress: string, data: Uint8Array) {
  return { programAddress: address(programAddress), data };
}

function accountRole(signer: boolean, writable: boolean): AccountRole {
  if (signer && writable) return AccountRole.WRITABLE_SIGNER;
  if (signer) return AccountRole.READONLY_SIGNER;
  if (writable) return AccountRole.WRITABLE;
  return AccountRole.READONLY;
}

function isSigner(message: ReturnType<ReturnType<typeof getCompiledTransactionMessageDecoder>["decode"]>, index: number): boolean {
  return index < message.header.numSignerAccounts;
}

function isWritable(message: ReturnType<ReturnType<typeof getCompiledTransactionMessageDecoder>["decode"]>, index: number): boolean {
  if (index < message.header.numSignerAccounts) {
    return index < message.header.numSignerAccounts - message.header.numReadonlySignerAccounts;
  }
  return index < message.staticAccounts.length - message.header.numReadonlyNonSignerAccounts;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function u64(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

function assertPreflightDraft(draft: PumpLaunchDraft, metadataUri: string, now: Date): void {
  if (draft.lifecycle !== "draft-only" || draft.executionAllowed) throw new Error("Token launch draft is not review-only");
  if (Date.parse(draft.deadlineAt) <= now.getTime()) throw new Error("Token launch draft has expired");
  if (draft.quoteAsset !== "SOL") throw new Error("Token launch preflight currently supports SOL quote only");
  if (draft.initialPurchaseAmount !== "0") {
    throw new Error("Initial purchase is a separate future transaction and must be zero for launch preflight");
  }
  if (metadataUri !== draft.metadata.metadataUri && draft.metadata.metadataUri !== null && draft.metadata.metadataUri !== undefined) {
    throw new Error("Token launch metadata URI does not match the reviewed draft");
  }
}

function priorityFee(cap: string): { microLamports: number; lamports: bigint } {
  const capLamports = BigInt(cap);
  const microLamports = Number((capLamports * 1_000_000n) / BigInt(COMPUTE_UNIT_LIMIT));
  if (!Number.isSafeInteger(microLamports) || microLamports < 0) throw new Error("Token launch priority fee is invalid");
  const lamports = (BigInt(microLamports) * BigInt(COMPUTE_UNIT_LIMIT) + 999_999n) / 1_000_000n;
  if (lamports > capLamports) throw new Error("Token launch priority fee exceeds its cap");
  return { microLamports, lamports };
}

function createdAccountFunding(
  pre: Array<PumpRpcAccount | null>,
  post: PumpRpcSimulationAccount[] | null | undefined,
  expected: number,
): number {
  if (post === null || post === undefined || pre.length !== expected || post.length !== expected) {
    throw new Error("Token launch simulation account evidence is incomplete");
  }
  return post.reduce((sum, account, index) => {
    if (pre[index] !== null || account === null) return sum;
    if (!Number.isSafeInteger(account.lamports) || account.lamports < 0) {
      throw new Error("Token launch simulated account rent is invalid");
    }
    return sum + account.lamports;
  }, 0);
}

function invokedProgramIds(logs: string[] | null): string[] {
  if (!Array.isArray(logs)) throw new Error("Token launch simulation logs are unavailable");
  if (logs.some((line) => /log truncated/iu.test(line))) throw new Error("Token launch simulation logs were truncated");
  return [...new Set(logs
    .map((line) => PROGRAM_INVOKE_PATTERN.exec(line)?.[1])
    .filter((program): program is string => program !== undefined))];
}

function friendlySimulationError(error: unknown, logs: string[] | null): string {
  const evidence = `${safeJson(error)} ${(logs ?? []).join(" ")}`;
  if (/insufficient funds/iu.test(evidence)) return "creator wallet has insufficient SOL; nothing was signed or broadcast";
  if (/already in use|already initialized/iu.test(evidence)) return "generated mint or launch account already exists; nothing was signed or broadcast";
  return "the Pump.fun program rejected the unsigned transaction; nothing was signed or broadcast";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 240);
  } catch {
    return "unknown simulation error";
  }
}

function safeUnits(value: number | undefined): number | null {
  return Number.isSafeInteger(value) && (value ?? -1) >= 0 ? value! : null;
}

function pass(id: PumpLaunchPreflight["checks"][number]["id"], message: string): PumpLaunchPreflight["checks"][number] {
  return { id, status: "pass", message };
}

function equalBytes(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  return left.length === right.length && Array.from(left).every((value, index) => value === right[index]);
}

function digestBase64(value: string): string {
  return createHash("sha256").update(Buffer.from(value, "base64")).digest("hex");
}

function transactionIsUnsigned(value: string): boolean {
  const transaction = getTransactionDecoder().decode(Buffer.from(value, "base64"));
  return Object.values(transaction.signatures).every((signature) => signature === null);
}

function finalCheck(
  id: PumpLaunchFinalRevalidation["checks"][number]["id"],
  passed: boolean,
  message: string,
): PumpLaunchFinalRevalidation["checks"][number] {
  return { id, passed, message: passed ? message : `${message} Check failed.` };
}

function safeLaunchError(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    return "The Token Launch transaction was rejected by Solana. Open the transaction signature for on-chain details.";
  }
  if (/timeout|timed out|fetch failed|network|unknown|abort/iu.test(normalized)) {
    return "Broadcast status is unknown. Verify the locally derived signature; this launch will never be rebroadcast automatically.";
  }
  if (/blockhash/iu.test(normalized)) {
    return "The approved blockhash expired. Verify the signature before preparing a new launch.";
  }
  return normalized.length > 0 ? normalized.slice(0, 500) : "Token launch failed safely.";
}
