export const PUMP_IDL_REVISION = "9c82f61cb711b044a17f770ab8ce9f9bdf78f333";
export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_SWAP_PROGRAM_ID = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
export const PUMP_FEE_PROGRAM_ID = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
export const SOL_MINT = "So11111111111111111111111111111111111111112";

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_PROGRAM_IDS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;

type Venue = "pump" | "pumpswap";
type Side = "buy" | "sell";
type Role = { name: string; signer: boolean; writable: boolean; fixedAddress?: string };

export type PumpInstructionAccount = {
  role: string;
  address: string;
  signer: boolean;
  writable: boolean;
};

export type PumpInstructionPlan = {
  venue: Venue;
  side: Side;
  programId: string;
  discriminator: number[];
  tokenMint: string;
  quoteMint: string;
  walletAddress: string;
  accounts: PumpInstructionAccount[];
};

export type PumpInspectionResult = {
  allowed: boolean;
  idlRevision: string;
  instructionName: "buy_exact_quote_in_v2" | "sell_v2" | "buy_exact_quote_in" | "sell";
  checks: Array<{ code: string; status: "pass" | "fail"; message: string }>;
};

const PUMP_BUY: Role[] = [
  role("global"), role("base_mint"), role("quote_mint"), role("base_token_program"), role("quote_token_program"),
  role("associated_token_program", false, false, ASSOCIATED_TOKEN_PROGRAM_ID), role("fee_recipient", false, true),
  role("associated_quote_fee_recipient", false, true), role("buyback_fee_recipient", false, true),
  role("associated_quote_buyback_fee_recipient", false, true), role("bonding_curve", false, true),
  role("associated_base_bonding_curve", false, true), role("associated_quote_bonding_curve", false, true),
  role("user", true, true), role("associated_base_user", false, true), role("associated_quote_user", false, true),
  role("creator_vault", false, true), role("associated_creator_vault", false, true), role("sharing_config"),
  role("global_volume_accumulator"), role("user_volume_accumulator", false, true),
  role("associated_user_volume_accumulator", false, true), role("fee_config"),
  role("fee_program", false, false, PUMP_FEE_PROGRAM_ID), role("system_program", false, false, SYSTEM_PROGRAM_ID),
  role("event_authority"), role("program", false, false, PUMP_PROGRAM_ID),
];

const PUMP_SELL: Role[] = [
  role("global"), role("base_mint"), role("quote_mint"), role("base_token_program"), role("quote_token_program"),
  role("associated_token_program", false, false, ASSOCIATED_TOKEN_PROGRAM_ID), role("fee_recipient", false, true),
  role("associated_quote_fee_recipient", false, true), role("buyback_fee_recipient", false, true),
  role("associated_quote_buyback_fee_recipient", false, true), role("bonding_curve", false, true),
  role("associated_base_bonding_curve", false, true), role("associated_quote_bonding_curve", false, true),
  role("user", true, true), role("associated_base_user", false, true), role("associated_quote_user", false, true),
  role("creator_vault", false, true), role("associated_creator_vault", false, true), role("sharing_config"),
  role("user_volume_accumulator", false, true), role("associated_user_volume_accumulator", false, true),
  role("fee_config"), role("fee_program", false, false, PUMP_FEE_PROGRAM_ID),
  role("system_program", false, false, SYSTEM_PROGRAM_ID), role("event_authority"),
  role("program", false, false, PUMP_PROGRAM_ID),
];

const PUMP_SWAP_BUY: Role[] = [
  role("pool", false, true), role("user", true, true), role("global_config"), role("base_mint"), role("quote_mint"),
  role("user_base_token_account", false, true), role("user_quote_token_account", false, true), role("pool_base_token_account", false, true),
  role("pool_quote_token_account", false, true), role("protocol_fee_recipient"), role("protocol_fee_recipient_token_account", false, true),
  role("base_token_program"), role("quote_token_program"), role("system_program", false, false, SYSTEM_PROGRAM_ID),
  role("associated_token_program", false, false, ASSOCIATED_TOKEN_PROGRAM_ID), role("event_authority"),
  role("program", false, false, PUMP_SWAP_PROGRAM_ID), role("coin_creator_vault_ata", false, true),
  role("coin_creator_vault_authority"), role("global_volume_accumulator"), role("user_volume_accumulator", false, true),
  role("fee_config"), role("fee_program", false, false, PUMP_FEE_PROGRAM_ID),
];

const PUMP_SWAP_SELL: Role[] = [
  role("pool", false, true), role("user", true, true), role("global_config"), role("base_mint"), role("quote_mint"),
  role("user_base_token_account", false, true), role("user_quote_token_account", false, true), role("pool_base_token_account", false, true),
  role("pool_quote_token_account", false, true), role("protocol_fee_recipient"), role("protocol_fee_recipient_token_account", false, true),
  role("base_token_program"), role("quote_token_program"), role("system_program", false, false, SYSTEM_PROGRAM_ID),
  role("associated_token_program", false, false, ASSOCIATED_TOKEN_PROGRAM_ID), role("event_authority"),
  role("program", false, false, PUMP_SWAP_PROGRAM_ID), role("coin_creator_vault_ata", false, true),
  role("coin_creator_vault_authority"), role("fee_config"), role("fee_program", false, false, PUMP_FEE_PROGRAM_ID),
];

