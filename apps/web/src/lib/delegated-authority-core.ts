import { createHash } from "node:crypto";
import { z } from "zod";

const SolanaAddressSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u);
export const DelegatedAuthorityPolicySchema = z.object({
  schemaVersion: z.literal(1),
  network: z.literal("solana-mainnet"),
  authorityMode: z.literal("monitor-propose"),
  capabilities: z.array(z.enum([
    "READ_PORTFOLIO",
    "MONITOR_MARKET",
    "PREPARE_PROPOSAL",
    "NOTIFY_USER",
  ])).min(1).max(4),
  allowedMints: z.array(SolanaAddressSchema).max(32),
  maxAllocationLamports: z.string().regex(/^\d+$/u),
  maxSingleProposalLamports: z.string().regex(/^\d+$/u),
  maxNetworkFeeLamports: z.string().regex(/^\d+$/u),
  maxFeeBps: z.number().int().min(0).max(1_000),
  maxSlippageBps: z.number().int().min(0).max(5_000),
  maxActionsPerHour: z.literal(0),
  startsAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  signingAllowed: z.literal(false),
  broadcastAllowed: z.literal(false),
  executionAllowed: z.literal(false),
}).strict().superRefine((policy, context) => {
  if (new Set(policy.capabilities).size !== policy.capabilities.length) {
    context.addIssue({ code: "custom", path: ["capabilities"], message: "Capabilities must be unique" });
  }
  if (new Set(policy.allowedMints).size !== policy.allowedMints.length) {
    context.addIssue({ code: "custom", path: ["allowedMints"], message: "Allowed mints must be unique" });
  }
  const allocation = BigInt(policy.maxAllocationLamports);
  const singleProposal = BigInt(policy.maxSingleProposalLamports);
  const networkFee = BigInt(policy.maxNetworkFeeLamports);
  if (allocation > BigInt("10000000000000")) {
    context.addIssue({ code: "custom", path: ["maxAllocationLamports"], message: "Allocation exceeds the supported ceiling" });
  }
  if (singleProposal > allocation) {
    context.addIssue({ code: "custom", path: ["maxSingleProposalLamports"], message: "A proposal cannot exceed total allocation" });
  }
  if (networkFee > BigInt("10000000")) {
    context.addIssue({ code: "custom", path: ["maxNetworkFeeLamports"], message: "Network-fee ceiling is too high" });
  }
  if (Date.parse(policy.expiresAt) <= Date.parse(policy.startsAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be after start time" });
  }
});
export type DelegatedAuthorityPolicy = z.infer<typeof DelegatedAuthorityPolicySchema>;

export const DELEGATED_AUTHORITY_MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

export function canonicalizeDelegatedPolicy(policy: DelegatedAuthorityPolicy): string {
  return JSON.stringify({
    schemaVersion: policy.schemaVersion,
    network: policy.network,
    authorityMode: policy.authorityMode,
    capabilities: [...policy.capabilities].sort(),
    allowedMints: [...policy.allowedMints].sort(),
    maxAllocationLamports: policy.maxAllocationLamports,
    maxSingleProposalLamports: policy.maxSingleProposalLamports,
    maxNetworkFeeLamports: policy.maxNetworkFeeLamports,
    maxFeeBps: policy.maxFeeBps,
    maxSlippageBps: policy.maxSlippageBps,
    maxActionsPerHour: policy.maxActionsPerHour,
    startsAt: policy.startsAt,
    expiresAt: policy.expiresAt,
    signingAllowed: policy.signingAllowed,
    broadcastAllowed: policy.broadcastAllowed,
    executionAllowed: policy.executionAllowed,
  });
}

export function parseDelegatedPolicy(value: unknown, now = new Date()): DelegatedAuthorityPolicy {
  const policy = DelegatedAuthorityPolicySchema.parse(value);
  const startsAt = new Date(policy.startsAt);
  const expiresAt = new Date(policy.expiresAt);

  if (startsAt.getTime() < now.getTime() - 5 * 60 * 1_000) {
    throw new Error("The delegated policy start time is stale.");
  }
  if (startsAt.getTime() > now.getTime() + 10 * 60 * 1_000) {
    throw new Error("The delegated policy cannot start more than ten minutes from now.");
  }
  if (expiresAt.getTime() < now.getTime() + 5 * 60 * 1_000) {
    throw new Error("The delegated policy must remain valid for at least five minutes.");
  }
  if (expiresAt.getTime() - startsAt.getTime() > DELEGATED_AUTHORITY_MAX_LIFETIME_MS) {
    throw new Error("The delegated policy cannot remain valid for more than thirty days.");
  }
  return policy;
}

export function hashDelegatedPolicy(policy: DelegatedAuthorityPolicy): string {
  return createHash("sha256").update(canonicalizeDelegatedPolicy(policy), "utf8").digest("hex");
}

export function buildDelegatedAuthorityMessage(input: {
  domain: string;
  uri: string;
  walletAddress: string;
  nonce: string;
  policy: DelegatedAuthorityPolicy;
  issuedAt: Date;
  challengeExpiresAt: Date;
}): string {
  const policyHash = hashDelegatedPolicy(input.policy);
  return [
    `${input.domain} requests a bounded Silfable authority from your Solana account:`,
    input.walletAddress,
    "",
    "Authorize monitoring and proposal preparation only.",
    "This policy cannot sign, broadcast, or execute a transaction.",
    "",
    `URI: ${input.uri}`,
    "Version: 1",
    "Chain ID: solana:mainnet",
    `Authority Mode: ${input.policy.authorityMode}`,
    `Capabilities: ${[...input.policy.capabilities].sort().join(", ")}`,
    `Allowed Mints: ${[...input.policy.allowedMints].sort().join(", ") || "none"}`,
    `Max Allocation: ${input.policy.maxAllocationLamports} lamports`,
    `Max Single Proposal: ${input.policy.maxSingleProposalLamports} lamports`,
    `Max Network Fee: ${input.policy.maxNetworkFeeLamports} lamports`,
    `Max Fee: ${input.policy.maxFeeBps} bps`,
    `Max Slippage: ${input.policy.maxSlippageBps} bps`,
    `Policy Starts At: ${input.policy.startsAt}`,
    `Policy Expires At: ${input.policy.expiresAt}`,
    "Signing Allowed: false",
    "Broadcast Allowed: false",
    "Execution Allowed: false",
    `Policy Hash: ${policyHash}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Challenge Expiration Time: ${input.challengeExpiresAt.toISOString()}`,
  ].join("\n");
}

export function delegatedAuthorityStatus(input: {
  status: string;
  expiresAt: Date;
  revokedAt: Date | null;
  killSwitchEngaged: boolean;
}, now = new Date()): "active" | "blocked" | "expired" | "revoked" {
  if (input.killSwitchEngaged) return "blocked";
  if (input.revokedAt || input.status === "REVOKED") return "revoked";
  if (input.expiresAt.getTime() <= now.getTime() || input.status === "EXPIRED") return "expired";
  return input.status === "ACTIVE" ? "active" : "blocked";
}
