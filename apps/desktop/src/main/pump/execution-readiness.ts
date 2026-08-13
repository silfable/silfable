import {
  PumpExecutionReadinessSchema,
  type PumpExecutionReadiness,
  type PumpSimulationArtifact,
  type PumpTradeContractPreview,
} from "@silfable/contracts";

const READINESS_TTL_MS = 120_000;
const MAX_CLOCK_SKEW_MS = 5_000;

export function evaluatePumpExecutionReadiness(input: {
  sessionWalletAddress: string;
  sessionTokenMint: string;
  preview: PumpTradeContractPreview;
  simulation: PumpSimulationArtifact;
  now?: Date;
}): PumpExecutionReadiness {
  const now = input.now ?? new Date();
  const simulatedAt = Date.parse(input.simulation.simulatedAt);
  const ageMs = now.getTime() - simulatedAt;
  const checks: PumpExecutionReadiness["checks"] = [
    check("session-binding", input.preview.walletAddress === input.sessionWalletAddress, "Proposal wallet matches the encrypted restricted session wallet."),
    check("exact-mint", input.preview.tokenMint === input.sessionTokenMint, "Proposal mint matches the session's exact-mint scope."),
    check("proposal-ready", input.preview.status === "ready-for-review" && input.preview.lifecycle === "proposal-only", "The persisted Pump proposal is ready for review and remains proposal-only."),
    check("simulation-passed", input.simulation.status === "passed" && input.simulation.error === null, "The unsigned Pump transaction simulation passed."),
    check("fee-guard", input.simulation.feeRisk !== "extreme" && input.simulation.feeRisk !== "unavailable" && input.simulation.networkFeeLamports !== null, "The simulated fee is available and remains inside the enforced fee guard."),
    check("eligibility", input.simulation.eligibilityEvidence?.status === "eligible" && input.simulation.eligibilityEvidence.checks.every((candidate) => candidate.passed), "All deterministic Pump trade-eligibility checks passed."),
    check("risk-policy", input.simulation.riskEvidence?.passed === true && input.simulation.riskEvidence.checks.every((candidate) => candidate.passed), "All persisted Pump risk-policy checks passed."),
    check("freshness", Number.isFinite(simulatedAt) && ageMs >= -MAX_CLOCK_SKEW_MS && ageMs <= READINESS_TTL_MS, "Simulation evidence is no older than two minutes."),
    check("unsigned", input.simulation.transactionSigned === false, "The readiness artifact contains no signature authority."),
    check("no-broadcast", input.simulation.broadcastAttempted === false, "No Pump transaction has been broadcast."),
  ];
  const evaluatedAt = now.toISOString();
  return PumpExecutionReadinessSchema.parse({
    status: checks.every((candidate) => candidate.passed) ? "ready-for-final-approval" : "blocked",
    previewId: input.preview.id,
    walletAddress: input.preview.walletAddress,
    tokenMint: input.preview.tokenMint,
    side: input.preview.side,
    checks,
    requiresMasterPassword: true,
    requiredConfirmation: "EXECUTE PUMP MAINNET",
    executionAllowed: false,
    evaluatedAt,
    expiresAt: new Date(now.getTime() + READINESS_TTL_MS).toISOString(),
  });
}

function check(id: PumpExecutionReadiness["checks"][number]["id"], passed: boolean, message: string): PumpExecutionReadiness["checks"][number] {
  return { id, passed, message: passed ? message : `${message} Check failed.` };
}
