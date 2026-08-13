import {
  PumpLaunchDraftSchema,
  type PumpLaunchDraft,
  type PumpLaunchMetadata,
} from "@silfable/contracts";

const MAX_LAUNCH_DEADLINE_MS = 24 * 60 * 60 * 1_000;
const MAX_CREATOR_OUTFLOW_LAMPORTS = 10_000_000_000n;
const MAX_PRIORITY_FEE_LAMPORTS = 10_000_000n;

export type PumpLaunchDraftInput = {
  creatorWallet: string;
  metadata: PumpLaunchMetadata;
  quoteAsset: "SOL" | "USDC";
  initialPurchaseAmount: string;
  maxCreatorOutflowLamports: string;
  maxPriorityFeeLamports: string;
  deadlineAt: string;
  acknowledgedIrreversiblePublication: true;
};

/**
 * Creates a typed Pump.fun launch-review artifact. It deliberately does not
 * inspect an IDL, upload metadata, construct a transaction, sign, or broadcast.
 * Those are separate future gates and must not be approximated by a draft.
 */
export function createPumpLaunchDraft(
  input: PumpLaunchDraftInput,
  now = new Date(),
): PumpLaunchDraft {
  const deadline = Date.parse(input.deadlineAt);
  if (!Number.isFinite(deadline) || deadline <= now.getTime() || deadline > now.getTime() + MAX_LAUNCH_DEADLINE_MS) {
    throw new Error("Token launch deadline must be between now and 24 hours from now");
  }
  const outflow = parsePositiveAmount(input.maxCreatorOutflowLamports, "Maximum creator outflow");
  const priority = parseNonnegativeAmount(input.maxPriorityFeeLamports, "Maximum priority fee");
  const initialPurchase = parseNonnegativeAmount(input.initialPurchaseAmount, "Initial purchase amount");
  if (outflow > MAX_CREATOR_OUTFLOW_LAMPORTS) {
    throw new Error("Maximum creator outflow exceeds the guarded launch ceiling");
  }
  if (priority > MAX_PRIORITY_FEE_LAMPORTS) {
    throw new Error("Maximum priority fee exceeds the guarded launch ceiling");
  }
  if (priority > outflow) {
    throw new Error("Maximum priority fee cannot exceed maximum creator outflow");
  }
  if (input.quoteAsset === "SOL" && initialPurchase + priority > outflow) {
    throw new Error("SOL initial purchase plus priority fee cannot exceed maximum creator outflow");
  }
  return PumpLaunchDraftSchema.parse({
    id: crypto.randomUUID(),
    creatorWallet: input.creatorWallet,
    metadata: input.metadata,
    quoteAsset: input.quoteAsset,
    initialPurchaseAmount: input.initialPurchaseAmount,
    maxCreatorOutflowLamports: input.maxCreatorOutflowLamports,
    maxPriorityFeeLamports: input.maxPriorityFeeLamports,
    deadlineAt: input.deadlineAt,
    acknowledgedIrreversiblePublication: input.acknowledgedIrreversiblePublication,
    lifecycle: "draft-only",
    executionAllowed: false,
    createdAt: now.toISOString(),
  });
}

function parsePositiveAmount(value: string, label: string): bigint {
  if (!/^[1-9]\d*$/u.test(value)) throw new Error(`${label} must be a positive raw amount`);
  return BigInt(value);
}

function parseNonnegativeAmount(value: string, label: string): bigint {
  if (!/^\d+$/u.test(value)) throw new Error(`${label} must be a nonnegative raw amount`);
  return BigInt(value);
}
