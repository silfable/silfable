import {
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";
import { PumpSimulationArtifactSchema, type PumpSimulationArtifact } from "@silfable/contracts";

import type { PumpFeePreview } from "./fees.js";
import { PUMP_FEE_PROGRAM_ID, PUMP_PROGRAM_ID, PUMP_SWAP_PROGRAM_ID, type PumpInstructionPlan } from "./inspector.js";
import type { PumpRpcAccount, PumpRpcInnerInstructionGroup, PumpRpcSimulationAccount } from "./rpc.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";
import {
  inspectPumpKitUnsignedTransaction,
  type PumpKitUnsignedTransactionArtifact,
} from "./transaction-codec.js";

const ALLOWED_INVOKED_PROGRAMS = new Set([
  PUMP_PROGRAM_ID,
  PUMP_SWAP_PROGRAM_ID,
  PUMP_FEE_PROGRAM_ID,
  "11111111111111111111111111111111",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const PROGRAM_INVOKE_PATTERN = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke \[\d+\]$/u;

export function arePumpInvokedProgramsAllowed(programs: string[]): boolean {
  return (programs.includes(PUMP_PROGRAM_ID) || programs.includes(PUMP_SWAP_PROGRAM_ID)) && programs.every((program) => ALLOWED_INVOKED_PROGRAMS.has(program));
}

export type PumpKitSimulationRpc = {
  getMultipleAccountsInfoAndContext(addresses: string[], config: { commitment: "finalized" }): Promise<{
    context: { slot: number };
    value: Array<PumpRpcAccount | null>;
  }>;
  getFeeForMessage(messageBase64: string, config: { commitment: "confirmed" }): Promise<{
    context: { slot: number };
    value: number | null;
  }>;
  simulateTransaction(transactionBase64: string, config: {
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
      accounts?: PumpRpcSimulationAccount[] | null;
      innerInstructions?: PumpRpcInnerInstructionGroup[] | null;
    };
  }>;
};

export async function simulatePumpKitUnsignedTransaction(input: {
  rpc: PumpKitSimulationRpc;
  transaction: PumpKitUnsignedTransactionArtifact;
  instructionData: Uint8Array;
  plan: PumpInstructionPlan;
  evidence: PumpV2FinalizedBuildEvidence;
  feePreview: PumpFeePreview;
  maxNetworkFeeLamports: number;
  maxFeePercent: number;
  now?: Date;
}): Promise<PumpSimulationArtifact> {
  validateLimits(input.maxNetworkFeeLamports, input.maxFeePercent);
  const inspection = inspectPumpKitUnsignedTransaction({
    serialized: input.transaction.serialized,
    walletAddress: input.plan.walletAddress,
    plan: input.plan,
    expectedBlockhash: input.transaction.recentBlockhash,
    expectedInstructionData: input.instructionData,
  });
  if (!inspection.allowed) return artifact("blocked", input.evidence.slot, null, null, null, null, null, "unavailable", [], [], "Unsigned transaction no longer matches the inspected Pump artifact.", input.now);

  const decoded = getTransactionDecoder().decode(input.transaction.serialized);
  const message = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
  const staticAccounts = message.staticAccounts.map(String);
  const messageBase64 = Buffer.from(decoded.messageBytes).toString("base64");
  const candidateAddresses = [...new Set(input.plan.accounts
    .filter((account) => account.writable && !account.signer)
    .map((account) => account.address))];
  if (candidateAddresses.some((account) => !staticAccounts.includes(account))) {
    return artifact("blocked", input.evidence.slot, null, null, null, null, null, "unavailable", [], [], "A writable account is not bound to the decoded transaction.", input.now);
  }

  const [preAccounts, fee, simulation] = await Promise.all([
    input.rpc.getMultipleAccountsInfoAndContext(candidateAddresses, { commitment: "finalized" }),
    input.rpc.getFeeForMessage(messageBase64, { commitment: "confirmed" }),
    input.rpc.simulateTransaction(input.transaction.serializedBase64, {
      commitment: "confirmed",
      sigVerify: false,
      replaceRecentBlockhash: false,
      innerInstructions: true,
      accounts: { encoding: "base64", addresses: candidateAddresses },
    }),
  ]);
  const logs = boundedLogs(simulation.value.logs);
  const simulationUnits = units(simulation.value.unitsConsumed);
  if (preAccounts.context.slot < input.evidence.slot || fee.context.slot < input.evidence.slot || simulation.context.slot < input.evidence.slot) {
    return artifact("blocked", simulation.context.slot, simulationUnits, fee.value, null, null, null, "unavailable", [], logs, "Simulation, fee, or account evidence predates the finalized Pump state.", input.now);
  }
  if (logs.some((line) => /log truncated/iu.test(line))) {
    return artifact("blocked", simulation.context.slot, simulationUnits, fee.value, null, null, null, "unavailable", [], logs, "Simulation logs were truncated, so invoked programs cannot be audited completely.", input.now);
  }

  let innerPrograms: string[];
  try {
    innerPrograms = innerProgramIds(simulation.value.innerInstructions, staticAccounts);
  } catch (error) {
    return artifact("blocked", simulation.context.slot, simulationUnits, fee.value, null, null, null, "unavailable", [], logs, error instanceof Error ? error.message : "Simulation inner instructions are invalid.", input.now);
  }
  const loggedPrograms = invokedProgramIds(logs);
  const invokedPrograms = [...new Set([...loggedPrograms, ...innerPrograms])];
  const loggedInnerPrograms = loggedPrograms.filter((program) => program !== PUMP_PROGRAM_ID && program !== PUMP_SWAP_PROGRAM_ID);
  if (loggedInnerPrograms.some((program) => !innerPrograms.includes(program))) {
    return artifact("blocked", simulation.context.slot, simulationUnits, fee.value, null, null, null, "unavailable", invokedPrograms, logs, "Simulation inner-instruction evidence is incomplete.", input.now);
  }
  const denied = invokedPrograms.find((program) => !ALLOWED_INVOKED_PROGRAMS.has(program));
  if (!invokedPrograms.includes(PUMP_PROGRAM_ID) && !invokedPrograms.includes(PUMP_SWAP_PROGRAM_ID)) {
    return artifact("blocked", simulation.context.slot, simulationUnits, fee.value, null, null, null, "unavailable", invokedPrograms, logs, "Simulation did not invoke the pinned Pump program.", input.now);
  }
  if (denied !== undefined) {
    return artifact("blocked", simulation.context.slot, simulationUnits, fee.value, null, null, null, "unavailable", invokedPrograms, logs, `Simulation invoked a non-allowlisted program: ${denied}`, input.now);
  }

  let rentLamports: number;
  try {
    rentLamports = createdAccountFunding(preAccounts.value, simulation.value.accounts, candidateAddresses.length);
  } catch (error) {
    return artifact("blocked", simulation.context.slot, simulationUnits, fee.value, null, null, null, "unavailable", invokedPrograms, logs, error instanceof Error ? error.message : "Simulation account evidence is invalid.", input.now);
  }
  if (simulation.value.err !== null) {
    return artifact("failed", simulation.context.slot, simulationUnits, fee.value, rentLamports, null, null, "unavailable", invokedPrograms, logs, friendlyError(simulation.value.err, logs), input.now);
  }
  if (fee.value === null || !Number.isSafeInteger(fee.value) || fee.value < 0) {
    return artifact("blocked", simulation.context.slot, simulationUnits, null, rentLamports, null, null, "unavailable", invokedPrograms, logs, "Network fee could not be verified.", input.now);
  }

  const quoteBasis = BigInt(input.feePreview.grossQuoteAmount);
  const networkFeePercent = quoteBasis === 0n ? null : Number(BigInt(fee.value) * 1_000_000n / quoteBasis) / 10_000;
  const absoluteExceeded = fee.value > input.maxNetworkFeeLamports;
  const percentExceeded = networkFeePercent !== null && networkFeePercent > input.maxFeePercent;
  const utilization = Math.max(fee.value / input.maxNetworkFeeLamports, networkFeePercent === null ? 0 : networkFeePercent / input.maxFeePercent);
  const feeRisk = absoluteExceeded || percentExceeded ? "extreme" : utilization >= 0.75 ? "high" : "reasonable";
  const totalKnown = BigInt(fee.value) + BigInt(rentLamports) + BigInt(input.feePreview.totalTradingFeeQuoteAmount);
  if (absoluteExceeded || percentExceeded) {
    return artifact("blocked", simulation.context.slot, simulationUnits, fee.value, rentLamports, networkFeePercent, totalKnown.toString(), feeRisk, invokedPrograms, logs, "Pump fee guard blocked the simulated transaction.", input.now);
  }
  return artifact("passed", simulation.context.slot, simulationUnits, fee.value, rentLamports, networkFeePercent, totalKnown.toString(), feeRisk, invokedPrograms, logs, null, input.now);
}

function createdAccountFunding(pre: Array<PumpRpcAccount | null>, post: PumpRpcSimulationAccount[] | null | undefined, expected: number): number {
  if (post === null || post === undefined || pre.length !== expected || post.length !== expected) throw new Error("Pump simulation account evidence is incomplete.");
  return post.reduce((sum, account, index) => {
    if (pre[index] !== null || account === null) return sum;
    if (!Number.isSafeInteger(account.lamports) || account.lamports < 0) throw new Error("Pump simulated account funding is invalid.");
    return sum + account.lamports;
  }, 0);
}

function innerProgramIds(groups: PumpRpcInnerInstructionGroup[] | null | undefined, staticAccounts: string[]): string[] {
  if (groups === null || groups === undefined) return [];
  const programs: string[] = [];
  for (const group of groups) {
    if (!Number.isSafeInteger(group.index) || group.index < 0 || !Array.isArray(group.instructions)) throw new Error("Simulation returned invalid inner instructions.");
    for (const instruction of group.instructions) {
      if (!Number.isSafeInteger(instruction.programIdIndex) || instruction.programIdIndex < 0) throw new Error("Simulation returned an unresolvable inner instruction.");
      const program = staticAccounts[instruction.programIdIndex];
      if (program === undefined) throw new Error("Simulation inner program is outside the decoded transaction.");
      programs.push(program);
    }
  }
  return [...new Set(programs)];
}

function invokedProgramIds(logs: string[]): string[] {
  return [...new Set(logs.map((line) => PROGRAM_INVOKE_PATTERN.exec(line)?.[1]).filter((program): program is string => program !== undefined))];
}

function boundedLogs(logs: string[] | null): string[] {
  return Array.isArray(logs) ? logs.filter((line) => typeof line === "string").slice(0, 200).map((line) => line.slice(0, 500)) : [];
}

function units(value: number | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function friendlyError(error: unknown, logs: string[]): string {
  const evidence = `${String(error)} ${logs.join(" ")}`;
  if (/insufficient funds/iu.test(evidence)) return "Simulation failed because the selected wallet has insufficient SOL or tokens. Nothing was signed or broadcast.";
  if (/slippage|minimum.*output/iu.test(evidence)) return "Simulation failed because the approved minimum output can no longer be met. Nothing was signed or broadcast.";
  return "Pump simulation failed safely. Nothing was signed or broadcast.";
}

function validateLimits(maxNetworkFeeLamports: number, maxFeePercent: number): void {
  if (!Number.isSafeInteger(maxNetworkFeeLamports) || maxNetworkFeeLamports < 1) throw new Error("Pump maximum network fee is invalid");
  if (!Number.isFinite(maxFeePercent) || maxFeePercent <= 0 || maxFeePercent > 100) throw new Error("Pump maximum fee percentage is invalid");
}

function artifact(
  status: PumpSimulationArtifact["status"], simulationSlot: number, unitsConsumed: number | null, networkFeeLamports: number | null,
  rentLamports: number | null, networkFeePercent: number | null, totalKnownFeeLamports: string | null, feeRisk: PumpSimulationArtifact["feeRisk"],
  invokedPrograms: string[], logs: string[], error: string | null, now = new Date(),
): PumpSimulationArtifact {
  return PumpSimulationArtifactSchema.parse({ status, simulationSlot, unitsConsumed, networkFeeLamports, rentLamports, networkFeePercent, totalKnownFeeLamports, feeRisk, invokedPrograms, logs, error, transactionSigned: false, broadcastAttempted: false, simulatedAt: now.toISOString() });
}