const MANIFESTS = {
  "pump:buy": { programId: PUMP_PROGRAM_ID, instructionName: "buy_exact_quote_in_v2" as const, discriminator: [194, 171, 28, 70, 104, 77, 91, 47], roles: PUMP_BUY },
  "pump:sell": { programId: PUMP_PROGRAM_ID, instructionName: "sell_v2" as const, discriminator: [93, 246, 130, 60, 231, 233, 64, 178], roles: PUMP_SELL },
  "pumpswap:buy": { programId: PUMP_SWAP_PROGRAM_ID, instructionName: "buy_exact_quote_in" as const, discriminator: [198, 46, 21, 82, 180, 217, 232, 112], roles: PUMP_SWAP_BUY },
  "pumpswap:sell": { programId: PUMP_SWAP_PROGRAM_ID, instructionName: "sell" as const, discriminator: [51, 230, 133, 164, 1, 127, 131, 173], roles: PUMP_SWAP_SELL },
} satisfies Record<`${Venue}:${Side}`, { programId: string; instructionName: PumpInspectionResult["instructionName"]; discriminator: number[]; roles: Role[] }>;

export function pumpInspectorBoundary(venue: "bonding-curve-active" | "pumpswap-migrated" | "bonding-curve-complete" | "unknown", side: Side) {
  const key = venue === "bonding-curve-active" ? `pump:${side}` as const : venue === "pumpswap-migrated" ? `pumpswap:${side}` as const : null;
  const manifest = key === null ? null : MANIFESTS[key];
  return {
    idlRevision: PUMP_IDL_REVISION,
    venue: key?.startsWith("pumpswap") ? "pumpswap" as const : key === null ? "unavailable" as const : "pump" as const,
    instructionName: manifest?.instructionName ?? null,
    accountCount: manifest?.roles.length ?? 0,
    transactionInspected: false as const,
  };
}

export function pumpInstructionManifest(venue: Venue, side: Side) {
  const manifest = MANIFESTS[`${venue}:${side}`];
  return {
    idlRevision: PUMP_IDL_REVISION,
    programId: manifest.programId,
    instructionName: manifest.instructionName,
    discriminator: [...manifest.discriminator],
    roles: manifest.roles.map((expected) => ({ ...expected })),
  };
}

export function inspectPumpInstructionPlan(plan: PumpInstructionPlan): PumpInspectionResult {
  const manifest = MANIFESTS[`${plan.venue}:${plan.side}`];
  const checks: PumpInspectionResult["checks"] = [];
  add(checks, "identity", ADDRESS_PATTERN.test(plan.tokenMint) && plan.tokenMint !== SOL_MINT && ADDRESS_PATTERN.test(plan.walletAddress), "Exact token mint and wallet identity are valid.");
  add(checks, "quote_mint", plan.quoteMint === SOL_MINT, "Quote mint is canonical wrapped SOL.");
  add(checks, "program", plan.programId === manifest.programId, `Program is pinned to ${manifest.programId}.`);
  add(checks, "discriminator", equalBytes(plan.discriminator, manifest.discriminator), `Instruction discriminator matches ${manifest.instructionName}.`);
  add(checks, "account_count", plan.accounts.length === manifest.roles.length, `Account list contains exactly ${manifest.roles.length} audited roles and no remaining accounts.`);
  const roleShape = plan.accounts.length === manifest.roles.length && manifest.roles.every((expected, index) => {
    const actual = plan.accounts[index];
    return actual !== undefined && actual.role === expected.name && actual.signer === expected.signer && actual.writable === expected.writable
      && ADDRESS_PATTERN.test(actual.address) && (expected.fixedAddress === undefined || actual.address === expected.fixedAddress);
  });
  add(checks, "account_roles", roleShape, "Account order, signer flags, writable flags, and fixed program addresses match the pinned IDL manifest.");
  const account = (name: string) => plan.accounts.find((candidate) => candidate.role === name)?.address;
  add(checks, "wallet_binding", account("user") === plan.walletAddress, "The sole expected signer is the selected session wallet.");
  add(checks, "mint_binding", account("base_mint") === plan.tokenMint, "The instruction is bound to the exact session token mint.");
  add(checks, "quote_binding", account("quote_mint") === SOL_MINT, "The venue quote account is wrapped SOL.");
  const tokenPrograms = plan.accounts.filter((candidate) => candidate.role === "token_program" || candidate.role === "base_token_program" || candidate.role === "quote_token_program");
  add(checks, "token_programs", tokenPrograms.length > 0 && tokenPrograms.every((candidate) => TOKEN_PROGRAM_IDS.has(candidate.address)), "Every token program is restricted to SPL Token or Token-2022.");
  const signerSet = plan.accounts.filter((candidate) => candidate.signer);
  add(checks, "sole_signer", signerSet.length === 1 && signerSet[0]?.role === "user" && signerSet[0].address === plan.walletAddress, "No signer other than the selected wallet is present.");
  return { allowed: checks.every((check) => check.status === "pass"), idlRevision: PUMP_IDL_REVISION, instructionName: manifest.instructionName, checks };
}

function role(name: string, signer = false, writable = false, fixedAddress?: string): Role {
  return { name, signer, writable, ...(fixedAddress ? { fixedAddress } : {}) };
}

function add(checks: PumpInspectionResult["checks"], code: string, passed: boolean, success: string): void {
  checks.push({ code, status: passed ? "pass" : "fail", message: passed ? success : `${success} Check failed.` });
}

function equalBytes(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => Number.isInteger(value) && value >= 0 && value <= 255 && value === right[index]);
}
