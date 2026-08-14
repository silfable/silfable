import { createHash } from "node:crypto";

import {
  PumpFinalRevalidationSchema,
  type PumpFinalRevalidation,
  type PumpRiskEvidence,
  type PumpSimulationArtifact,
  type PumpTradeContractPreview,
} from "@silfable/contracts";

import type {
  PumpV2ProductionSimulation,
  PumpV2ProductionSimulationInput,
} from "./production.js";

import type {
  PumpSwapProductionSimulation,
  PumpSwapProductionSimulationInput,
} from "./pumpswap-production.js";

type PumpProductionSimulation = PumpV2ProductionSimulation | PumpSwapProductionSimulation;
type PumpProductionSimulationInput = PumpV2ProductionSimulationInput | PumpSwapProductionSimulationInput;

const PREPARED_TTL_MS = 90_000;
const FINAL_TTL_MS = 60_000;

export type PreparedPumpExecution = {
  sessionId: string;
  previewId: string;
  walletAddress: string;
  tokenMint: string;
  side: "buy" | "sell";
  input: PumpProductionSimulationInput;
  initialTransactionDigest: string;
  initialStateSlot: number;
  preparedAt: string;
  expiresAt: string;
};

export type FinalPreparedPumpExecution = {
  sessionId: string;
  previewId: string;
  walletAddress: string;
  tokenMint: string;
  side: "buy" | "sell";
  production: PumpProductionSimulation;
  revalidation: PumpFinalRevalidation;
  preparedAt: string;
  expiresAt: string;
};

export class PumpPreparedExecutionService {
  readonly #prepared = new Map<string, PreparedPumpExecution>();
  readonly #finalPrepared = new Map<string, FinalPreparedPumpExecution>();

