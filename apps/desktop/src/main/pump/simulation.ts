import type { AccountInfo, Connection, PublicKey, VersionedMessage, VersionedTransaction } from "@solana/web3.js";
import { PumpSimulationArtifactSchema, type PumpSimulationArtifact } from "@silfable/contracts";

import { PUMP_FEE_PROGRAM_ID, PUMP_PROGRAM_ID } from "./inspector.js";
import type { PumpFeePreview } from "./fees.js";
import type { PumpInstructionPlan } from "./inspector.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";
import { inspectPumpUnsignedTransaction, type PumpUnsignedTransactionArtifact } from "./transaction.js";

const ALLOWED_INVOKED_PROGRAMS = new Set([
  PUMP_PROGRAM_ID,
  PUMP_FEE_PROGRAM_ID,
  "11111111111111111111111111111111",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const PROGRAM_INVOKE_PATTERN = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke \[\d+\]$/u;

type SimulatedAccount = { lamports: number; data: string[] } | null;
type SimulatedInnerInstructionGroup = {
  index: number;
  instructions: Array<{ programId?: { toBase58(): string } | string; programIdIndex?: number }>;
};

export type PumpSimulationRpc = {
  getMultipleAccountsInfoAndContext(addresses: PublicKey[], config: { commitment: "finalized" }): Promise<{
    context: { slot: number };
    value: Array<AccountInfo<Buffer> | null>;
  }>;
  getFeeForMessage(message: VersionedMessage, commitment: "confirmed"): Promise<{ context: { slot: number }; value: number | null }>;
  simulateTransaction(transaction: VersionedTransaction, config: {
    commitment: "confirmed";
    sigVerify: false;
    replaceRecentBlockhash: false;
    innerInstructions: true;
    accounts: { encoding: "base64"; addresses: string[] };
  }): Promise<{
    context: { slot: number };
    value: {
      err: unknown;
      logs: string[] | null;
      unitsConsumed?: number;
      accounts?: SimulatedAccount[] | null;
      innerInstructions?: SimulatedInnerInstructionGroup[] | null;
    };
  }>;
};

export function pumpSimulationRpc(connection: Connection): PumpSimulationRpc {
  return connection;
}

export async function simulatePumpUnsignedTransaction(input: {
  rpc: PumpSimulationRpc;
  transaction: PumpUnsignedTransactionArtifact;
  instructionData: Uint8Array;
  plan: PumpInstructionPlan;
  evidence: PumpV2FinalizedBuildEvidence;
  feePreview: PumpFeePreview;
  maxNetworkFeeLamports: number;
  maxFeePercent: number;
  now?: Date;
}): Promise<PumpSimulationArtifact> {
  validateLimits(input.maxNetworkFeeLamports, input.maxFeePercent);
  const serialized = Buffer.from(input.transaction.serializedBase64, "base64");
  const inspection = inspectPumpUnsignedTransaction({
    serialized,
    walletAddress: input.plan.walletAddress,
    plan: input.plan,
    expectedBlockhash: input.transaction.recentBlockhash,
    expectedInstructionData: input.instructionData,
  });
  if (!inspection.allowed) return result("blocked", input.evidence.slot, null, null, null, null, null, "unavailable", [], [], "Unsigned transaction no longer matches the inspected Pump artifact.", input.now);

  const candidateAddresses = [...new Set(input.plan.accounts
    .filter((account) => account.writable && !account.signer)
    .map((account) => account.address))];
  const publicKeys = candidateAddresses.map((address) => input.transaction.transaction.message.staticAccountKeys.find((key) => key.toBase58() === address))
    .filter((key): key is NonNullable<typeof key> => key !== undefined);
  if (publicKeys.length !== candidateAddresses.length) return result("blocked", input.evidence.slot, null, null, null, null, null, "unavailable", [], [], "A writable account is not bound to the decoded transaction.", input.now);
  const [preAccounts, fee, simulation] = await Promise.all([
    input.rpc.getMultipleAccountsInfoAndContext(publicKeys, { commitment: "finalized" }),
    input.rpc.getFeeForMessage(input.transaction.transaction.message, "confirmed"),
    input.rpc.simulateTransaction(input.transaction.transaction, {
      commitment: "confirmed",
      sigVerify: false,
      replaceRecentBlockhash: false,
      innerInstructions: true,
      accounts: { encoding: "base64", addresses: candidateAddresses },
    }),
  ]);
  if (preAccounts.context.slot < input.evidence.slot || simulation.context.slot < input.evidence.slot) {
    return result("blocked", simulation.context.slot, units(simulation.value.unitsConsumed), fee.value, null, null, null, "unavailable", [], boundedLogs(simulation.value.logs), "Simulation or account evidence predates the finalized Pump state.", input.now);
  }
  const logs = boundedLogs(simulation.value.logs);
  if (logs.some((line) => /log truncated/iu.test(line))) return result("blocked", simulation.context.slot, units(simulation.value.unitsConsumed), fee.value, null, null, null, "unavailable", [], logs, "Simulation logs were truncated, so invoked programs cannot be audited completely.", input.now);
  let innerPrograms: string[];
  try { innerPrograms = innerProgramIds(simulation.value.innerInstructions, input.transaction.transaction.message.staticAccountKeys); }
  catch (error) { return result("blocked", simulation.context.slot, units(simulation.value.unitsConsumed), fee.value, null, null, null, "unavailable", [], logs, error instanceof Error ? error.message : "Simulation inner instructions are invalid.", input.now); }
  const loggedPrograms = invokedProgramIds(logs);
  const invokedPrograms = [...new Set([...loggedPrograms, ...innerPrograms])];
  const loggedInnerPrograms = loggedPrograms.filter((program) => program !== PUMP_PROGRAM_ID);
  if (loggedInnerPrograms.some((program) => !innerPrograms.includes(program))) return result("blocked", simulation.context.slot, units(simulation.value.unitsConsumed), fee.value, null, null, null, "unavailable", invokedPrograms, logs, "Simulation inner-instruction evidence is incomplete.", input.now);
  const denied = invokedPrograms.filter((program) => !ALLOWED_INVOKED_PROGRAMS.has(program));
  if (!invokedPrograms.includes(PUMP_PROGRAM_ID)) return result("blocked", simulation.context.slot, units(simulation.value.unitsConsumed), fee.value, null, null, null, "unavailable", invokedPrograms, logs, "Simulation did not invoke the pinned Pump program.", input.now);
  if (denied.length > 0) return result("blocked", simulation.context.slot, units(simulation.value.unitsConsumed), fee.value, null, null, null, "unavailable", invokedPrograms, logs, `Simulation invoked a non-allowlisted program: ${denied[0]}`, input.now);
  const rentLamports = calculateCreatedAccountFunding(preAccounts.value, simulation.value.accounts, candidateAddresses.length);
  if (simulation.value.err !== null) return result("failed", simulation.context.slot, units(simulation.value.unitsConsumed), fee.value, rentLamports, null, null, "unavailable", invokedPrograms, logs, friendlySimulationError(simulation.value.err, logs), input.now);
  if (fee.value === null || !Number.isSafeInteger(fee.value) || fee.value < 0) return result("blocked", simulation.context.slot, units(simulation.value.unitsConsumed), null, rentLamports, null, null, "unavailable", invokedPrograms, logs, "Network fee could not be verified.", input.now);

  const quoteBasis = BigInt(input.feePreview.grossQuoteAmount);
  const networkFeePercent = quoteBasis === 0n ? null : Number(BigInt(fee.value) * 1_000_000n / quoteBasis) / 10_000;
  const absoluteExceeded = fee.value > input.maxNetworkFeeLamports;
  const percentExceeded = networkFeePercent !== null && networkFeePercent > input.maxFeePercent;
  const utilization = Math.max(fee.value / input.maxNetworkFeeLamports, networkFeePercent === null ? 0 : networkFeePercent / input.maxFeePercent);
  const feeRisk = absoluteExceeded || percentExceeded ? "extreme" : utilization >= 0.75 ? "high" : "reasonable";
  const totalKnown = BigInt(fee.value) + BigInt(rentLamports) + BigInt(input.feePreview.totalTradingFeeQuoteAmount);
  if (absoluteExceeded || percentExceeded) return result("blocked", simulation.context.slot, units(simulation.value.unitsConsumed), fee.value, rentLamports, networkFeePercent, totalKnown.toString(), feeRisk, invokedPrograms, logs, "Pump fee guard blocked the simulated transaction.", input.now);
  return result("passed", simulation.context.slot, units(simulation.value.unitsConsumed), fee.value, rentLamports, networkFeePercent, totalKnown.toString(), feeRisk, invokedPrograms, logs, null, input.now);
}

function calculateCreatedAccountFunding(pre: Array<AccountInfo<Buffer> | null>, post: SimulatedAccount[] | null | undefined, expected: number): number {
  if (post === null || post === undefined || pre.length !== expected || post.length !== expected) throw new Error("Pump simulation account evidence is incomplete");
  return post.reduce((sum, account, index) => {
    if (pre[index] !== null || account === null) return sum;
    if (!Number.isSafeInteger(account.lamports) || account.lamports < 0) throw new Error("Pump simulated account funding is invalid");
    return sum + account.lamports;
  }, 0);
}

function invokedProgramIds(logs: string[]): string[] {
  return [...new Set(logs.map((line) => PROGRAM_INVOKE_PATTERN.exec(line)?.[1]).filter((program): program is string => program !== undefined))];
}

function innerProgramIds(
  groups: SimulatedInnerInstructionGroup[] | null | undefined,
  staticKeys: Array<{ toBase58(): string }>,
): string[] {
  if (groups === null || groups === undefined) return [];
  const programs: string[] = [];
  for (const group of groups) {
    if (!Number.isSafeInteger(group.index) || group.index < 0) throw new Error("Simulation returned an invalid inner-instruction index.");
    for (const instruction of group.instructions) {
      if (typeof instruction.programId === "string") programs.push(instruction.programId);
      else if (instruction.programId !== undefined) programs.push(instruction.programId.toBase58());
      else if (Number.isSafeInteger(instruction.programIdIndex) && instruction.programIdIndex !== undefined) {
        const program = staticKeys[instruction.programIdIndex];
        if (program === undefined) throw new Error("Simulation inner program could not be resolved from the decoded transaction.");
        programs.push(program.toBase58());
      } else throw new Error("Simulation returned an unresolvable inner instruction.");
    }
  }
  return [...new Set(programs)];
}

function boundedLogs(logs: string[] | null): string[] {
  return Array.isArray(logs) ? logs.filter((line) => typeof line === "string").slice(0, 200).map((line) => line.slice(0, 500)) : [];
}

function units(value: number | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function friendlySimulationError(error: unknown, logs: string[]): string {
  const evidence = `${safeJson(error)} ${logs.join(" ")}`;
  if (/insufficient funds/iu.test(evidence)) return "Simulation failed because the selected wallet has insufficient SOL or tokens. Nothing was signed or broadcast.";
  if (/slippage|minimum.*output/iu.test(evidence)) return "Simulation failed because the approved minimum output can no longer be met. Nothing was signed or broadcast.";
  return `Pump simulation failed safely: ${safeJson(error)}. Nothing was signed or broadcast.`;
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value).slice(0, 300); } catch { return "unknown program error"; }
}

function validateLimits(maxNetworkFeeLamports: number, maxFeePercent: number): void {
  if (!Number.isSafeInteger(maxNetworkFeeLamports) || maxNetworkFeeLamports < 1) throw new Error("Pump maximum network fee is invalid");
  if (!Number.isFinite(maxFeePercent) || maxFeePercent <= 0 || maxFeePercent > 100) throw new Error("Pump maximum fee percentage is invalid");
}

function result(
  status: PumpSimulationArtifact["status"], simulationSlot: number, unitsConsumed: number | null, networkFeeLamports: number | null,
  rentLamports: number | null, networkFeePercent: number | null, totalKnownFeeLamports: string | null, feeRisk: PumpSimulationArtifact["feeRisk"],
  invokedPrograms: string[], logs: string[], error: string | null, now = new Date(),
): PumpSimulationArtifact {
  return PumpSimulationArtifactSchema.parse({ status, simulationSlot, unitsConsumed, networkFeeLamports, rentLamports, networkFeePercent, totalKnownFeeLamports, feeRisk, invokedPrograms, logs, error, transactionSigned: false, broadcastAttempted: false, simulatedAt: now.toISOString() });
}
