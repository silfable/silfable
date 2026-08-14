import {
  PumpEligibilityEvidenceSchema,
  type PumpEligibilityEvidence,
  type PumpRiskEvidence,
  type PumpSimulationArtifact,
} from "@silfable/contracts";

import type { PumpFeePreview } from "./fees.js";
import type { PumpExecutableQuoteEvidence } from "./quote.js";
import { arePumpInvokedProgramsAllowed } from "./simulation-kit.js";
import type { PumpV2FinalizedBuildEvidence } from "./state.js";

const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const MAX_STATE_AGE_MS = 2 * 60_000;

export function evaluatePumpTradeEligibility(input: {
  venue?: "bonding-curve-active" | "pumpswap-migrated";
  side: "buy" | "sell";
  tokenMint: string;
  inputAmount: string;
  state: PumpV2FinalizedBuildEvidence;
  fee: PumpFeePreview;
  quote: PumpExecutableQuoteEvidence;
  risk: PumpRiskEvidence;
  simulation: PumpSimulationArtifact;
  now?: Date;
}): PumpEligibilityEvidence {
  const venue = input.venue ?? "bonding-curve-active";
  const now = input.now ?? new Date();
  const stateAge = now.getTime() - Date.parse(input.state.verifiedAt);
  const exactMint = input.state.mint === input.tokenMint;
  const reservesAvailable = positive(input.state.curve.virtualTokenReserves)
    && positive(input.state.curve.virtualQuoteReserves)
    && positive(input.state.curve.realTokenReserves);
  const quoteBound = input.quote.side === input.side
    && input.quote.inputAmount === input.inputAmount
    && input.quote.stateSlot === input.state.slot
    && positive(input.quote.expectedOutputAmount)
    && positive(input.quote.minimumOutputAmount);
  const checks: PumpEligibilityEvidence["checks"] = [
    result("exact-mint-binding", exactMint, exactMint ? "Finalized state is bound to the exact requested mint." : "Finalized state does not match the requested mint."),
    result("finalized-state", input.state.commitment === "finalized" && input.state.slot > 0, input.state.commitment === "finalized" ? "Canonical Pump state resolver returned a finalized slot." : "Pump state is not finalized."),
    result("token-program", TOKEN_PROGRAMS.has(input.state.tokenProgram), TOKEN_PROGRAMS.has(input.state.tokenProgram) ? "Mint is owned by an allowlisted Solana token program." : "Mint token program is not allowlisted."),
    result("authorities-revoked", input.state.mintSecurity.initialized && input.state.mintSecurity.mintAuthority === null && input.state.mintSecurity.freezeAuthority === null, input.state.mintSecurity.mintAuthority === null && input.state.mintSecurity.freezeAuthority === null ? "Mint and freeze authorities are revoked." : "Mint or freeze authority remains active."),
    result("active-curve", input.state.curve.realTokenReserves !== "0", input.state.curve.realTokenReserves !== "0"
      ? venue === "pumpswap-migrated" ? "The canonical PumpSwap pool has available base reserves." : "The canonical Pump bonding curve remains active."
      : venue === "pumpswap-migrated" ? "The PumpSwap pool has no available base reserves." : "The Pump bonding curve has no available token reserves."),
    result("reserves-available", reservesAvailable, reservesAvailable ? "Finalized virtual and real reserves are positive." : "Required finalized reserves are unavailable."),
    result("fee-tier", input.fee.allowed && input.fee.totalTradingFeeBps <= input.fee.maxTotalFeeBps, input.fee.allowed ? `Trading fee ${input.fee.totalTradingFeeBps} bps is within the configured ceiling.` : "Finalized Pump trading fees exceed the configured ceiling."),
    result("quote-binding", quoteBound, quoteBound ? "Executable quote matches side, amount, mint state, and finalized slot." : "Executable quote is stale or does not match the proposal."),
    result("state-freshness", Number.isFinite(stateAge) && stateAge >= 0 && stateAge <= MAX_STATE_AGE_MS && input.simulation.simulationSlot >= input.state.slot, Number.isFinite(stateAge) && stateAge >= 0 && stateAge <= MAX_STATE_AGE_MS && input.simulation.simulationSlot >= input.state.slot ? "State is at most two minutes old and simulation does not predate it." : "Pump state or simulation evidence is stale."),
    result("sell-path", positive(input.state.curve.virtualTokenReserves) && positive(input.state.curve.virtualQuoteReserves) && positive(input.quote.expectedOutputAmount), positive(input.state.curve.virtualTokenReserves) && positive(input.state.curve.virtualQuoteReserves) && positive(input.quote.expectedOutputAmount) ? "The active curve has a deterministic non-zero quote path." : "A non-zero exit/quote path could not be established."),
    result("risk-policy", input.risk.passed, input.risk.passed ? "All global Pump risk limits passed." : "One or more global Pump risk limits failed."),
    result("simulation-passed", input.simulation.status === "passed" && input.simulation.error === null, input.simulation.status === "passed" && input.simulation.error === null ? "Unsigned transaction simulation passed." : "Unsigned transaction simulation did not pass."),
    result("program-allowlist", arePumpInvokedProgramsAllowed(input.simulation.invokedPrograms), arePumpInvokedProgramsAllowed(input.simulation.invokedPrograms) ? "Every invoked program is pinned and allowlisted." : "Simulation did not prove the complete Pump program allowlist."),
    result("no-execution-authority", !input.simulation.transactionSigned && !input.simulation.broadcastAttempted, !input.simulation.transactionSigned && !input.simulation.broadcastAttempted ? "Eligibility grants no signing or broadcast authority." : "Eligibility evidence contains forbidden execution authority."),
  ];
  const passed = checks.every((check) => check.passed);
  return PumpEligibilityEvidenceSchema.parse({
    status: passed ? "eligible" : "blocked",
    tokenMint: input.tokenMint,
    venue,
    stateSlot: input.state.slot,
    simulationSlot: input.simulation.simulationSlot,
    checks,
    rankingAllowed: passed,
    executionAllowed: false,
    evaluatedAt: now.toISOString(),
  });
}

function result(id: PumpEligibilityEvidence["checks"][number]["id"], passed: boolean, message: string): PumpEligibilityEvidence["checks"][number] {
  return { id, passed, message };
}

function positive(value: string): boolean {
  return /^[1-9]\d*$/u.test(value);
}