  prepare(input: {
    sessionId: string;
    preview: PumpTradeContractPreview;
    production: PumpProductionSimulation;
    simulation: PumpSimulationArtifact;
    buildInput: PumpProductionSimulationInput;
    now?: Date;
  }): PreparedPumpExecution {
    const now = input.now ?? new Date();
    const readiness = input.simulation.executionReadiness;
    if (readiness?.status !== "ready-for-final-approval") {
      throw new Error("Pump simulation is not ready for final revalidation");
    }
    if (input.preview.id !== readiness.previewId
      || input.preview.walletAddress !== input.buildInput.walletAddress
      || input.preview.tokenMint !== input.buildInput.tokenMint
      || input.preview.side !== input.buildInput.side
      || input.preview.inputAmount !== input.buildInput.inputAmount
      || input.preview.minimumOutputAmount !== input.buildInput.minimumOutputAmount) {
      throw new Error("Pump prepared transaction does not match the approved proposal");
    }
    if (input.production.unsignedTransaction.signed
      || input.production.broadcastAttempted
      || input.simulation.transactionSigned
      || input.simulation.broadcastAttempted) {
      throw new Error("Pump prepared transaction contains forbidden execution authority");
    }
    this.#purge(now.getTime());
    const prepared: PreparedPumpExecution = {
      sessionId: input.sessionId,
      previewId: input.preview.id,
      walletAddress: input.preview.walletAddress,
      tokenMint: input.preview.tokenMint,
      side: input.preview.side,
      input: { ...input.buildInput },
      initialTransactionDigest: digest(input.production.unsignedTransaction.serialized),
      initialStateSlot: input.production.stateEvidence.slot,
      preparedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + PREPARED_TTL_MS).toISOString(),
    };
    this.#prepared.set(input.preview.id, prepared);
    return structuredClone(prepared);
  }

  consume(input: {
    sessionId: string;
    preview: PumpTradeContractPreview;
    now?: Date;
  }): PreparedPumpExecution {
    const now = input.now ?? new Date();
    this.#purge(now.getTime());
    const prepared = this.#prepared.get(input.preview.id);
    this.#prepared.delete(input.preview.id);
    if (prepared === undefined) {
      throw new Error("Pump simulation approval expired; run a new unsigned simulation");
    }
    if (prepared.sessionId !== input.sessionId
      || prepared.walletAddress !== input.preview.walletAddress
      || prepared.tokenMint !== input.preview.tokenMint
      || prepared.side !== input.preview.side
      || prepared.input.inputAmount !== input.preview.inputAmount
      || prepared.input.minimumOutputAmount !== input.preview.minimumOutputAmount) {
      throw new Error("Pump final revalidation does not match the prepared session proposal");
    }
    return structuredClone(prepared);
  }

  prepareFinal(input: {
    sessionId: string;
    preview: PumpTradeContractPreview;
    production: PumpProductionSimulation;
    revalidation: PumpFinalRevalidation;
    now?: Date;
  }): FinalPreparedPumpExecution {
    const now = input.now ?? new Date();
    this.#purge(now.getTime());
    if (input.revalidation.status !== "ready-for-password"
      || input.revalidation.previewId !== input.preview.id
      || input.revalidation.walletAddress !== input.preview.walletAddress
      || input.revalidation.tokenMint !== input.preview.tokenMint
      || input.revalidation.side !== input.preview.side
      || input.revalidation.checks.some((check) => !check.passed)
      || Date.parse(input.revalidation.expiresAt) <= now.getTime()) {
      throw new Error("Pump final transaction is not eligible for explicit approval");
    }
    const finalDigest = digest(input.production.unsignedTransaction.serialized);
    if (finalDigest !== input.revalidation.finalTransactionDigest
      || input.production.unsignedTransaction.signed
      || input.production.broadcastAttempted
      || input.production.simulation.transactionSigned
      || input.production.simulation.broadcastAttempted) {
      throw new Error("Pump final transaction does not match its unsigned revalidation");
    }
    const expiresAt = new Date(Math.min(
      Date.parse(input.revalidation.expiresAt),
      now.getTime() + FINAL_TTL_MS,
    )).toISOString();
    const prepared: FinalPreparedPumpExecution = {
      sessionId: input.sessionId,
      previewId: input.preview.id,
      walletAddress: input.preview.walletAddress,
      tokenMint: input.preview.tokenMint,
      side: input.preview.side,
      production: structuredClone(input.production),
      revalidation: structuredClone(input.revalidation),
      preparedAt: now.toISOString(),
      expiresAt,
    };
    this.#finalPrepared.set(input.preview.id, prepared);
    return structuredClone(prepared);
  }

  consumeFinal(input: {
    sessionId: string;
    preview: PumpTradeContractPreview;
    expectedDigest: string;
    now?: Date;
  }): FinalPreparedPumpExecution {
    const now = input.now ?? new Date();
    this.#purge(now.getTime());
    const prepared = this.#finalPrepared.get(input.preview.id);
    this.#finalPrepared.delete(input.preview.id);
    if (prepared === undefined) {
      throw new Error("Pump final approval expired; run a new unsigned simulation and revalidation");
    }
    if (prepared.sessionId !== input.sessionId
      || prepared.previewId !== input.preview.id
      || prepared.walletAddress !== input.preview.walletAddress
      || prepared.tokenMint !== input.preview.tokenMint
      || prepared.side !== input.preview.side
      || prepared.revalidation.finalTransactionDigest !== input.expectedDigest
      || digest(prepared.production.unsignedTransaction.serialized) !== input.expectedDigest) {
      throw new Error("Pump execution approval does not match the final revalidated transaction");
    }
    return structuredClone(prepared);
  }

  clear(): void {
    this.#prepared.clear();
    this.#finalPrepared.clear();
  }

  #purge(now: number): void {
    for (const [previewId, prepared] of this.#prepared) {
      if (Date.parse(prepared.expiresAt) <= now) this.#prepared.delete(previewId);
    }
    for (const [previewId, prepared] of this.#finalPrepared) {
      if (Date.parse(prepared.expiresAt) <= now) this.#finalPrepared.delete(previewId);
    }
  }
}

