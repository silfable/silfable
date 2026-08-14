export type VenueId = "bridge" | "evm" | "hyperliquid" | "dca" | "tp_sl" | "full_access";

export type VenueExecutionEvidence = {
  signerCustody: boolean;
  deterministicPolicy: boolean;
  freshSimulation: boolean;
  receiptReconciliation: boolean;
  recoveryDrill: boolean;
  securityAudit: boolean;
  controlledMainnetAcceptance: boolean;
  explicitFinalApproval: boolean;
  revocationAndKillSwitch: boolean;
  spendLimits: boolean;
};

export type VenueExecutionDecision = {
  venue: VenueId;
  allowed: boolean;
  missing: string[];
};

const REQUIRED: Record<VenueId, Array<keyof VenueExecutionEvidence>> = {
  bridge: ["signerCustody", "deterministicPolicy", "freshSimulation", "receiptReconciliation", "recoveryDrill", "securityAudit", "controlledMainnetAcceptance", "explicitFinalApproval", "revocationAndKillSwitch", "spendLimits"],
  evm: ["signerCustody", "deterministicPolicy", "freshSimulation", "receiptReconciliation", "recoveryDrill", "securityAudit", "controlledMainnetAcceptance", "explicitFinalApproval", "revocationAndKillSwitch", "spendLimits"],
  hyperliquid: ["signerCustody", "deterministicPolicy", "freshSimulation", "receiptReconciliation", "recoveryDrill", "securityAudit", "controlledMainnetAcceptance", "explicitFinalApproval", "revocationAndKillSwitch", "spendLimits"],
  dca: ["signerCustody", "deterministicPolicy", "freshSimulation", "receiptReconciliation", "recoveryDrill", "securityAudit", "controlledMainnetAcceptance", "explicitFinalApproval", "revocationAndKillSwitch", "spendLimits"],
  tp_sl: ["signerCustody", "deterministicPolicy", "freshSimulation", "receiptReconciliation", "recoveryDrill", "securityAudit", "controlledMainnetAcceptance", "explicitFinalApproval", "revocationAndKillSwitch", "spendLimits"],
  // Full Access can never mean a policy or kill-switch bypass. It requires the
  // same transaction gates as every other venue, including final approval.
  full_access: ["signerCustody", "deterministicPolicy", "freshSimulation", "receiptReconciliation", "recoveryDrill", "securityAudit", "controlledMainnetAcceptance", "explicitFinalApproval", "revocationAndKillSwitch", "spendLimits"],
};

const LABELS: Record<keyof VenueExecutionEvidence, string> = {
  signerCustody: "isolated signer custody",
  deterministicPolicy: "deterministic policy",
  freshSimulation: "fresh simulation",
  receiptReconciliation: "receipt reconciliation",
  recoveryDrill: "recovery drill",
  securityAudit: "security audit",
  controlledMainnetAcceptance: "controlled Mainnet acceptance",
  explicitFinalApproval: "explicit final approval",
  revocationAndKillSwitch: "revocation and kill switch",
  spendLimits: "spend limits",
};

export class VenueExecutionGate {
  readonly #evidence: VenueExecutionEvidence;

  constructor(evidence: Partial<VenueExecutionEvidence> = {}) {
    this.#evidence = {
      signerCustody: false,
      deterministicPolicy: false,
      freshSimulation: false,
      receiptReconciliation: false,
      recoveryDrill: false,
      securityAudit: false,
      controlledMainnetAcceptance: false,
      explicitFinalApproval: false,
      revocationAndKillSwitch: false,
      spendLimits: false,
      ...evidence,
    };
  }

  evaluate(venue: VenueId): VenueExecutionDecision {
    const missing = REQUIRED[venue].filter((requirement) => !this.#evidence[requirement]).map((requirement) => LABELS[requirement]);
    return { venue, allowed: missing.length === 0, missing };
  }

  require(venue: VenueId): void {
    const decision = this.evaluate(venue);
    if (!decision.allowed) {
      throw new Error(`${venue} execution is disabled until: ${decision.missing.join(", ")}.`);
    }
  }
}
