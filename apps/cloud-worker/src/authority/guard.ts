import {
  DelegatedAuthorityPolicySchema,
  type DelegatedCapability,
} from "@silfable/contracts";

export type MonitorAuthorityDecision = {
  monitoringAllowed: boolean;
  proposalAllowed: boolean;
  executionAllowed: false;
  signingAllowed: false;
  broadcastAllowed: false;
  reason:
    | "ACTIVE_MONITOR_POLICY"
    | "AUTHORITY_MISSING"
    | "AUTHORITY_REVOKED"
    | "AUTHORITY_EXPIRED"
    | "KILL_SWITCH_ENGAGED"
    | "INVALID_POLICY"
    | "CAPABILITY_NOT_GRANTED";
};

export function evaluateMonitorAuthority(input: {
  policy: unknown;
  status: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  killSwitchEngaged: boolean;
  requiredCapability?: DelegatedCapability;
  now?: Date;
}): MonitorAuthorityDecision {
  const blocked = (
    reason: Exclude<MonitorAuthorityDecision["reason"], "ACTIVE_MONITOR_POLICY">,
  ): MonitorAuthorityDecision => ({
    monitoringAllowed: false,
    proposalAllowed: false,
    executionAllowed: false,
    signingAllowed: false,
    broadcastAllowed: false,
    reason,
  });

  if (input.killSwitchEngaged) return blocked("KILL_SWITCH_ENGAGED");
  if (!input.policy || !input.status || !input.expiresAt) return blocked("AUTHORITY_MISSING");
  if (input.revokedAt || input.status === "REVOKED") return blocked("AUTHORITY_REVOKED");
  if (input.expiresAt.getTime() <= (input.now ?? new Date()).getTime()) {
    return blocked("AUTHORITY_EXPIRED");
  }

  const parsed = DelegatedAuthorityPolicySchema.safeParse(input.policy);
  if (!parsed.success) return blocked("INVALID_POLICY");
  if (
    input.requiredCapability &&
    !parsed.data.capabilities.includes(input.requiredCapability)
  ) {
    return blocked("CAPABILITY_NOT_GRANTED");
  }

  return {
    monitoringAllowed:
      parsed.data.capabilities.includes("MONITOR_MARKET") ||
      parsed.data.capabilities.includes("READ_PORTFOLIO"),
    proposalAllowed: parsed.data.capabilities.includes("PREPARE_PROPOSAL"),
    executionAllowed: false,
    signingAllowed: false,
    broadcastAllowed: false,
    reason: "ACTIVE_MONITOR_POLICY",
  };
}