export function evaluatePumpFinalRevalidation(input: {
  prepared: PreparedPumpExecution;
  preview: PumpTradeContractPreview;
  production: PumpProductionSimulation;
  simulation: PumpSimulationArtifact;
  risk: PumpRiskEvidence;
  now?: Date;
}): PumpFinalRevalidation {
  const now = input.now ?? new Date();
  const finalDigest = digest(input.production.unsignedTransaction.serialized);
  const quote = input.production.executableQuote;
  const eligibility = input.simulation.eligibilityEvidence;
  const checks: PumpFinalRevalidation["checks"] = [
    check("cache-binding", Date.parse(input.prepared.expiresAt) > now.getTime(), "The one-time prepared transaction cache remains inside its 90-second lifetime."),
    check("proposal-binding", input.prepared.previewId === input.preview.id && input.preview.status === "ready-for-review" && input.preview.lifecycle === "proposal-only", "The final rebuild remains bound to the approved proposal-only record."),
    check("wallet-binding", input.production.instruction.plan.walletAddress === input.prepared.walletAddress && input.preview.walletAddress === input.prepared.walletAddress, "The selected session wallet remains the sole transaction payer and signer."),
    check("mint-binding", input.production.stateEvidence.mint === input.prepared.tokenMint && input.preview.tokenMint === input.prepared.tokenMint, "Finalized state and the rebuilt instruction remain bound to the exact mint."),
    check("parameter-binding", quote.side === input.prepared.side && quote.inputAmount === input.prepared.input.inputAmount && quote.maxSlippageBps === input.prepared.input.maxSlippageBps, "Side, raw input, and slippage remain identical to the prepared request."),
    check("finalized-state", input.production.stateEvidence.commitment === "finalized" && input.production.stateEvidence.slot >= input.prepared.initialStateSlot, "The final rebuild uses finalized state that does not predate the initial simulation."),
    check("quote-floor", BigInt(quote.minimumOutputAmount) >= BigInt(input.preview.minimumOutputAmount), "The fresh executable quote preserves the user-approved minimum output floor."),
    check("fresh-blockhash", input.production.unsignedTransaction.blockhashContextSlot >= input.production.stateEvidence.slot && input.production.unsignedTransaction.lastValidBlockHeight > 0, "The rebuilt unsigned transaction uses a blockhash no older than its finalized state."),
    check("final-simulation", input.simulation.status === "passed" && input.simulation.error === null && input.simulation.simulationSlot >= input.production.stateEvidence.slot, "The freshly rebuilt unsigned transaction passed its final simulation."),
    check("fee-guard", input.simulation.networkFeeLamports !== null && input.simulation.feeRisk !== "extreme" && input.simulation.feeRisk !== "unavailable", "The final network fee remains available and inside the configured fee guard."),
    check("risk-policy", input.risk.passed && eligibility?.status === "eligible" && eligibility.checks.every((candidate) => candidate.passed), "Global risk policy and all deterministic trade-eligibility checks still pass."),
    check("unsigned", !input.production.unsignedTransaction.signed && !input.production.broadcastAttempted && !input.simulation.transactionSigned && !input.simulation.broadcastAttempted, "Final revalidation grants no signing or broadcast authority."),
  ];
  return PumpFinalRevalidationSchema.parse({
    status: checks.every((candidate) => candidate.passed) ? "ready-for-password" : "blocked",
    previewId: input.preview.id,
    walletAddress: input.preview.walletAddress,
    tokenMint: input.preview.tokenMint,
    side: input.preview.side,
    initialTransactionDigest: input.prepared.initialTransactionDigest,
    finalTransactionDigest: finalDigest,
    initialStateSlot: input.prepared.initialStateSlot,
    finalStateSlot: input.production.stateEvidence.slot,
    finalSimulationSlot: input.simulation.simulationSlot,
    checks,
    requiresMasterPassword: true,
    requiredConfirmation: "EXECUTE PUMP MAINNET",
    signingAttempted: false,
    broadcastAttempted: false,
    executionAllowed: false,
    evaluatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + FINAL_TTL_MS).toISOString(),
  });
}

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function check(id: PumpFinalRevalidation["checks"][number]["id"], passed: boolean, message: string): PumpFinalRevalidation["checks"][number] {
  return { id, passed, message: passed ? message : `${message} Check failed.` };
}
