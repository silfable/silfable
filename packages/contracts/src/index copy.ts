import { z } from "zod";

const SolanaAddressSchema = z.string().regex(
  /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u,
  "Expected a base58 Solana address",
);

export const DelegatedCapabilitySchema = z.enum([
  "READ_PORTFOLIO",
  "MONITOR_MARKET",
  "PREPARE_PROPOSAL",
  "NOTIFY_USER",
]);
export type DelegatedCapability = z.infer<typeof DelegatedCapabilitySchema>;

export const DelegatedAuthorityPolicySchema = z.object({
  schemaVersion: z.literal(1),
  network: z.literal("solana-mainnet"),
  authorityMode: z.literal("monitor-propose"),
  capabilities: z.array(DelegatedCapabilitySchema).min(1).max(4),
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
    context.addIssue({
      code: "custom",
      path: ["capabilities"],
      message: "Capabilities must be unique",
    });
  }
  if (new Set(policy.allowedMints).size !== policy.allowedMints.length) {
    context.addIssue({
      code: "custom",
      path: ["allowedMints"],
      message: "Allowed mints must be unique",
    });
  }

  const allocation = BigInt(policy.maxAllocationLamports);
  const singleProposal = BigInt(policy.maxSingleProposalLamports);
  const networkFee = BigInt(policy.maxNetworkFeeLamports);
  if (allocation > 10_000_000_000_000n) {
    context.addIssue({
      code: "custom",
      path: ["maxAllocationLamports"],
      message: "Allocation limit exceeds the supported policy ceiling",
    });
  }
  if (singleProposal > allocation) {
    context.addIssue({
      code: "custom",
      path: ["maxSingleProposalLamports"],
      message: "A proposal cannot exceed the total allocation limit",
    });
  }
  if (networkFee > 10_000_000n) {
    context.addIssue({
      code: "custom",
      path: ["maxNetworkFeeLamports"],
      message: "Network-fee ceiling exceeds the supported policy maximum",
    });
  }

  const startsAt = Date.parse(policy.startsAt);
  const expiresAt = Date.parse(policy.expiresAt);
  if (expiresAt <= startsAt) {
    context.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "Policy expiry must be after its start time",
    });
  }
  if (expiresAt - startsAt > 30 * 24 * 60 * 60 * 1_000) {
    context.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "Policy lifetime cannot exceed 30 days",
    });
  }
});
export type DelegatedAuthorityPolicy = z.infer<typeof DelegatedAuthorityPolicySchema>;

export const IPC_CHANNELS = {
  runtimeStatus: "runtime:get-status",
  emergencyStopGet: "security:get-emergency-stop",
  emergencyStopEngage: "security:engage-emergency-stop",
  emergencyStopRelease: "security:release-emergency-stop",
  securityConfigurePassword: "security:configure-password",
  securityUnlock: "security:unlock",
  securityChangePassword: "security:change-password",
  securityResetVault: "security:reset-vault",
  sessionList: "session:list",
  sessionUpsert: "session:upsert",
  clipboardWriteWalletAddress: "clipboard:write-wallet-address",
  clipboardWriteTransactionSignature: "clipboard:write-transaction-signature",
  externalOpenTransaction: "external:open-transaction",
  walletCreate: "wallet:create",
  walletImportMnemonic: "wallet:import-mnemonic",
  walletImportPrivateKey: "wallet:import-private-key",
  walletList: "wallet:list",
  walletClearAll: "wallet:clear-all",
  evmWalletGet: "evm:get-wallet",
  evmWalletClearAll: "evm:clear-all-wallets",
  evmWalletCreate: "evm:create-wallet",
  evmWalletImportMnemonic: "evm:import-wallet-mnemonic",
  evmWalletImportPrivateKey: "evm:import-wallet-private-key",
  portfolioGet: "portfolio:get",
  evmPortfolioGet: "evm:get-portfolio",
  walletActivityGet: "wallet:get-activity",
  aiGetSettings: "ai:get-settings",
  aiPreviewOpenRouterModels: "ai:preview-openrouter-models",
  aiSaveProvider: "ai:save-provider",
  aiChat: "ai:chat",
  pumpLaunchDraft: "pump:launch-draft",
  pumpLaunchPreflight: "pump:launch-preflight",
  pumpLaunchFinalRevalidate: "pump:launch-final-revalidate",
  pumpLaunchExecute: "pump:launch-execute",
  pumpLaunchVerifyExecution: "pump:launch-verify-execution",
  r2GetSettings: "storage:get-cloudflare-settings",
  r2SaveSettings: "storage:save-cloudflare-settings",
  r2TestSettings: "storage:test-cloudflare-settings",
  r2PublishLaunchMetadata: "storage:publish-cloudflare-launch-metadata",
  pumpLaunchOpenOfficialCreate: "pump:launch-open-official-create",
  pumpSimulate: "pump:simulate",
  pumpFinalRevalidate: "pump:final-revalidate",
  pumpExecute: "pump:execute",
  pumpVerifyExecution: "pump:verify-execution",
  missionSimulate: "mission:simulate",
  missionExecute: "mission:execute",
  missionVerifyExecution: "mission:verify-execution",
  transactionSettingsGet: "transaction:get-settings",
  transactionSettingsSave: "transaction:save-settings",
  pumpRiskSettingsGet: "pump:get-risk-settings",
  pumpRiskSettingsSave: "pump:save-risk-settings",
  limitOrderSimulate: "trigger:simulate-order",
  limitOrderExecute: "trigger:execute-order",
  limitOrderVerifyExecution: "trigger:verify-execution",
  limitOrderList: "trigger:list-orders",
  limitOrderCancelSimulate: "trigger:simulate-cancel",
  limitOrderCancelExecute: "trigger:execute-cancel",
  limitOrderVerifyCancel: "trigger:verify-cancel",
  bridgePrepare: "bridge:prepare",
  bridgeGetStatus: "bridge:get-status",
  bridgeExecute: "bridge:execute",
  bridgeReconcile: "bridge:reconcile",
  jupiterGetSettings: "jupiter:get-settings",
  jupiterSaveKey: "jupiter:save-key",
  uniswapGetSettings: "uniswap:get-settings",
  uniswapSaveKey: "uniswap:save-key",
  uniswapTestKey: "uniswap:test-key",
  tavilyGetSettings: "tavily:get-settings",
  tavilySaveKey: "tavily:save-key",
  solanaRpcGetSettings: "solana:get-rpc-settings",
  solanaRpcSaveUrl: "solana:save-rpc-url",
  evmGetSettings: "evm:get-settings",
  evmTestRpc: "evm:test-rpc",
  evmSaveRpcUrl: "evm:save-rpc-url",
  evmPrepareKyberSwap: "evm:prepare-kyberswap",
  evmExecuteKyberSwap: "evm:execute-kyberswap",
  evmListReceipts: "evm:list-receipts",
  evmReconcileReceipts: "evm:reconcile-receipts",
  evmBridgePrepare: "evm-bridge:prepare",
  evmBridgeExecute: "evm-bridge:execute",
  evmBridgeListReceipts: "evm-bridge:list-receipts",
  evmBridgeReconcile: "evm-bridge:reconcile",
  robinhoodGetSettings: "robinhood:get-settings",
  robinhoodSaveZeroXKey: "robinhood:save-zeroex-key",
  robinhoodSaveRpcUrl: "robinhood:save-rpc-url",
  robinhoodTestRpc: "robinhood:test-rpc",
  robinhoodTestZeroX: "robinhood:test-zeroex",
  robinhoodWalletGet: "robinhood:get-wallet",
  robinhoodWalletCreate: "robinhood:create-wallet",
  robinhoodWalletImportMnemonic: "robinhood:import-wallet-mnemonic",
  robinhoodWalletImportPrivateKey: "robinhood:import-wallet-private-key",
  robinhoodGetIndicativePrice: "robinhood:get-indicative-price",
  robinhoodPrepareTrade: "robinhood:prepare-trade",
  robinhoodExecuteApproval: "robinhood:execute-approval",
  robinhoodExecuteSwap: "robinhood:execute-swap",
  robinhoodListReceipts: "robinhood:list-receipts",
  robinhoodReconcileReceipts: "robinhood:reconcile-receipts",
} as const;

const RequestBaseSchema = z.object({
  schemaVersion: z.literal(1),
  requestId: z.string().uuid(),
});

export const RuntimeStatusSchema = z.object({
  appVersion: z.string().min(1),
  profile: z.literal("mainnet-guarded"),
  networkHealth: z.enum(["unknown", "healthy", "degraded", "offline"]),
  keystore: z.enum(["locked", "unlocked"]),
  masterPassword: z.enum(["missing", "configured"]),
  wallet: z.enum(["none", "configured"]),
  activeMissionCount: z.number().int().nonnegative(),
  onboardingComplete: z.boolean().optional(),
  setupState: z.any().optional(),
}).strict();
export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>;

export const EmergencyStopStatusSchema = z.object({
  engaged: z.boolean(),
  reason: z.string().min(1).max(200).nullable(),
  engagedAt: z.string().datetime().nullable(),
}).strict().superRefine((value, context) => {
  if (value.engaged !== (value.engagedAt !== null)) {
    context.addIssue({ code: "custom", path: ["engagedAt"], message: "Emergency-stop timestamp must match its state" });
  }
  if (!value.engaged && value.reason !== null) {
    context.addIssue({ code: "custom", path: ["reason"], message: "A released emergency stop cannot retain an active reason" });
  }
});
export type EmergencyStopStatus = z.infer<typeof EmergencyStopStatusSchema>;

export const EmergencyStopGetResponseSchema = z.object({
  schemaVersion: z.literal(1),
  status: EmergencyStopStatusSchema,
}).strict();
export type EmergencyStopGetResponse = z.infer<typeof EmergencyStopGetResponseSchema>;

export const EmergencyStopEngageRequestSchema = RequestBaseSchema.extend({
  reason: z.string().max(200),
  acknowledgedImmediateHalt: z.literal(true),
}).strict();
export type EmergencyStopEngageRequest = z.infer<typeof EmergencyStopEngageRequestSchema>;

export const EmergencyStopReleaseRequestSchema = RequestBaseSchema.extend({
  masterPassword: z.string().min(1).max(256),
  acknowledgedResumeRisk: z.literal(true),
}).strict();
export type EmergencyStopReleaseRequest = z.infer<typeof EmergencyStopReleaseRequestSchema>;

export const EmergencyStopMutationResponseSchema = RequestBaseSchema.extend({
  status: EmergencyStopStatusSchema,
}).strict();
export type EmergencyStopMutationResponse = z.infer<typeof EmergencyStopMutationResponseSchema>;

const PasswordSchema = z.string().min(8, "Password must contain at least 8 characters").max(256, "Password is too long");
export const SecurityConfigurePasswordRequestSchema = RequestBaseSchema.extend({
  password: PasswordSchema,
  confirmPassword: PasswordSchema,
  acknowledgedPasswordLossRisk: z.literal(true),
}).strict().refine((value) => value.password === value.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });
export const SecurityUnlockRequestSchema = RequestBaseSchema.extend({ password: z.string().min(1).max(256) }).strict();
export const SecurityChangePasswordRequestSchema = RequestBaseSchema.extend({
  currentPassword: z.string().min(1).max(256),
  newPassword: PasswordSchema,
  confirmPassword: PasswordSchema,
  acknowledgedPasswordLossRisk: z.literal(true),
}).strict().refine((value) => value.newPassword === value.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });
export const SecurityPasswordMutationResponseSchema = RequestBaseSchema.extend({ keystore: z.literal("unlocked"), masterPassword: z.literal("configured") }).strict();
export type SecurityConfigurePasswordRequest = z.infer<typeof SecurityConfigurePasswordRequestSchema>;
export type SecurityUnlockRequest = z.infer<typeof SecurityUnlockRequestSchema>;
export type SecurityChangePasswordRequest = z.infer<typeof SecurityChangePasswordRequestSchema>;
export type SecurityPasswordMutationResponse = z.infer<typeof SecurityPasswordMutationResponseSchema>;

export const SecurityResetVaultRequestSchema = RequestBaseSchema.extend({
  confirmation: z.literal("SET UP NEW VAULT"),
  acknowledgedPermanentAccessLoss: z.literal(true),
}).strict();
export const SecurityResetVaultResponseSchema = RequestBaseSchema.extend({
  reset: z.literal(true),
  backupCreated: z.boolean(),
}).strict();
export type SecurityResetVaultRequest = z.infer<typeof SecurityResetVaultRequestSchema>;
export type SecurityResetVaultResponse = z.infer<typeof SecurityResetVaultResponseSchema>;

const MissionQuoteSchema = z.object({
  inputMint: z.string().min(32).max(44), outputMint: z.string().min(32).max(44),
  inAmount: z.string().regex(/^[1-9]\d*$/u), outAmount: z.string().regex(/^\d+$/u),
  router: z.string().min(1).max(64), mode: z.string().min(1).max(32),
  feeBps: z.number().int().min(0).max(10_000).nullable(), feeMint: z.string().min(32).max(44).nullable(),
  quoteOnly: z.literal(true), verifiedAt: z.string().datetime(),
}).strict();
export const MissionPolicyCheckSchema = z.object({
  code: z.enum(["wallet_registered", "token_pair_valid", "amount_valid", "slippage_within_limit", "deadline_valid", "balance_sufficient", "quote_only"]),
  status: z.enum(["pass", "fail"]),
  message: z.string().min(1).max(240),
}).strict();
export const MissionContractPreviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["ready-for-review", "blocked"]),
  goal: z.string().min(1).max(400),
  walletAddress: z.string().min(32).max(44),
  inputMint: z.string().min(32).max(44),
  outputMint: z.string().min(32).max(44),
  inputAmount: z.string().regex(/^[1-9]\d*$/u),
  maxSlippageBps: z.number().int().min(0).max(10_000),
  deadlineAt: z.string().datetime(),
  stopConditions: z.array(z.string().min(1).max(160)).min(1).max(8),
  quote: MissionQuoteSchema.nullable(),
  checks: z.array(MissionPolicyCheckSchema).min(1).max(10),
  executionAllowed: z.literal(false),
  createdAt: z.string().datetime(),
}).strict();
export type MissionContractPreview = z.infer<typeof MissionContractPreviewSchema>;
export const PumpTradePolicyCheckSchema = z.object({
  code: z.enum(["wallet_registered", "exact_mint_valid", "venue_verified", "amount_valid", "sol_exposure_within_limit", "minimum_output_valid", "slippage_within_limit", "deadline_valid", "balance_sufficient", "token_authorities_safe", "concentration_within_limit", "liquidity_verified", "quote_only"]),
  status: z.enum(["pass", "fail"]),
  message: z.string().min(1).max(240),
}).strict();
export const PumpTradeContractPreviewSchema = z.object({
  id: z.string().uuid(), status: z.enum(["ready-for-review", "blocked"]), goal: z.string().min(1).max(400),
  walletAddress: z.string().min(32).max(44), side: z.enum(["buy", "sell"]), tokenMint: z.string().min(32).max(44),
  inputMint: z.string().min(32).max(44), outputMint: z.string().min(32).max(44), inputAmount: z.string().regex(/^[1-9]\d*$/u),
  maxSolExposureLamports: z.string().regex(/^\d+$/u), minimumOutputAmount: z.string().regex(/^[1-9]\d*$/u),
  maxSlippageBps: z.number().int().min(0).max(10_000), deadlineAt: z.string().datetime(),
  stopConditions: z.array(z.string().min(1).max(160)).min(1).max(8),
  venue: z.enum(["bonding-curve-active", "bonding-curve-complete", "pumpswap-migrated", "unknown"]),
  risk: z.object({ mintAuthority: z.string().min(32).max(44).nullable(), freezeAuthority: z.string().min(32).max(44).nullable(), top10ConcentrationPercent: z.number().finite().nonnegative().nullable(), liquidityVerified: z.boolean(), evidenceSlot: z.number().int().nonnegative() }).strict(),
  inspectionBoundary: z.object({
    idlRevision: z.string().regex(/^[a-f0-9]{40}$/u),
    venue: z.enum(["pump", "pumpswap", "unavailable"]),
    instructionName: z.enum(["buy_exact_quote_in_v2", "sell_v2", "buy_exact_quote_in", "sell"]).nullable(),
    accountCount: z.number().int().nonnegative(),
    transactionInspected: z.literal(false),
  }).strict().optional(),
  quote: MissionQuoteSchema.nullable(), checks: z.array(PumpTradePolicyCheckSchema).min(1).max(16),
  executionAllowed: z.literal(false), lifecycle: z.literal("proposal-only"), createdAt: z.string().datetime(),
}).strict();
export type PumpTradeContractPreview = z.infer<typeof PumpTradeContractPreviewSchema>;

/**
 * Pump.fun is a token-creation lane in the target product. This contract is
 * intentionally separate from the legacy Pump/PumpSwap buy-and-sell schema
 * above: a historical trade must never be reinterpreted as a token launch.
 * It is a review artifact only and never grants transaction authority.
 */
export const PumpLaunchUrlSchema = z.string().trim().url().max(512).refine(
  (value) => value.startsWith("https://"),
  "Launch metadata URLs must use HTTPS",
);
export const PumpLaunchMetadataUriSchema = z.string().trim().max(512).refine((value) => {
  if (value.startsWith("ipfs://")) {
    return /^ipfs:\/\/[A-Za-z0-9]+(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+)?$/u.test(value);
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}, "Launch metadata URI must use HTTPS or IPFS");
export const PumpLaunchMetadataSchema = z.object({
  name: z.string().trim().min(1).max(32),
  symbol: z.string().trim().regex(/^[A-Za-z0-9]{1,10}$/u, "Symbol must contain 1–10 letters or digits"),
  description: z.string().trim().max(500),
  imageUri: PumpLaunchUrlSchema,
  // A Pump create instruction references hosted metadata JSON. It is optional
  // while drafting so old encrypted drafts remain readable, but will be
  // mandatory for any future preflight.
  metadataUri: PumpLaunchMetadataUriSchema.nullable().optional(),
  websiteUrl: PumpLaunchUrlSchema.nullable(),
  xUrl: PumpLaunchUrlSchema.nullable(),
  telegramUrl: PumpLaunchUrlSchema.nullable(),
}).strict();
export const PumpLaunchDraftInputSchema = z.object({
  creatorWallet: SolanaAddressSchema,
  metadata: PumpLaunchMetadataSchema,
  quoteAsset: z.enum(["SOL", "USDC"]),
  initialPurchaseAmount: z.string().regex(/^\d+$/u),
  maxCreatorOutflowLamports: z.string().regex(/^[1-9]\d*$/u),
  maxPriorityFeeLamports: z.string().regex(/^\d+$/u),
  deadlineAt: z.string().datetime(),
  acknowledgedIrreversiblePublication: z.literal(true),
}).strict();
export type PumpLaunchDraftInput = z.infer<typeof PumpLaunchDraftInputSchema>;
export const PumpLaunchDraftSchema = PumpLaunchDraftInputSchema.extend({
  id: z.string().uuid(),
  lifecycle: z.literal("draft-only"),
  executionAllowed: z.literal(false),
  createdAt: z.string().datetime(),
}).strict();
export type PumpLaunchMetadata = z.infer<typeof PumpLaunchMetadataSchema>;
export type PumpLaunchDraft = z.infer<typeof PumpLaunchDraftSchema>;
export const PumpLaunchDraftRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  input: PumpLaunchDraftInputSchema,
}).strict();
export const PumpLaunchDraftResponseSchema = RequestBaseSchema.extend({
  draft: PumpLaunchDraftSchema,
}).strict();
export type PumpLaunchDraftRequest = z.infer<typeof PumpLaunchDraftRequestSchema>;
export type PumpLaunchDraftResponse = z.infer<typeof PumpLaunchDraftResponseSchema>;
export const PumpLaunchOpenOfficialCreateRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  draftId: z.string().uuid(),
}).strict();
export const PumpLaunchOpenOfficialCreateResponseSchema = RequestBaseSchema.extend({
  opened: z.literal(true),
}).strict();
export type PumpLaunchOpenOfficialCreateRequest = z.infer<typeof PumpLaunchOpenOfficialCreateRequestSchema>;
export type PumpLaunchOpenOfficialCreateResponse = z.infer<typeof PumpLaunchOpenOfficialCreateResponseSchema>;
export const PumpLaunchPreflightCheckSchema = z.object({
  id: z.enum([
    "draft",
    "metadata",
    "global",
    "instruction",
    "signers",
    "simulation",
    "programs",
    "fee",
    "outflow",
    "balance",
    "no-execution",
  ]),
  status: z.enum(["pass", "fail"]),
  message: z.string().min(1).max(240),
}).strict();
export const PumpLaunchPreflightSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  creatorWallet: SolanaAddressSchema,
  mintAddress: SolanaAddressSchema,
  metadataUri: PumpLaunchMetadataUriSchema,
  programId: SolanaAddressSchema,
  instructionName: z.literal("create_v2"),
  sdkVersion: z.literal("1.36.0"),
  signerAddresses: z.tuple([SolanaAddressSchema, SolanaAddressSchema]),
  transactionDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  recentBlockhash: SolanaAddressSchema,
  lastValidBlockHeight: z.number().int().positive(),
  simulationSlot: z.number().int().positive(),
  computeUnitLimit: z.number().int().positive(),
  computeUnitsConsumed: z.number().int().nonnegative().nullable(),
  networkFeeLamports: z.string().regex(/^\d+$/u),
  priorityFeeLamports: z.string().regex(/^\d+$/u),
  rentLamports: z.string().regex(/^\d+$/u),
  totalEstimatedOutflowLamports: z.string().regex(/^\d+$/u),
  invokedPrograms: z.array(SolanaAddressSchema).max(16),
  checks: z.array(PumpLaunchPreflightCheckSchema).min(1).max(16),
  lifecycle: z.literal("unsigned-preflight"),
  signed: z.literal(false),
  broadcastAttempted: z.literal(false),
  executionAllowed: z.literal(false),
  expiresAt: z.string().datetime(),
  simulatedAt: z.string().datetime(),
}).strict();
export type PumpLaunchPreflight = z.infer<typeof PumpLaunchPreflightSchema>;
export const PumpLaunchPreflightRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  draftId: z.string().uuid(),
  acknowledgedNoExecution: z.literal(true),
}).strict();
export const PumpLaunchPreflightResponseSchema = RequestBaseSchema.extend({
  preflight: PumpLaunchPreflightSchema,
}).strict();
export type PumpLaunchPreflightRequest = z.infer<typeof PumpLaunchPreflightRequestSchema>;
export type PumpLaunchPreflightResponse = z.infer<typeof PumpLaunchPreflightResponseSchema>;

export const PumpLaunchFinalRevalidationSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  preflightId: z.string().uuid(),
  creatorWallet: SolanaAddressSchema,
  mintAddress: SolanaAddressSchema,
  transactionDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  status: z.enum(["ready-for-password", "blocked"]),
  finalSimulationSlot: z.number().int().positive(),
  currentBlockHeight: z.number().int().positive(),
  checks: z.array(z.object({
    id: z.enum(["cache-binding", "draft-binding", "wallet-binding", "mint-binding", "digest-binding", "blockhash-live", "final-simulation", "program-allowlist", "fee-cap", "balance", "unsigned", "one-shot"]),
    passed: z.boolean(),
    message: z.string().min(1).max(240),
  }).strict()).length(12),
  requiresMasterPassword: z.literal(true),
  requiredConfirmation: z.literal("LAUNCH TOKEN MAINNET"),
  signingAttempted: z.literal(false),
  broadcastAttempted: z.literal(false),
  executionAllowed: z.literal(false),
  evaluatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  const ready = value.checks.every((check) => check.passed);
  if ((value.status === "ready-for-password") !== ready) {
    context.addIssue({ code: "custom", message: "Token launch final revalidation status must match every deterministic check" });
  }
});
export type PumpLaunchFinalRevalidation = z.infer<typeof PumpLaunchFinalRevalidationSchema>;

export const PumpLaunchExecutionRecordSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  preflightId: z.string().uuid(),
  revalidationId: z.string().uuid(),
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/u),
  creatorWallet: SolanaAddressSchema,
  mintAddress: SolanaAddressSchema,
  transactionDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  lastValidBlockHeight: z.number().int().positive(),
  status: z.enum(["signed-not-broadcast", "broadcast-unknown", "failed", "finalized"]),
  networkFeeLamports: z.number().int().nonnegative(),
  rentLamports: z.number().int().nonnegative(),
  totalEstimatedOutflowLamports: z.string().regex(/^\d+$/u),
  finalizedSlot: z.number().int().positive().nullable(),
  mintAccountVerified: z.boolean(),
  actualNetworkFeeLamports: z.number().int().nonnegative().nullable().default(null),
  actualAccountFundingLamports: z.number().int().nonnegative().nullable().default(null),
  walletPreLamports: z.string().regex(/^\d+$/u).nullable().default(null),
  walletPostLamports: z.string().regex(/^\d+$/u).nullable().default(null),
  actualWalletOutflowLamports: z.string().regex(/^\d+$/u).nullable().default(null),
  settlementVerified: z.boolean().default(false),
  finalizedAt: z.string().datetime().nullable().default(null),
  error: z.string().min(1).max(500).nullable(),
  signedLocally: z.literal(true),
  broadcastAttempted: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.status === "finalized" && (
    !value.mintAccountVerified
    || !value.settlementVerified
    || value.finalizedSlot === null
    || value.finalizedAt === null
    || value.actualNetworkFeeLamports === null
    || value.actualAccountFundingLamports === null
    || value.walletPreLamports === null
    || value.walletPostLamports === null
    || value.actualWalletOutflowLamports === null
  )) {
    context.addIssue({ code: "custom", message: "A finalized token launch must prove its mint account, settlement, costs, and finalized slot" });
  }
  if (value.status === "signed-not-broadcast" && value.broadcastAttempted) {
    context.addIssue({ code: "custom", message: "A signed-not-broadcast token launch cannot report a broadcast attempt" });
  }
});
export type PumpLaunchExecutionRecord = z.infer<typeof PumpLaunchExecutionRecordSchema>;

export const PumpLaunchFinalRevalidateRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  draftId: z.string().uuid(),
  preflightId: z.string().uuid(),
  acknowledgedNoExecution: z.literal(true),
}).strict();
export const PumpLaunchFinalRevalidateResponseSchema = RequestBaseSchema.extend({
  revalidation: PumpLaunchFinalRevalidationSchema,
}).strict();
export type PumpLaunchFinalRevalidateRequest = z.infer<typeof PumpLaunchFinalRevalidateRequestSchema>;
export type PumpLaunchFinalRevalidateResponse = z.infer<typeof PumpLaunchFinalRevalidateResponseSchema>;

export const PumpLaunchExecuteRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  draftId: z.string().uuid(),
  preflightId: z.string().uuid(),
  revalidationId: z.string().uuid(),
  masterPassword: z.string().min(1).max(256),
  confirmation: z.literal("LAUNCH TOKEN MAINNET"),
  acknowledgedIrreversibleLaunch: z.literal(true),
}).strict();
export const PumpLaunchExecuteResponseSchema = RequestBaseSchema.extend({
  execution: PumpLaunchExecutionRecordSchema,
}).strict();
export type PumpLaunchExecuteRequest = z.infer<typeof PumpLaunchExecuteRequestSchema>;
export type PumpLaunchExecuteResponse = z.infer<typeof PumpLaunchExecuteResponseSchema>;

export const PumpLaunchVerifyExecutionRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  draftId: z.string().uuid(),
  executionId: z.string().uuid(),
}).strict();
export const PumpLaunchVerifyExecutionResponseSchema = RequestBaseSchema.extend({
  execution: PumpLaunchExecutionRecordSchema,
}).strict();
export type PumpLaunchVerifyExecutionRequest = z.infer<typeof PumpLaunchVerifyExecutionRequestSchema>;
export type PumpLaunchVerifyExecutionResponse = z.infer<typeof PumpLaunchVerifyExecutionResponseSchema>;

const R2BucketNameSchema = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u, "R2 bucket name is invalid");
const R2AccountIdSchema = z.string().trim().regex(/^[a-f0-9]{32}$/iu, "Cloudflare account ID is invalid");
export const R2PublicBaseUrlSchema = z.string().trim().url().max(512).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.username === "" && url.password === "" && !url.hostname.endsWith(".r2.dev");
}, "Use an HTTPS custom domain for the public R2 URL; r2.dev is not accepted for production");
export const R2SettingsSchema = z.object({
  accountId: R2AccountIdSchema,
  bucket: R2BucketNameSchema,
  publicBaseUrl: R2PublicBaseUrlSchema,
}).strict();
export const R2SettingsResponseSchema = z.object({
  schemaVersion: z.literal(1),
  settings: R2SettingsSchema.nullable(),
  credentialsConfigured: z.boolean(),
  ready: z.boolean(),
}).strict();
export const R2SaveSettingsRequestSchema = RequestBaseSchema.extend({
  settings: R2SettingsSchema,
  accessKeyId: z.string().trim().min(8).max(256).optional(),
  secretAccessKey: z.string().trim().min(16).max(512).optional(),
}).strict();
export const R2SettingsMutationResponseSchema = RequestBaseSchema.extend({
  settings: R2SettingsSchema,
  ready: z.literal(true),
}).strict();
export const R2TestSettingsRequestSchema = RequestBaseSchema.extend({}).strict();
export const R2TestSettingsResponseSchema = RequestBaseSchema.extend({
  reachable: z.literal(true),
  bucket: R2BucketNameSchema,
}).strict();
export const PumpLaunchMetadataPackageSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  storage: z.literal("cloudflare-r2"),
  uri: PumpLaunchUrlSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  publishedAt: z.string().datetime(),
}).strict();
export const R2PublishLaunchMetadataRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  draftId: z.string().uuid(),
}).strict();
export const R2PublishLaunchMetadataResponseSchema = RequestBaseSchema.extend({
  metadataPackage: PumpLaunchMetadataPackageSchema,
}).strict();
export type R2Settings = z.infer<typeof R2SettingsSchema>;
export type R2SettingsResponse = z.infer<typeof R2SettingsResponseSchema>;
export type R2SaveSettingsRequest = z.infer<typeof R2SaveSettingsRequestSchema>;
export type R2SettingsMutationResponse = z.infer<typeof R2SettingsMutationResponseSchema>;
export type R2TestSettingsRequest = z.infer<typeof R2TestSettingsRequestSchema>;
export type R2TestSettingsResponse = z.infer<typeof R2TestSettingsResponseSchema>;
export type PumpLaunchMetadataPackage = z.infer<typeof PumpLaunchMetadataPackageSchema>;
export type R2PublishLaunchMetadataRequest = z.infer<typeof R2PublishLaunchMetadataRequestSchema>;
export type R2PublishLaunchMetadataResponse = z.infer<typeof R2PublishLaunchMetadataResponseSchema>;
export const PumpResearchEligibilityCheckSchema = z.object({
  id: z.enum(["canonical-venue", "token-program", "authorities-revoked", "holder-concentration", "quote-reserves", "reference-buy-path", "reference-sell-path", "price-impact", "freshness", "no-execution-authority"]),
  passed: z.boolean(),
  message: z.string().min(1).max(240),
}).strict();
export const PumpResearchEligibilitySchema = z.object({
  status: z.enum(["eligible", "blocked"]),
  tokenMint: z.string().min(32).max(44),
  venue: z.enum(["bonding-curve-active", "bonding-curve-complete", "pumpswap-migrated", "unknown"]),
  evidenceSlot: z.number().int().nonnegative(),
  thresholds: z.object({
    maxTop10ConcentrationPercent: z.number().finite().min(0).max(100),
    maxReferencePriceImpactBps: z.number().finite().min(0).max(10_000),
    maxEvidenceAgeMs: z.number().int().positive().max(10 * 60_000),
  }).strict(),
  checks: z.array(PumpResearchEligibilityCheckSchema).length(10),
  rankingAllowed: z.boolean(),
  executionAllowed: z.literal(false),
  evaluatedAt: z.string().datetime(),
}).strict().superRefine((evidence, context) => {
  const passed = evidence.checks.every((check) => check.passed);
  if (new Set(evidence.checks.map((check) => check.id)).size !== evidence.checks.length) {
    context.addIssue({ code: "custom", path: ["checks"], message: "Pump research eligibility checks must be unique and complete" });
  }
  if ((evidence.status === "eligible") !== passed || evidence.rankingAllowed !== passed) {
    context.addIssue({ code: "custom", message: "Pump research eligibility must match every deterministic check" });
  }
});
export type PumpResearchEligibility = z.infer<typeof PumpResearchEligibilitySchema>;
export const PumpTokenIntelligenceSchema = z.object({
  mint: z.string().min(32).max(44),
  programId: z.string().min(32).max(44),
  pumpSwapProgramId: z.string().min(32).max(44),
  bondingCurveAddress: z.string().min(32).max(44),
  pumpSwapPoolAddress: z.string().min(32).max(44),
  venue: z.enum(["bonding-curve-active", "bonding-curve-complete", "pumpswap-migrated", "unknown"]),
  bondingCurveExists: z.boolean(),
  accountVerified: z.boolean(),
  pumpSwapPoolVerified: z.boolean(),
  complete: z.boolean().nullable(),
  virtualTokenReserves: z.string().regex(/^\d+$/u).nullable(),
  virtualQuoteReserves: z.string().regex(/^\d+$/u).nullable(),
  realTokenReserves: z.string().regex(/^\d+$/u).nullable(),
  realQuoteReserves: z.string().regex(/^\d+$/u).nullable(),
  tokenTotalSupply: z.string().regex(/^\d+$/u).nullable(),
  tokenProgram: z.string().min(32).max(44).nullable(),
  decimals: z.number().int().min(0).max(18).nullable(),
  mintSupply: z.string().regex(/^\d+$/u).nullable(),
  mintAuthority: z.string().min(32).max(44).nullable(),
  freezeAuthority: z.string().min(32).max(44).nullable(),
  top10ConcentrationPercent: z.number().finite().min(0).max(100).nullable(),
  poolBaseTokenAccount: z.string().min(32).max(44).nullable(),
  poolQuoteTokenAccount: z.string().min(32).max(44).nullable(),
  poolBaseReserves: z.string().regex(/^\d+$/u).nullable(),
  poolQuoteReserves: z.string().regex(/^\d+$/u).nullable(),
  pumpSwapVirtualQuoteReserves: z.string().regex(/^-?\d+$/u).nullable(),
  pumpSwapEffectiveQuoteReserves: z.string().regex(/^\d+$/u).nullable(),
  metrics: z.object({
    quoteMint: z.string().min(32).max(44).nullable(),
    quoteSymbol: z.enum(["SOL", "USDC", "unknown"]),
    spotPriceQuotePerToken: z.number().finite().nonnegative().nullable(),
    estimatedMarketCapQuote: z.number().finite().nonnegative().nullable(),
    curveProgressPercent: z.number().finite().min(0).max(100).nullable(),
    quoteReservesUi: z.number().finite().nonnegative().nullable(),
    referenceBuyInputLamports: z.string().regex(/^\d+$/u),
    referenceBuyPriceImpactBps: z.number().finite().min(0).max(10_000).nullable(),
    referencePath: z.object({
      venue: z.enum(["bonding-curve", "pumpswap", "unavailable"]),
      buyInputQuoteAmount: z.string().regex(/^\d+$/u),
      buyOutputTokenAmount: z.string().regex(/^\d+$/u).nullable(),
      buyPriceImpactBps: z.number().finite().min(0).max(10_000).nullable(),
      sellInputTokenAmount: z.string().regex(/^\d+$/u).nullable(),
      sellOutputQuoteAmount: z.string().regex(/^\d+$/u).nullable(),
      sellPriceImpactBps: z.number().finite().min(0).max(10_000).nullable(),
      roundTripLossBps: z.number().finite().min(0).max(10_000).nullable(),
      estimateKind: z.literal("reserve-only"),
      networkFeeLamports: z.null(),
      rentLamports: z.null(),
      disclosure: z.string().min(1).max(500),
    }).strict(),
    priceImpactNote: z.string().min(1).max(240),
    baseProtocolFeeBps: z.number().int().min(0).max(10_000).nullable(),
    baseCreatorFeeBps: z.number().int().min(0).max(10_000).nullable(),
    feeNote: z.string().min(1).max(240),
  }).strict(),
  slot: z.number().int().nonnegative(),
  warnings: z.array(z.string().min(1).max(500)).max(12),
  verifiedAt: z.string().datetime(),
  researchEligibility: PumpResearchEligibilitySchema.optional(),
}).strict();
export type PumpTokenIntelligence = z.infer<typeof PumpTokenIntelligenceSchema>;
  export const PumpDiscoverySnapshotSchema = z.object({
  source: z.literal("recent-program-transactions"),
  programId: z.string().min(32).max(44),
  commitment: z.literal("finalized"),
    scannedSignatures: z.number().int().min(0).max(10),
    observedMints: z.number().int().min(0).max(100),
    decodedEvents: z.number().int().min(0).max(100).default(0),
    cursorSignature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,128}$/u).nullable().default(null),
    candidates: z.array(z.object({
      mint: z.string().min(32).max(44),
      sourceSignature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,128}$/u),
      sourceSlot: z.number().int().nonnegative(),
      sourceBlockTime: z.string().datetime().nullable(),
      signals: z.array(z.enum([
        "token-created",
        "curve-buy",
        "curve-sell",
        "curve-active",
        "curve-complete",
        "migration-observed",
        "pumpswap-migrated",
        "token-balance-observed",
        "create-event",
        "trade-event",
        "complete-event",
        "migration-event",
      ])).min(1).max(8).default(["token-balance-observed"]),
      intelligence: PumpTokenIntelligenceSchema,
  }).strict()).max(5),
  executionAllowed: z.literal(false),
  disclosure: z.string().min(1).max(500),
  scannedAt: z.string().datetime(),
}).strict().superRefine((snapshot, context) => {
  const mints = snapshot.candidates.map((candidate) => candidate.mint);
  if (new Set(mints).size !== mints.length || snapshot.candidates.some((candidate) => candidate.intelligence.mint !== candidate.mint)) {
    context.addIssue({ code: "custom", path: ["candidates"], message: "Pump discovery candidates must be unique and exactly bound to their intelligence" });
  }
});
export type PumpDiscoverySnapshot = z.infer<typeof PumpDiscoverySnapshotSchema>;
export const LimitOrderPolicyCheckSchema = z.object({
  code: z.enum(["wallet_registered", "token_pair_valid", "amount_valid", "minimum_order_value", "slippage_within_limit", "expiry_valid", "trigger_valid", "balance_sufficient"]),
  status: z.enum(["pass", "fail"]),
  message: z.string().min(1).max(240),
}).strict();
export const LimitOrderContractPreviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["ready-for-review", "blocked"]),
  goal: z.string().min(1).max(400),
  walletAddress: z.string().min(32).max(44),
  inputMint: z.string().min(32).max(44),
  outputMint: z.string().min(32).max(44),
  inputAmount: z.string().regex(/^[1-9]\d*$/u),
  triggerMint: z.string().min(32).max(44),
  triggerCondition: z.enum(["above", "below"]),
  triggerPriceUsd: z.number().finite().positive(),
  maxSlippageBps: z.number().int().min(0).max(10_000),
  expiresAt: z.string().datetime(),
  estimatedInputValueUsd: z.number().finite().nonnegative().nullable(),
  checks: z.array(LimitOrderPolicyCheckSchema).min(1).max(10),
  executionAllowed: z.literal(false),
  lifecycle: z.literal("preview-only"),
  createdAt: z.string().datetime(),
}).strict();
export type LimitOrderContractPreview = z.infer<typeof LimitOrderContractPreviewSchema>;
export const LimitOrderSimulationPreviewSchema = z.object({
  id: z.string().uuid(), orderId: z.string().uuid(), status: z.enum(["passed", "failed", "blocked"]),
  vaultAddress: z.string().min(32).max(44).nullable(), programIds: z.array(z.string().min(32).max(44)).max(12),
  unitsConsumed: z.number().int().nonnegative().nullable(), feeLamports: z.number().int().nonnegative().nullable(),
  accountFundingLamports: z.number().int().nonnegative().nullable().optional(),
  estimatedWalletOutflowLamports: z.string().regex(/^\d+$/u).nullable().optional(),
  feeSol: z.string().min(1).max(64).nullable().optional(),
  feeUsd: z.number().finite().nonnegative().nullable().optional(),
  feePercent: z.number().finite().nonnegative().nullable().optional(),
  feeRisk: z.enum(["reasonable", "high", "extreme", "unavailable"]).optional(),
  feeGuardPassed: z.boolean().optional(),
  feeGuardMessage: z.string().min(1).max(500).nullable().optional(),
  error: z.string().min(1).max(500).nullable(), transactionSigned: z.literal(false), broadcastAttempted: z.literal(false), simulatedAt: z.string().datetime(),
}).strict();
export type LimitOrderSimulationPreview = z.infer<typeof LimitOrderSimulationPreviewSchema>;
export const LimitOrderExecutionReceiptSchema = z.object({
  id: z.string().uuid(), previewId: z.string().uuid(), simulationId: z.string().uuid(), orderId: z.string().min(8).max(128).nullable(),
  status: z.enum(["active", "failed", "unknown"]), depositSignature: z.string().min(32).max(128).nullable(), vaultAddress: z.string().min(32).max(44),
  inputAmount: z.string().regex(/^\d+$/u).nullable().optional(),
  networkFeeLamports: z.number().int().nonnegative().nullable().optional(),
  feeSol: z.string().min(1).max(64).nullable().optional(),
  feeUsd: z.number().finite().nonnegative().nullable().optional(),
  feePercent: z.number().finite().nonnegative().nullable().optional(),
  feeRisk: z.enum(["reasonable", "high", "extreme", "unavailable"]).optional(),
  feeGuardMessage: z.string().min(1).max(500).nullable().optional(),
  explorerUrl: z.string().url().nullable(), depositConfirmed: z.boolean(), chainVerification: z.enum(["finalized", "confirmed", "processed", "not-found", "failed", "unavailable"]),
  chainSlot: z.number().int().nonnegative().nullable(), error: z.string().min(1).max(500).nullable(), verifiedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(),
}).strict();
export type LimitOrderExecutionReceipt = z.infer<typeof LimitOrderExecutionReceiptSchema>;
export const LimitOrderSimulateRequestSchema = RequestBaseSchema.extend({ sessionId: z.string().uuid(), previewId: z.string().uuid(), acknowledgedVaultRegistration: z.literal(true), acknowledgedSimulationOnly: z.literal(true) }).strict();
export const LimitOrderSimulateResponseSchema = RequestBaseSchema.extend({ simulation: LimitOrderSimulationPreviewSchema }).strict();
export const LimitOrderExecuteRequestSchema = RequestBaseSchema.extend({ sessionId: z.string().uuid(), previewId: z.string().uuid(), simulationId: z.string().uuid(), masterPassword: z.string().min(1).max(256), confirmation: z.literal("CREATE LIMIT ORDER"), acknowledgedCustodialVaultDeposit: z.literal(true) }).strict();
export const LimitOrderExecuteResponseSchema = RequestBaseSchema.extend({ receipt: LimitOrderExecutionReceiptSchema }).strict();
export type LimitOrderSimulateRequest = z.infer<typeof LimitOrderSimulateRequestSchema>;
export type LimitOrderSimulateResponse = z.infer<typeof LimitOrderSimulateResponseSchema>;
export type LimitOrderExecuteRequest = z.infer<typeof LimitOrderExecuteRequestSchema>;
export type LimitOrderExecuteResponse = z.infer<typeof LimitOrderExecuteResponseSchema>;
export const LimitOrderViewSchema = z.object({
  id: z.string().min(8).max(128), orderState: z.enum(["pending", "open", "executing", "filled", "pending_withdraw", "cancelled", "expired", "failed"]),
  userPubkey: z.string().min(32).max(44), inputMint: z.string().min(32).max(44), outputMint: z.string().min(32).max(44),
  initialInputAmount: z.string().regex(/^\d+$/u), remainingInputAmount: z.string().regex(/^\d+$/u), triggerMint: z.string().min(32).max(44),
  triggerCondition: z.enum(["above", "below"]), triggerPriceUsd: z.number().finite().positive(), slippageBps: z.number().int().min(0).max(10_000),
  expiresAt: z.number().int().positive(), createdAt: z.number().int().positive(), updatedAt: z.number().int().positive(),
}).strict();
export type LimitOrderView = z.infer<typeof LimitOrderViewSchema>;
export const LimitOrderListRequestSchema = RequestBaseSchema.extend({ walletAddress: z.string().min(32).max(44), state: z.enum(["active", "past"]) }).strict();
export const LimitOrderListResponseSchema = RequestBaseSchema.extend({ orders: z.array(LimitOrderViewSchema).max(50) }).strict();
export const LimitOrderCancelSimulationSchema = z.object({
  id: z.string().uuid(), orderId: z.string().min(8).max(128), status: z.enum(["passed", "failed", "blocked"]), programIds: z.array(z.string().min(32).max(44)).max(12),
  unitsConsumed: z.number().int().nonnegative().nullable(), feeLamports: z.number().int().nonnegative().nullable(), error: z.string().min(1).max(500).nullable(),
  transactionSigned: z.literal(false), broadcastAttempted: z.literal(false), simulatedAt: z.string().datetime(),
}).strict();
export type LimitOrderCancelSimulation = z.infer<typeof LimitOrderCancelSimulationSchema>;
export const LimitOrderCancelReceiptSchema = z.object({
  id: z.string().uuid(), orderId: z.string().min(8).max(128), simulationId: z.string().uuid(), status: z.enum(["cancelled", "failed", "unknown"]),
  withdrawalSignature: z.string().min(32).max(128).nullable(), explorerUrl: z.string().url().nullable(), chainVerification: z.enum(["finalized", "confirmed", "processed", "not-found", "failed", "unavailable"]),
  chainSlot: z.number().int().nonnegative().nullable(), error: z.string().min(1).max(500).nullable(), verifiedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(),
}).strict();
export type LimitOrderCancelReceipt = z.infer<typeof LimitOrderCancelReceiptSchema>;
export const LimitOrderCancelSimulateRequestSchema = RequestBaseSchema.extend({ walletAddress: z.string().min(32).max(44), orderId: z.string().min(8).max(128), acknowledgedWithdrawalSimulationOnly: z.literal(true) }).strict();
export const LimitOrderCancelSimulateResponseSchema = RequestBaseSchema.extend({ simulation: LimitOrderCancelSimulationSchema }).strict();
export const LimitOrderCancelExecuteRequestSchema = RequestBaseSchema.extend({ sessionId: z.string().uuid(), walletAddress: z.string().min(32).max(44), orderId: z.string().min(8).max(128), simulationId: z.string().uuid(), masterPassword: z.string().min(1).max(256), confirmation: z.literal("CANCEL LIMIT ORDER"), acknowledgedVaultWithdrawal: z.literal(true) }).strict();
export const LimitOrderCancelExecuteResponseSchema = RequestBaseSchema.extend({ receipt: LimitOrderCancelReceiptSchema }).strict();
export type LimitOrderListRequest = z.infer<typeof LimitOrderListRequestSchema>;
export type LimitOrderListResponse = z.infer<typeof LimitOrderListResponseSchema>;
export type LimitOrderCancelSimulateRequest = z.infer<typeof LimitOrderCancelSimulateRequestSchema>;
export type LimitOrderCancelSimulateResponse = z.infer<typeof LimitOrderCancelSimulateResponseSchema>;
export type LimitOrderCancelExecuteRequest = z.infer<typeof LimitOrderCancelExecuteRequestSchema>;
export type LimitOrderCancelExecuteResponse = z.infer<typeof LimitOrderCancelExecuteResponseSchema>;
export const LimitOrderVerifyExecutionRequestSchema = RequestBaseSchema.extend({ sessionId: z.string().uuid(), previewId: z.string().uuid(), receiptId: z.string().uuid() }).strict();
export const LimitOrderVerifyExecutionResponseSchema = RequestBaseSchema.extend({ receipt: LimitOrderExecutionReceiptSchema }).strict();
export const LimitOrderVerifyCancelRequestSchema = RequestBaseSchema.extend({ sessionId: z.string().uuid(), orderId: z.string().min(8).max(128), receiptId: z.string().uuid() }).strict();
export const LimitOrderVerifyCancelResponseSchema = RequestBaseSchema.extend({ receipt: LimitOrderCancelReceiptSchema }).strict();
export type LimitOrderVerifyExecutionRequest = z.infer<typeof LimitOrderVerifyExecutionRequestSchema>;
export type LimitOrderVerifyExecutionResponse = z.infer<typeof LimitOrderVerifyExecutionResponseSchema>;
export type LimitOrderVerifyCancelRequest = z.infer<typeof LimitOrderVerifyCancelRequestSchema>;
export type LimitOrderVerifyCancelResponse = z.infer<typeof LimitOrderVerifyCancelResponseSchema>;
export const MissionSimulationPreviewSchema = z.object({
  id: z.string().uuid(),
  missionId: z.string().uuid(),
  status: z.enum(["passed", "failed", "blocked"]),
  router: z.string().min(1).max(64).nullable(),
  expectedOutAmount: z.string().regex(/^\d+$/u).nullable(),
  programIds: z.array(z.string().min(32).max(44)).max(16),
  unitsConsumed: z.number().int().nonnegative().nullable(),
  feeLamports: z.number().int().nonnegative().nullable(),
  accountFundingLamports: z.number().int().nonnegative().nullable().optional(),
  estimatedWalletOutflowLamports: z.string().regex(/^\d+$/u).nullable().optional(),
  feeSol: z.string().min(1).max(64).nullable().optional(),
  feeUsd: z.number().finite().nonnegative().nullable().optional(),
  feePercent: z.number().finite().nonnegative().nullable().optional(),
  feeRisk: z.enum(["reasonable", "high", "extreme", "unavailable"]).optional(),
  feeGuardPassed: z.boolean().optional(),
  feeGuardMessage: z.string().min(1).max(500).optional(),
  logs: z.array(z.string().max(240)).max(20),
  error: z.string().min(1).max(500).nullable(),
  transactionSigned: z.literal(false),
  broadcastAttempted: z.literal(false),
  simulatedAt: z.string().datetime(),
}).strict();
export type MissionSimulationPreview = z.infer<typeof MissionSimulationPreviewSchema>;

export const TransactionPrioritySchema = z.enum(["economy", "standard", "fast"]);
export const TransactionSettingsSchema = z.object({
  maxNetworkFeeLamports: z.number().int().min(5_000).max(10_000_000),
  maxFeePercent: z.number().finite().min(0.1).max(100),
  defaultSlippageBps: z.number().int().min(0).max(300),
  // A hard safety ceiling, distinct from the default suggested to AI/session drafts.
  // The default makes existing persisted settings forward-compatible.
  maxSlippageBps: z.number().int().min(0).max(300).default(300),
  defaultDeadlineMinutes: z.number().int().min(5).max(43_200),
  priority: TransactionPrioritySchema,
}).strict();
export const TransactionSettingsResponseSchema = z.object({ schemaVersion: z.literal(1), settings: TransactionSettingsSchema }).strict();
export const TransactionSettingsSaveRequestSchema = RequestBaseSchema.extend({ settings: TransactionSettingsSchema }).strict();
export const TransactionSettingsMutationResponseSchema = RequestBaseSchema.extend({ settings: TransactionSettingsSchema }).strict();
export type TransactionSettings = z.infer<typeof TransactionSettingsSchema>;
export type TransactionSettingsResponse = z.infer<typeof TransactionSettingsResponseSchema>;
export type TransactionSettingsSaveRequest = z.infer<typeof TransactionSettingsSaveRequestSchema>;
export type TransactionSettingsMutationResponse = z.infer<typeof TransactionSettingsMutationResponseSchema>;
export const PumpRiskSettingsSchema = z.object({
  maxTradingFeeBps: z.number().int().min(1).max(1_000),
  maxSlippageBps: z.number().int().min(0).max(1_000),
  maxSpendPerTradeLamports: z.string().regex(/^[1-9]\d*$/u),
  maxDailySpendLamports: z.string().regex(/^[1-9]\d*$/u),
  maxPerTokenExposureLamports: z.string().regex(/^[1-9]\d*$/u),
  maxTotalExposureLamports: z.string().regex(/^[1-9]\d*$/u),
  maxOpenPositions: z.number().int().min(1).max(100),
  maxTransactionsPerHour: z.number().int().min(1).max(100),
  minSolReserveLamports: z.string().regex(/^\d+$/u),
}).strict().superRefine((value, context) => {
  if (BigInt(value.maxDailySpendLamports) < BigInt(value.maxSpendPerTradeLamports)) context.addIssue({ code: "custom", path: ["maxDailySpendLamports"], message: "Daily spend must cover at least one maximum-size trade" });
  if (BigInt(value.maxTotalExposureLamports) < BigInt(value.maxPerTokenExposureLamports)) context.addIssue({ code: "custom", path: ["maxTotalExposureLamports"], message: "Total exposure must not be below per-token exposure" });
});
export const PumpRiskSettingsResponseSchema = z.object({ schemaVersion: z.literal(1), settings: PumpRiskSettingsSchema }).strict();
export const PumpRiskSettingsSaveRequestSchema = RequestBaseSchema.extend({ settings: PumpRiskSettingsSchema }).strict();
export const PumpRiskSettingsMutationResponseSchema = RequestBaseSchema.extend({ settings: PumpRiskSettingsSchema }).strict();
export type PumpRiskSettings = z.infer<typeof PumpRiskSettingsSchema>;
export type PumpRiskSettingsResponse = z.infer<typeof PumpRiskSettingsResponseSchema>;
export type PumpRiskSettingsSaveRequest = z.infer<typeof PumpRiskSettingsSaveRequestSchema>;
export type PumpRiskSettingsMutationResponse = z.infer<typeof PumpRiskSettingsMutationResponseSchema>;
export const MissionSimulateRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  missionId: z.string().uuid(),
  acknowledgedSimulationOnly: z.literal(true),
}).strict();
export const MissionSimulateResponseSchema = RequestBaseSchema.extend({ simulation: MissionSimulationPreviewSchema }).strict();
export type MissionSimulateRequest = z.infer<typeof MissionSimulateRequestSchema>;
export type MissionSimulateResponse = z.infer<typeof MissionSimulateResponseSchema>;
export const MissionExecutionReceiptSchema = z.object({
  id: z.string().uuid(),
  missionId: z.string().uuid(),
  simulationId: z.string().uuid(),
  status: z.enum(["confirmed", "failed", "unknown"]),
  signature: z.string().min(64).max(128).nullable(),
  explorerUrl: z.string().url().nullable(),
  router: z.string().min(1).max(64),
  inputAmount: z.string().regex(/^\d+$/u).nullable(),
  outputAmount: z.string().regex(/^\d+$/u).nullable(),
  expectedOutputAmount: z.string().regex(/^\d+$/u).nullable().optional(),
  actualSlippageBps: z.number().finite().nullable().optional(),
  actualSlippageRawAmount: z.string().nullable().optional(),
  networkFeeLamports: z.number().int().nonnegative().nullable().optional(),
  actualNetworkFeeLamports: z.number().int().nonnegative().nullable().optional(),
  walletPreLamports: z.string().regex(/^\d+$/u).nullable().optional(),
  walletPostLamports: z.string().regex(/^\d+$/u).nullable().optional(),
  totalWalletOutflowLamports: z.string().regex(/^\d+$/u).nullable().optional(),
  accountFundingLamports: z.string().regex(/^\d+$/u).nullable().optional(),
  walletAddress: z.string().min(32).max(44).optional(),
  inputMint: z.string().min(32).max(44).optional(),
  code: z.number().int().nullable(),
  error: z.string().min(1).max(500).nullable(),
  transactionSigned: z.literal(true),
  broadcastAttempted: z.literal(true),
  executedAt: z.string().datetime(),
  chainVerification: z.enum(["finalized", "confirmed", "processed", "not-found", "failed", "unavailable"]).optional(),
  chainSlot: z.number().int().nonnegative().nullable().optional(),
  chainError: z.string().min(1).max(500).nullable().optional(),
  verifiedAt: z.string().datetime().nullable().optional(),
}).strict();
export type MissionExecutionReceipt = z.infer<typeof MissionExecutionReceiptSchema>;
export const MissionExecuteRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  missionId: z.string().uuid(),
  simulationId: z.string().uuid(),
  masterPassword: z.string().min(1).max(256),
  confirmation: z.literal("EXECUTE MAINNET"),
  acknowledgedIrreversibleMainnetExecution: z.literal(true),
}).strict();
export const MissionExecuteResponseSchema = RequestBaseSchema.extend({ receipt: MissionExecutionReceiptSchema }).strict();
export type MissionExecuteRequest = z.infer<typeof MissionExecuteRequestSchema>;
export type MissionExecuteResponse = z.infer<typeof MissionExecuteResponseSchema>;
export const MissionVerifyExecutionRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  missionId: z.string().uuid(),
  receiptId: z.string().uuid(),
}).strict();
export const MissionVerifyExecutionResponseSchema = RequestBaseSchema.extend({ receipt: MissionExecutionReceiptSchema }).strict();
export type MissionVerifyExecutionRequest = z.infer<typeof MissionVerifyExecutionRequestSchema>;
export type MissionVerifyExecutionResponse = z.infer<typeof MissionVerifyExecutionResponseSchema>;

export const PumpRiskUsageSchema = z.object({
  dailySpendLamports: z.string().regex(/^\d+$/u),
  perTokenExposureLamports: z.string().regex(/^\d+$/u),
  totalExposureLamports: z.string().regex(/^\d+$/u),
  openPositions: z.number().int().nonnegative(),
  transactionsThisHour: z.number().int().nonnegative(),
}).strict();
export type PumpRiskUsage = z.infer<typeof PumpRiskUsageSchema>;

export const PumpRiskLedgerEventSchema = z.object({
  id: z.string().uuid(),
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/u),
  walletAddress: z.string().min(32).max(44),
  tokenMint: z.string().min(32).max(44),
  side: z.enum(["buy", "sell"]),
  spendLamports: z.string().regex(/^\d+$/u),
  exposureDeltaLamports: z.string().regex(/^-?\d+$/u),
  slot: z.number().int().positive(),
  chainVerification: z.literal("finalized"),
  finalizedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  const spend = BigInt(value.spendLamports);
  const exposureDelta = BigInt(value.exposureDeltaLamports);
  if (value.side === "buy" && (spend < 1n || exposureDelta < 1n)) {
    context.addIssue({ code: "custom", message: "A finalized Pump buy must increase exposure and record positive SOL spend" });
  }
  if (value.side === "sell" && (spend !== 0n || exposureDelta >= 0n)) {
    context.addIssue({ code: "custom", message: "A finalized Pump sell must reduce exposure and cannot record buy spend" });
  }
});
export type PumpRiskLedgerEvent = z.infer<typeof PumpRiskLedgerEventSchema>;
export const PumpRiskLedgerSchema = z.object({
  version: z.literal(1),
  events: z.array(PumpRiskLedgerEventSchema).max(5_000),
}).strict();
export type PumpRiskLedger = z.infer<typeof PumpRiskLedgerSchema>;

export const PumpRiskEvidenceSchema = z.object({
  side: z.enum(["buy", "sell"]),
  proposedSpendLamports: z.string().regex(/^\d+$/u),
  walletBalanceLamports: z.string().regex(/^\d+$/u),
  maxNetworkFeeLamports: z.number().int().nonnegative(),
  projectedWalletBalanceLamports: z.string().regex(/^-?\d+$/u),
  reserveFloorLamports: z.string().regex(/^\d+$/u),
  usageSource: z.enum(["no-execution-baseline", "persisted-receipts"]),
  usage: PumpRiskUsageSchema,
  limits: PumpRiskSettingsSchema,
  checks: z.array(z.object({
    id: z.enum(["slippage", "per-trade-spend", "daily-spend", "per-token-exposure", "total-exposure", "open-positions", "hourly-transactions", "sol-reserve"]),
    passed: z.boolean(),
    message: z.string().min(1).max(240),
  }).strict()).length(8),
  passed: z.boolean(),
  evaluatedAt: z.string().datetime(),
}).strict();
export type PumpRiskEvidence = z.infer<typeof PumpRiskEvidenceSchema>;

export const PumpEligibilityEvidenceSchema = z.object({
  status: z.enum(["eligible", "blocked"]),
  tokenMint: z.string().min(32).max(44),
  venue: z.enum(["bonding-curve-active", "pumpswap-migrated"]),
  stateSlot: z.number().int().positive(),
  simulationSlot: z.number().int().nonnegative(),
  checks: z.array(z.object({
    id: z.enum(["exact-mint-binding", "finalized-state", "token-program", "authorities-revoked", "active-curve", "reserves-available", "fee-tier", "quote-binding", "state-freshness", "sell-path", "risk-policy", "simulation-passed", "program-allowlist", "no-execution-authority"]),
    passed: z.boolean(),
    message: z.string().min(1).max(240),
  }).strict()).length(14),
  rankingAllowed: z.boolean(),
  executionAllowed: z.literal(false),
  evaluatedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  const passed = value.checks.every((check) => check.passed);
  if ((value.status === "eligible") !== passed || value.rankingAllowed !== passed) {
    context.addIssue({ code: "custom", message: "Pump eligibility status must match every deterministic check" });
  }
});
export type PumpEligibilityEvidence = z.infer<typeof PumpEligibilityEvidenceSchema>;

export const PumpExecutionReadinessSchema = z.object({
  status: z.enum(["ready-for-final-approval", "blocked"]),
  previewId: z.string().uuid(),
  walletAddress: z.string().min(32).max(44),
  tokenMint: z.string().min(32).max(44),
  side: z.enum(["buy", "sell"]),
  checks: z.array(z.object({
    id: z.enum(["session-binding", "exact-mint", "proposal-ready", "simulation-passed", "fee-guard", "eligibility", "risk-policy", "freshness", "unsigned", "no-broadcast"]),
    passed: z.boolean(),
    message: z.string().min(1).max(240),
  }).strict()).length(10),
  requiresMasterPassword: z.literal(true),
  requiredConfirmation: z.literal("EXECUTE PUMP MAINNET"),
  executionAllowed: z.literal(false),
  evaluatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  const ready = value.checks.every((check) => check.passed);
  if ((value.status === "ready-for-final-approval") !== ready) {
    context.addIssue({ code: "custom", message: "Pump execution readiness must match every deterministic check" });
  }
});
export type PumpExecutionReadiness = z.infer<typeof PumpExecutionReadinessSchema>;

export const PumpFinalRevalidationSchema = z.object({
  status: z.enum(["ready-for-password", "blocked"]),
  previewId: z.string().uuid(),
  walletAddress: z.string().min(32).max(44),
  tokenMint: z.string().min(32).max(44),
  side: z.enum(["buy", "sell"]),
  initialTransactionDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  finalTransactionDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  initialStateSlot: z.number().int().positive(),
  finalStateSlot: z.number().int().positive(),
  finalSimulationSlot: z.number().int().positive(),
  checks: z.array(z.object({
    id: z.enum(["cache-binding", "proposal-binding", "wallet-binding", "mint-binding", "parameter-binding", "finalized-state", "quote-floor", "fresh-blockhash", "final-simulation", "fee-guard", "risk-policy", "unsigned"]),
    passed: z.boolean(),
    message: z.string().min(1).max(240),
  }).strict()).length(12),
  requiresMasterPassword: z.literal(true),
  requiredConfirmation: z.literal("EXECUTE PUMP MAINNET"),
  signingAttempted: z.literal(false),
  broadcastAttempted: z.literal(false),
  executionAllowed: z.literal(false),
  evaluatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  const ready = value.checks.every((check) => check.passed);
  if ((value.status === "ready-for-password") !== ready) {
    context.addIssue({ code: "custom", message: "Pump final revalidation status must match every deterministic check" });
  }
});
export type PumpFinalRevalidation = z.infer<typeof PumpFinalRevalidationSchema>;

export const PumpExecutionReceiptSchema = z.object({
  id: z.string().uuid(),
  previewId: z.string().uuid(),
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/u),
  walletAddress: z.string().min(32).max(44),
  tokenMint: z.string().min(32).max(44),
  side: z.enum(["buy", "sell"]),
  status: z.literal("finalized"),
  slot: z.number().int().positive(),
  networkFeeLamports: z.number().int().nonnegative(),
  accountCreationFundingLamports: z.number().int().nonnegative(),
  walletLamportDelta: z.string().regex(/^-?\d+$/u),
  tokenRawDelta: z.string().regex(/^-?\d+$/u),
  actualInputAmount: z.string().regex(/^[1-9]\d*$/u),
  actualOutputAmount: z.string().regex(/^[1-9]\d*$/u),
  chainVerification: z.literal("finalized"),
  signingSource: z.literal("future-local-signer"),
  broadcastAttempted: z.literal(true),
  reconciledAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  const walletDelta = BigInt(value.walletLamportDelta);
  const tokenDelta = BigInt(value.tokenRawDelta);
  if (value.side === "buy" && (walletDelta >= 0n || tokenDelta <= 0n)) {
    context.addIssue({ code: "custom", message: "A finalized Pump buy must spend SOL and increase the exact token balance" });
  }
  if (value.side === "sell" && (walletDelta <= 0n || tokenDelta >= 0n)) {
    context.addIssue({ code: "custom", message: "A finalized Pump sell must receive SOL and reduce the exact token balance" });
  }
});
export type PumpExecutionReceipt = z.infer<typeof PumpExecutionReceiptSchema>;

export const PumpExecutionRecordSchema = z.object({
  id: z.string().uuid(),
  previewId: z.string().uuid(),
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/u),
  walletAddress: z.string().min(32).max(44),
  tokenMint: z.string().min(32).max(44),
  side: z.enum(["buy", "sell"]),
  transactionDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  lastValidBlockHeight: z.number().int().positive(),
  status: z.enum(["signed-not-broadcast", "broadcast-unknown", "failed", "finalized"]),
  error: z.string().min(1).max(500).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  receipt: PumpExecutionReceiptSchema.optional(),
}).strict().superRefine((value, context) => {
  if ((value.status === "finalized") !== (value.receipt !== undefined)) {
    context.addIssue({ code: "custom", path: ["receipt"], message: "Only a finalized Pump execution may contain a finalized receipt" });
  }
  if (value.receipt !== undefined && (
    value.receipt.id !== value.id
    || value.receipt.previewId !== value.previewId
    || value.receipt.signature !== value.signature
    || value.receipt.walletAddress !== value.walletAddress
    || value.receipt.tokenMint !== value.tokenMint
    || value.receipt.side !== value.side
  )) {
    context.addIssue({ code: "custom", path: ["receipt"], message: "Pump execution receipt does not match its persisted execution scope" });
  }
});
export type PumpExecutionRecord = z.infer<typeof PumpExecutionRecordSchema>;

export const PumpSimulationArtifactSchema = z.object({
  status: z.enum(["passed", "blocked", "failed"]),
  simulationSlot: z.number().int().nonnegative(),
  unitsConsumed: z.number().int().nonnegative().nullable(),
  networkFeeLamports: z.number().int().nonnegative().nullable(),
  rentLamports: z.number().int().nonnegative().nullable(),
  networkFeePercent: z.number().finite().nonnegative().nullable(),
  totalKnownFeeLamports: z.string().regex(/^\d+$/u).nullable(),
  feeRisk: z.enum(["reasonable", "high", "extreme", "unavailable"]),
  invokedPrograms: z.array(z.string().min(32).max(44)).max(16),
  logs: z.array(z.string().max(500)).max(200),
  error: z.string().min(1).max(500).nullable(),
  quoteEvidence: z.object({
    kind: z.literal("exact-finalized"),
    side: z.enum(["buy", "sell"]),
    inputAmount: z.string().regex(/^[1-9]\d*$/u),
    expectedOutputAmount: z.string().regex(/^[1-9]\d*$/u),
    minimumOutputAmount: z.string().regex(/^[1-9]\d*$/u),
    approvedMinimumOutputAmount: z.string().regex(/^[1-9]\d*$/u),
    maxSlippageBps: z.number().int().min(0).max(3_000),
    stateSlot: z.number().int().positive(),
    derivedAt: z.string().datetime(),
  }).strict().optional(),
  riskEvidence: PumpRiskEvidenceSchema.optional(),
  eligibilityEvidence: PumpEligibilityEvidenceSchema.optional(),
  executionReadiness: PumpExecutionReadinessSchema.optional(),
  finalRevalidation: PumpFinalRevalidationSchema.optional(),
  transactionSigned: z.literal(false),
  broadcastAttempted: z.literal(false),
  simulatedAt: z.string().datetime(),
}).strict();
export type PumpSimulationArtifact = z.infer<typeof PumpSimulationArtifactSchema>;
export const PumpSimulateRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  previewId: z.string().uuid(),
  acknowledgedSimulationOnly: z.literal(true),
}).strict();
export const PumpSimulateResponseSchema = RequestBaseSchema.extend({
  simulation: PumpSimulationArtifactSchema,
}).strict();
export type PumpSimulateRequest = z.infer<typeof PumpSimulateRequestSchema>;
export type PumpSimulateResponse = z.infer<typeof PumpSimulateResponseSchema>;
export const PumpFinalRevalidateRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  previewId: z.string().uuid(),
  acknowledgedNoExecution: z.literal(true),
}).strict();
export const PumpFinalRevalidateResponseSchema = RequestBaseSchema.extend({
  simulation: PumpSimulationArtifactSchema,
}).strict();
export type PumpFinalRevalidateRequest = z.infer<typeof PumpFinalRevalidateRequestSchema>;
export type PumpFinalRevalidateResponse = z.infer<typeof PumpFinalRevalidateResponseSchema>;

export const PumpExecuteRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  previewId: z.string().uuid(),
  masterPassword: z.string().min(1).max(256),
  confirmation: z.literal("EXECUTE PUMP MAINNET"),
  acknowledgedIrreversibleExecution: z.literal(true),
}).strict();
export const PumpExecuteResponseSchema = RequestBaseSchema.extend({
  execution: PumpExecutionRecordSchema,
}).strict();
export type PumpExecuteRequest = z.infer<typeof PumpExecuteRequestSchema>;
export type PumpExecuteResponse = z.infer<typeof PumpExecuteResponseSchema>;
export const PumpVerifyExecutionRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  previewId: z.string().uuid(),
  executionId: z.string().uuid(),
}).strict();
export const PumpVerifyExecutionResponseSchema = RequestBaseSchema.extend({
  execution: PumpExecutionRecordSchema,
}).strict();
export type PumpVerifyExecutionRequest = z.infer<typeof PumpVerifyExecutionRequestSchema>;
export type PumpVerifyExecutionResponse = z.infer<typeof PumpVerifyExecutionResponseSchema>;


const SessionEvmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/u);
export const EvmSwapQuoteEvidenceSchema = z.object({
  sellToken: SessionEvmAddressSchema,
  buyToken: SessionEvmAddressSchema,
  sellAmount: z.string().regex(/^[1-9]\d*$/u),
  buyAmount: z.string().regex(/^[1-9]\d*$/u),
  minBuyAmount: z.string().regex(/^[1-9]\d*$/u).nullable(),
  blockNumber: z.string().regex(/^[1-9]\d*$/u).nullable(),
  zeroExFeeAmount: z.string().regex(/^[1-9]\d*$/u).nullable(),
  zeroExFeeToken: SessionEvmAddressSchema.nullable(),
  liquidityAvailable: z.boolean(),
  sellTokenSymbol: z.string().min(1).max(32),
  buyTokenSymbol: z.string().min(1).max(32),
  sellTokenMultiplier: z.string().min(1).max(64),
  buyTokenMultiplier: z.string().min(1).max(64),
}).strict();
export const EvmSwapProposalSchema = z.object({
  id: z.string().uuid(),
  chainId: z.literal(4663),
  walletAddress: SessionEvmAddressSchema,
  slippageBps: z.number().int().min(0).max(1_000),
  quote: EvmSwapQuoteEvidenceSchema,
  status: z.literal("quote-only"),
  createdAt: z.string().datetime(),
}).strict();
export const EvmSwapPreflightEvidenceSchema = z.object({
  id: z.string().uuid(),
  expiresAt: z.string().datetime(),
  allowanceRequired: z.boolean(),
  currentAllowance: z.string().regex(/^\d+$/u),
  gasLimit: z.string().regex(/^[1-9]\d*$/u),
  maxFeePerGas: z.string().regex(/^[1-9]\d*$/u),
  maxGasCostWei: z.string().regex(/^\d+$/u),
  expectedBuyAmount: z.string().regex(/^[1-9]\d*$/u),
  minimumBuyAmount: z.string().regex(/^[1-9]\d*$/u),
  preparedAt: z.string().datetime(),
}).strict();
export const EvmSessionExecutionReceiptSchema = z.object({
  id: z.string().uuid(),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]+$/u),
  kind: z.enum(["approval", "swap"]),
  status: z.enum(["confirmed", "reverted", "unknown"]),
  reconciledAt: z.string().datetime(),
}).strict();
export type EvmSwapQuoteEvidence = z.infer<typeof EvmSwapQuoteEvidenceSchema>;
export type EvmSwapProposal = z.infer<typeof EvmSwapProposalSchema>;
export type EvmSwapPreflightEvidence = z.infer<typeof EvmSwapPreflightEvidenceSchema>;
export type EvmSessionExecutionReceipt = z.infer<typeof EvmSessionExecutionReceiptSchema>;

export const BRIDGE_SOLANA_CHAIN_ID = 792_703_809;
export const BRIDGE_SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const BRIDGE_BASE_CHAIN_ID = 8453;
export const BRIDGE_BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const BRIDGE_ARBITRUM_CHAIN_ID = 42161;
export const BRIDGE_ARBITRUM_USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
export const BRIDGE_ETHEREUM_CHAIN_ID = 1;
export const BRIDGE_ETHEREUM_USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const BRIDGE_OPTIMISM_CHAIN_ID = 10;
export const BRIDGE_OPTIMISM_USDC_ADDRESS = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";
export const BRIDGE_POLYGON_CHAIN_ID = 137;
export const BRIDGE_POLYGON_USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
export const BRIDGE_AVALANCHE_CHAIN_ID = 43114;
export const BRIDGE_AVALANCHE_USDC_ADDRESS = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";
export const BRIDGE_ROBINHOOD_CHAIN_ID = 4663;
export const BRIDGE_ROBINHOOD_USDG_ADDRESS = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

export const BridgeDestinationChainSchema = z.enum(["base", "arbitrum", "ethereum", "optimism", "polygon", "avalanche", "robinhood"]);
export type BridgeDestinationChain = z.infer<typeof BridgeDestinationChainSchema>;

export const BridgeProviderIdSchema = z.enum(["auto", "debridge-dln", "relay"]);
export type BridgeProviderId = z.infer<typeof BridgeProviderIdSchema>;

export const BridgeLifecycleStateSchema = z.enum(["simulated", "executing", "confirmed", "failed"]);
export type BridgeLifecycleState = z.infer<typeof BridgeLifecycleStateSchema>;

export const BridgeContractSchema = z.object({
  id: z.string().uuid(),
  provider: z.string().optional(),
  sourceWallet: z.string().optional(),
  sourceWalletAddress: z.string().optional(),
  destinationWalletAddress: z.string().optional(),
  destinationChainId: z.number().optional(),
  destinationChainKey: z.string().optional(),
  sourceAsset: z.object({
    address: z.string(),
    symbol: z.string().optional(),
    decimals: z.number().optional(),
  }).passthrough().optional(),
  sourceAssetAddress: z.string().optional(),
  destinationAssetAddress: z.string().optional(),
  destination: z.object({
    chainId: z.number().optional(),
    chainKey: z.string().optional(),
    assetAddress: z.string().optional(),
    assetSymbol: z.string().optional(),
    recipient: z.string().optional(),
  }).passthrough().optional(),
  amountIn: z.string().optional(),
  inputAmount: z.string().optional(),
  minimumDestinationAmount: z.string().optional(),
  maximumNetworkFeeWei: z.string().optional(),
  maximumTotalFeeUsd: z.number().optional(),
  slippageBps: z.number().optional(),
  maxSlippageBps: z.number().optional(),
  preferredProvider: z.string().optional(),
  deadline: z.string().optional(),
  deadlineAt: z.string().optional(),
  createdAt: z.string().optional(),
}).passthrough();
export type BridgeContract = z.infer<typeof BridgeContractSchema>;

export const BridgeQuoteEvidenceSchema = z.object({
  providerId: z.string().optional(),
  provider: z.string().optional(),
  orderId: z.string().optional(),
  sourceAmount: z.string().optional(),
  expectedDestinationAmount: z.string().optional(),
  minimumDestinationAmount: z.string().optional(),
  fee: z.object({
    protocolFeeLamports: z.string().optional(),
    sourceNetworkFeeLamports: z.string().optional(),
    sourceAccountFundingLamports: z.string().optional(),
    totalFeeUsd: z.number().optional(),
  }).passthrough().optional(),
  transactionDigest: z.string().optional(),
  quoteExpiresAt: z.string().optional(),
}).passthrough();
export type BridgeQuoteEvidence = z.infer<typeof BridgeQuoteEvidenceSchema>;

export const BridgeProposalSchema = z.object({
  contract: BridgeContractSchema.optional(),
  quote: BridgeQuoteEvidenceSchema.optional(),
  status: z.string().optional(),
}).passthrough();
export type BridgeProposal = z.infer<typeof BridgeProposalSchema>;

export const BridgePreflightEvidenceSchema = z.object({
  id: z.string().uuid(),
  contractId: z.string().optional(),
  orderId: z.string().optional(),
  transactionDigest: z.string().optional(),
  programIds: z.array(z.string()).optional(),
  unitsConsumed: z.number().int().nonnegative().nullable().optional(),
  sourceNetworkFeeLamports: z.number().optional(),
  sourceAccountFundingLamports: z.number().nullable().optional(),
  estimatedWalletOutflowLamports: z.string().nullable().optional(),
  simulatedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  passed: z.boolean().optional(),
  transactionSigned: z.boolean().optional(),
  broadcastAttempted: z.boolean().optional(),
}).passthrough();
export type BridgePreflightEvidence = z.infer<typeof BridgePreflightEvidenceSchema>;

export const BridgeReceiptSchema = z.object({
  id: z.string().uuid(),
  proposal: BridgeProposalSchema.optional(),
  preflight: BridgePreflightEvidenceSchema.optional(),
  signature: z.string().optional(),
  status: z.string().optional(),
  createdAt: z.string().optional(),
}).passthrough();
export type BridgeReceipt = z.infer<typeof BridgeReceiptSchema>;

export const EvmChainIdSchema = z.union([
  z.literal(1),
  z.literal(10),
  z.literal(137),
  z.literal(8453),
  z.literal(42161),
  z.literal(43114),
  z.literal(4663),
]);
export type EvmChainId = z.infer<typeof EvmChainIdSchema>;

export const EvmChainKeySchema = z.enum(["ethereum", "optimism", "polygon", "base", "arbitrum", "avalanche", "robinhood"]);
export type EvmChainKey = z.infer<typeof EvmChainKeySchema>;

export const BridgeProviderStatusSchema = z.object({
  providerId: z.enum(["debridge-dln", "relay"]),
  healthy: z.boolean(),
  latencyMs: z.number().int().nonnegative(),
  lastCheckedAt: z.string().datetime(),
}).strict();
export type BridgeProviderStatus = z.infer<typeof BridgeProviderStatusSchema>;

export const BridgePrepareRequestSchema = RequestBaseSchema.extend({
  contract: BridgeContractSchema,
}).strict();
export const BridgePrepareResponseSchema = RequestBaseSchema.extend({
  proposal: BridgeProposalSchema,
  preflight: BridgePreflightEvidenceSchema,
}).strict();
export const BridgeExecuteRequestSchema = RequestBaseSchema.extend({
  preflightId: z.string().uuid(),
  signedTransaction: z.string().min(32).max(4096),
  masterPassword: z.string().min(1).max(256),
  confirmation: z.literal("EXECUTE CROSS CHAIN BRIDGE"),
}).strict();
export const BridgeExecuteResponseSchema = RequestBaseSchema.extend({
  receipt: BridgeReceiptSchema,
}).strict();
export const BridgeReceiptsResponseSchema = z.object({ schemaVersion: z.literal(1), receipts: z.array(BridgeReceiptSchema).max(500) }).strict();
export const BridgeReconcileRequestSchema = RequestBaseSchema.extend({
  receiptId: z.string().uuid(),
}).strict();
export const BridgeReconcileResponseSchema = RequestBaseSchema.extend({
  receipt: BridgeReceiptSchema,
}).strict();
export const BridgeGetStatusRequestSchema = RequestBaseSchema.extend({
  providerId: z.enum(["debridge-dln", "relay"]),
}).strict();
export const BridgeGetStatusResponseSchema = RequestBaseSchema.extend({
  status: BridgeProviderStatusSchema,
}).strict();

export type BridgePrepareRequest = z.infer<typeof BridgePrepareRequestSchema>;
export type BridgePrepareResponse = z.infer<typeof BridgePrepareResponseSchema>;
export type BridgeExecuteRequest = z.infer<typeof BridgeExecuteRequestSchema>;
export type BridgeExecuteResponse = z.infer<typeof BridgeExecuteResponseSchema>;
export type BridgeReceiptsResponse = z.infer<typeof BridgeReceiptsResponseSchema>;
export type BridgeReconcileRequest = z.infer<typeof BridgeReconcileRequestSchema>;
export type BridgeReconcileResponse = z.infer<typeof BridgeReconcileResponseSchema>;
export type BridgeGetStatusRequest = z.infer<typeof BridgeGetStatusRequestSchema>;
export type BridgeGetStatusResponse = z.infer<typeof BridgeGetStatusResponseSchema>;

export const EvmBridgeContractSchema = z.object({
  id: z.string().uuid(),
  provider: z.literal("relay"),
  sourceChainId: z.number().int().positive(),
  sourceChainKey: EvmChainKeySchema,
  sourceAssetAddress: SessionEvmAddressSchema,
  sourceAssetSymbol: z.string().min(1).max(16),
  sourceAssetDecimals: z.number().int().min(0).max(18),
  sourceWallet: SessionEvmAddressSchema,
  destination: z.object({
    chainId: z.number().int().positive(),
    chainKey: z.string().min(1).max(32),
    assetAddress: z.string().min(1).max(128),
    assetSymbol: z.string().min(1).max(16),
    assetDecimals: z.number().int().min(0).max(18),
    recipient: z.string().min(1).max(128),
  }).strict(),
  amountIn: z.string().regex(/^[1-9]\d*$/u),
  minimumDestinationAmount: z.string().regex(/^[1-9]\d*$/u),
  maximumNetworkFeeWei: z.string().regex(/^\d+$/u),
  maximumTotalFeeUsd: z.number().finite().positive(),
  slippageBps: z.number().int().min(0).max(10_000),
  deadline: z.string().datetime(),
  timeoutSeconds: z.number().int().positive(),
  refundPolicy: z.literal("relay-origin-refund"),
  createdAt: z.string().datetime(),
}).strict();
export type EvmBridgeContract = z.infer<typeof EvmBridgeContractSchema>;

export const EvmBridgeQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  provider: z.literal("relay"),
  contractId: z.string().uuid(),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/u),
  expectedDestinationAmount: z.string().regex(/^[1-9]\d*$/u),
  minimumDestinationAmount: z.string().regex(/^[1-9]\d*$/u),
  estimatedGasWei: z.string().regex(/^\d+$/u),
  estimatedFeeUsd: z.number().finite().nonnegative(),
  stepCount: z.number().int().positive(),
  expiresAt: z.string().datetime(),
}).strict();
export type EvmBridgeQuote = z.infer<typeof EvmBridgeQuoteSchema>;

export const EvmBridgePreflightSchema = z.object({
  id: z.string().uuid(),
  quoteId: z.string().uuid(),
  contractId: z.string().uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
  allowanceRequired: z.boolean(),
  allowanceTarget: SessionEvmAddressSchema.nullable(),
  sourceTransaction: z.object({
    to: SessionEvmAddressSchema,
    data: z.string().regex(/^0x[0-9a-fA-F]*$/u),
    valueWei: z.string().regex(/^\d+$/u),
    gasLimit: z.string().regex(/^[1-9]\d*$/u),
    maxFeePerGas: z.string().regex(/^[1-9]\d*$/u),
    maxPriorityFeePerGas: z.string().regex(/^[1-9]\d*$/u),
  }).strict(),
  preparedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict();
export type EvmBridgePreflight = z.infer<typeof EvmBridgePreflightSchema>;

export const EvmBridgeReceiptSchema = z.object({
  id: z.string().uuid(),
  preflightId: z.string().uuid(),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]+$/u),
  status: z.enum(["confirmed", "reverted", "unknown"]),
  reconciledAt: z.string().datetime(),
}).strict();
export const AutomationSetupDcaRequestSchema = z.object({
  id: z.string().uuid(),
  walletAddress: z.string().min(32).max(64),
  inputMint: z.string().min(32).max(64),
  outputMint: z.string().min(32).max(64),
  inAmountPerInterval: z.string().regex(/^[1-9]\d*$/u),
  intervalSeconds: z.number().int().positive(),
  totalCycles: z.number().int().positive(),
  createdAt: z.string().datetime(),
}).strict();
export type AutomationSetupDcaRequest = z.infer<typeof AutomationSetupDcaRequestSchema>;
export const AutomationSetupDcaResponseSchema = RequestBaseSchema.extend({ setup: AutomationSetupDcaRequestSchema }).strict();
export type AutomationSetupDcaResponse = z.infer<typeof AutomationSetupDcaResponseSchema>;

export const AutomationSetupExitRequestSchema = z.object({
  id: z.string().uuid(),
  walletAddress: z.string().min(32).max(64),
  tokenMint: z.string().min(32).max(64),
  takeProfitPriceUsd: z.number().finite().positive().nullable(),
  stopLossPriceUsd: z.number().finite().positive().nullable(),
  createdAt: z.string().datetime(),
}).strict();
export type AutomationSetupExitRequest = z.infer<typeof AutomationSetupExitRequestSchema>;
export const AutomationSetupExitResponseSchema = RequestBaseSchema.extend({ setup: AutomationSetupExitRequestSchema }).strict();
export type AutomationSetupExitResponse = z.infer<typeof AutomationSetupExitResponseSchema>;

const AiToolNameSchema = z.string().min(1).max(64);
export const SessionMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  at: z.string(),
  toolsUsed: z.array(AiToolNameSchema).max(32).optional(),
  missionPreview: MissionContractPreviewSchema.optional(),
  pumpTradePreview: PumpTradeContractPreviewSchema.optional(),
  pumpLaunchDraft: PumpLaunchDraftSchema.optional(),
  pumpLaunchMetadataPackage: PumpLaunchMetadataPackageSchema.optional(),
  pumpLaunchPreflight: PumpLaunchPreflightSchema.optional(),
  pumpLaunchFinalRevalidation: PumpLaunchFinalRevalidationSchema.optional(),
  pumpLaunchExecution: PumpLaunchExecutionRecordSchema.optional(),
  pumpSimulation: PumpSimulationArtifactSchema.optional(),
  pumpExecution: PumpExecutionRecordSchema.optional(),
  pumpTokenIntelligence: PumpTokenIntelligenceSchema.optional(),
  pumpDiscoverySnapshot: PumpDiscoverySnapshotSchema.optional(),
  limitOrderPreview: LimitOrderContractPreviewSchema.optional(),
  limitOrderSimulation: LimitOrderSimulationPreviewSchema.optional(),
  limitOrderExecution: LimitOrderExecutionReceiptSchema.optional(),
  limitOrderCancelSimulation: LimitOrderCancelSimulationSchema.optional(),
  limitOrderCancelReceipt: LimitOrderCancelReceiptSchema.optional(),
  missionSimulation: MissionSimulationPreviewSchema.optional(),
  missionExecution: MissionExecutionReceiptSchema.optional(),
  evmSwapProposal: EvmSwapProposalSchema.optional(),
  evmSwapPreflight: EvmSwapPreflightEvidenceSchema.optional(),
  evmExecutionReceipts: z.array(EvmSessionExecutionReceiptSchema).max(10).optional(),
  bridgeProposal: BridgeProposalSchema.optional(),
  bridgePreflight: BridgePreflightEvidenceSchema.optional(),
  bridgeReceipt: BridgeReceiptSchema.optional(),
  evmBridgePreparation: z.object({ quote: EvmBridgeQuoteSchema, preflight: EvmBridgePreflightSchema }).passthrough().optional(),
  dcaSetup: AutomationSetupDcaRequestSchema.optional(),
  exitSetup: AutomationSetupExitRequestSchema.optional(),
}).passthrough();
// A session may only narrow a global trading guard. It has no execution
// authority and cannot widen the device-level maximum configured in Settings.
export const SessionSafetyOverridesSchema = z.object({
  maxSlippageBps: z.number().int().min(0).max(300),
}).passthrough();
export type SessionSafetyOverrides = z.infer<typeof SessionSafetyOverridesSchema>;
// Intent is retained for transitional and legacy sessions. New sessions are
// wallet-scoped; a future lane-specific proposal carries the immutable action
// intent, rather than making the entire conversation an execution lane.
export const SessionIntentSchema = z.enum([
  "research",
  "token-launch",
  "solana-swap",
  "evm-swap",
  "bridge",
  "legacy-pump-pilot",
]);
export type SessionIntent = z.infer<typeof SessionIntentSchema>;
// New sessions are wallet-scoped. The EVM value is reserved until the local
// EVM vault exists; legacy sessions may omit this field.
export const SessionWalletScopeSchema = z.enum(["solana", "evm"]);
export type SessionWalletScope = z.infer<typeof SessionWalletScopeSchema>;
export const SessionRecordSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(200),
  mode: z.enum(["agent", "mission"]),
  permission: z.enum(["restricted", "full"]),
  intent: SessionIntentSchema.optional(),
  walletScope: SessionWalletScopeSchema.optional(),
  evmChainKey: EvmChainKeySchema.optional(),
  workspace: z.enum(["general", "pump"]).optional(),
  pumpConfig: z.object({
    scope: z.enum(["exact-mint", "watchlist", "discovery"]),
    objective: z.enum(["monitor", "trade-proposal"]),
    tokenMint: z.string().nullable().optional(),
    watchlistMints: z.array(z.string()).optional(),
    analysisBuyLamports: z.string().optional(),
    lifecycle: z.literal("proposal-only"),
  }).passthrough().optional(),
  safetyOverrides: SessionSafetyOverridesSchema.optional(),
  walletAddress: z.string().nullable().optional(),
  messages: z.array(SessionMessageSchema).max(500),
  startedAt: z.string(),
  usage: z.object({
    input: z.number().nonnegative().optional(),
    output: z.number().nonnegative().optional(),
    total: z.number().nonnegative().optional(),
    cost: z.number().nullable().optional(),
  }).passthrough().optional(),
}).passthrough().superRefine((session, context) => {
  if (session.workspace === "pump" && session.pumpConfig === undefined) {
    context.addIssue({ code: "custom", path: ["pumpConfig"], message: "Pump workspace configuration is required" });
  }
  if (session.workspace === "pump" && session.mode !== "mission") {
    context.addIssue({ code: "custom", path: ["mode"], message: "Pump workspaces require Mission mode" });
  }
  if (session.workspace === "pump" && session.permission !== "restricted") {
    context.addIssue({ code: "custom", path: ["permission"], message: "Pump workspaces are restricted" });
  }
  if (session.workspace !== "pump" && session.pumpConfig !== undefined) {
    context.addIssue({ code: "custom", path: ["pumpConfig"], message: "Pump configuration requires a Pump workspace" });
  }
  if (session.intent === "legacy-pump-pilot" && session.workspace !== "pump") {
    context.addIssue({ code: "custom", path: ["intent"], message: "Legacy Pump intent requires a legacy Pump workspace" });
  }
  if (session.workspace === "pump" && session.intent !== undefined && session.intent !== "legacy-pump-pilot") {
    context.addIssue({ code: "custom", path: ["intent"], message: "Legacy Pump workspaces cannot be reclassified as a new product lane" });
  }
  if (session.intent !== undefined && session.intent !== "research" && session.intent !== "legacy-pump-pilot") {
    if (session.mode !== "mission" || session.permission !== "restricted") {
      context.addIssue({ code: "custom", path: ["intent"], message: "Mutable venue intents require a restricted Mission session" });
    }
  }
  if (session.walletScope === "evm" && session.workspace === "pump") {
    context.addIssue({ code: "custom", path: ["walletScope"], message: "Legacy Pump sessions are Solana-only" });
  }
  if (session.pumpConfig?.scope === "exact-mint" && session.pumpConfig.tokenMint === null) {
    context.addIssue({ code: "custom", path: ["pumpConfig", "tokenMint"], message: "Exact-mint Pump sessions require a token mint" });
  }
  if (session.pumpConfig?.scope === "exact-mint" && session.pumpConfig.watchlistMints !== undefined) {
    context.addIssue({ code: "custom", path: ["pumpConfig", "watchlistMints"], message: "Exact-mint Pump sessions cannot include a watchlist" });
  }
  if (session.pumpConfig?.scope === "watchlist") {
    if (session.pumpConfig.tokenMint !== null || session.pumpConfig.watchlistMints === undefined) {
      context.addIssue({ code: "custom", path: ["pumpConfig"], message: "Watchlist Pump sessions require a bounded mint list and no execution mint" });
    } else if (new Set(session.pumpConfig.watchlistMints).size !== session.pumpConfig.watchlistMints.length) {
      context.addIssue({ code: "custom", path: ["pumpConfig", "watchlistMints"], message: "Watchlist Pump mints must be unique" });
    }
  }
  if (session.pumpConfig?.scope === "discovery" && (session.pumpConfig.tokenMint !== null || session.pumpConfig.watchlistMints !== undefined)) {
    context.addIssue({ code: "custom", path: ["pumpConfig"], message: "Discovery Pump sessions cannot pre-authorize a token scope" });
  }
});
export const SessionListResponseSchema = z.object({ schemaVersion: z.literal(1), sessions: z.array(SessionRecordSchema).max(100) }).strict();
export const SessionUpsertRequestSchema = RequestBaseSchema.extend({ session: SessionRecordSchema }).strict();
export const SessionUpsertResponseSchema = RequestBaseSchema.extend({ saved: z.literal(true) }).strict();
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;
export type SessionUpsertRequest = z.infer<typeof SessionUpsertRequestSchema>;
export type SessionUpsertResponse = z.infer<typeof SessionUpsertResponseSchema>;

export const ClipboardWriteWalletAddressRequestSchema = RequestBaseSchema.extend({ address: z.string().min(32).max(44) }).strict();
export const ClipboardWriteWalletAddressResponseSchema = RequestBaseSchema.extend({ copied: z.literal(true) }).strict();
export type ClipboardWriteWalletAddressRequest = z.infer<typeof ClipboardWriteWalletAddressRequestSchema>;
export type ClipboardWriteWalletAddressResponse = z.infer<typeof ClipboardWriteWalletAddressResponseSchema>;
const TransactionSignatureSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,128}$/u);
export const ClipboardWriteTransactionSignatureRequestSchema = RequestBaseSchema.extend({ signature: TransactionSignatureSchema }).strict();
export const ClipboardWriteTransactionSignatureResponseSchema = RequestBaseSchema.extend({ copied: z.literal(true) }).strict();
export const ExternalOpenTransactionRequestSchema = RequestBaseSchema.extend({ signature: TransactionSignatureSchema }).strict();
export const ExternalOpenTransactionResponseSchema = RequestBaseSchema.extend({ opened: z.literal(true) }).strict();
export type ClipboardWriteTransactionSignatureRequest = z.infer<typeof ClipboardWriteTransactionSignatureRequestSchema>;
export type ClipboardWriteTransactionSignatureResponse = z.infer<typeof ClipboardWriteTransactionSignatureResponseSchema>;
export type ExternalOpenTransactionRequest = z.infer<typeof ExternalOpenTransactionRequestSchema>;
export type ExternalOpenTransactionResponse = z.infer<typeof ExternalOpenTransactionResponseSchema>;

const WalletOnboardingBaseSchema = RequestBaseSchema.extend({ acknowledgedHotWalletRisk: z.literal(true) });
export const WalletCreateRequestSchema = WalletOnboardingBaseSchema.strict();
export const WalletCreateResponseSchema = RequestBaseSchema.extend({
  address: z.string().min(32).max(44),
  recoveryMnemonic: z.string().min(32).max(512),
  derivationPath: z.literal("m/44'/501'/0'/0'"),
}).strict();
export const WalletImportMnemonicRequestSchema = WalletOnboardingBaseSchema.extend({ mnemonic: z.string().min(32).max(512) }).strict();
export const WalletImportPrivateKeyRequestSchema = WalletOnboardingBaseSchema.extend({ privateKey: z.string().min(32).max(1024) }).strict();
export const WalletImportResponseSchema = RequestBaseSchema.extend({ address: z.string().min(32).max(44) }).strict();
export const WalletListResponseSchema = z.object({
  schemaVersion: z.literal(1),
  wallets: z.array(z.object({ address: z.string().min(32).max(44), primary: z.boolean() }).strict()).max(20),
}).strict();
export const WalletClearAllRequestSchema = RequestBaseSchema.extend({ confirmation: z.literal("CLEAR ALL SOLANA WALLETS") }).strict();
export const WalletClearAllResponseSchema = RequestBaseSchema.extend({ removed: z.number().int().min(0).max(20) }).strict();
export type WalletCreateRequest = z.infer<typeof WalletCreateRequestSchema>;
export type WalletCreateResponse = z.infer<typeof WalletCreateResponseSchema>;
export type WalletImportMnemonicRequest = z.infer<typeof WalletImportMnemonicRequestSchema>;
export type WalletImportPrivateKeyRequest = z.infer<typeof WalletImportPrivateKeyRequestSchema>;
export type WalletImportResponse = z.infer<typeof WalletImportResponseSchema>;
export type WalletListResponse = z.infer<typeof WalletListResponseSchema>;
export type WalletClearAllRequest = z.infer<typeof WalletClearAllRequestSchema>;
export type WalletClearAllResponse = z.infer<typeof WalletClearAllResponseSchema>;

export const PortfolioGetRequestSchema = RequestBaseSchema.extend({
  address: z.string().min(32).max(44),
}).strict();
export const PortfolioAssetSchema = z.object({
  mint: z.string().min(32).max(44),
  amount: z.string().regex(/^\d+$/u),
  decimals: z.number().int().min(0).max(18),
  uiAmount: z.string().min(1).max(128),
  usdPrice: z.number().finite().nonnegative().nullable(),
  usdValue: z.number().finite().nonnegative().nullable(),
}).strict();
export const PortfolioSnapshotSchema = z.object({
  address: z.string().min(32).max(44),
  slot: z.number().int().nonnegative(),
  solBalance: z.string().min(1).max(128),
  solUsdPrice: z.number().finite().nonnegative().nullable(),
  totalUsd: z.number().finite().nonnegative().nullable(),
  assets: z.array(PortfolioAssetSchema).max(100),
  verifiedAt: z.string().datetime(),
}).strict();
export const PortfolioGetResponseSchema = RequestBaseSchema.extend({ snapshot: PortfolioSnapshotSchema }).strict();
export type PortfolioGetRequest = z.infer<typeof PortfolioGetRequestSchema>;
export type PortfolioAsset = z.infer<typeof PortfolioAssetSchema>;
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;
export type PortfolioGetResponse = z.infer<typeof PortfolioGetResponseSchema>;

export const WalletActivityGetRequestSchema = RequestBaseSchema.extend({
  address: z.string().min(32).max(44),
  limit: z.number().int().min(1).max(20).default(10),
}).strict();
export const WalletActivityEntrySchema = z.object({
  signature: z.string().min(64).max(128),
  slot: z.number().int().nonnegative(),
  status: z.enum(["success", "failed"]),
  blockTime: z.string().datetime().nullable(),
  memo: z.string().max(280).nullable(),
  explorerUrl: z.string().url().max(512),
}).strict();
export const WalletActivitySnapshotSchema = z.object({
  address: z.string().min(32).max(44),
  entries: z.array(WalletActivityEntrySchema).max(20),
  verifiedAt: z.string().datetime(),
}).strict();
export const WalletActivityGetResponseSchema = RequestBaseSchema.extend({ activity: WalletActivitySnapshotSchema }).strict();
export type WalletActivityGetRequest = z.infer<typeof WalletActivityGetRequestSchema>;
export type WalletActivityEntry = z.infer<typeof WalletActivityEntrySchema>;
export type WalletActivitySnapshot = z.infer<typeof WalletActivitySnapshotSchema>;
export type WalletActivityGetResponse = z.infer<typeof WalletActivityGetResponseSchema>;

export const JupiterSwapQuotePreviewSchema = z.object({
  inputMint: z.string().min(32).max(44),
  outputMint: z.string().min(32).max(44),
  inAmount: z.string().regex(/^[1-9]\d*$/u),
  outAmount: z.string().regex(/^\d+$/u),
  router: z.string().min(1).max(64),
  mode: z.string().min(1).max(32),
  feeBps: z.number().int().min(0).max(10_000).nullable(),
  feeMint: z.string().min(32).max(44).nullable(),
  quoteOnly: z.literal(true),
  verifiedAt: z.string().datetime(),
}).strict();
export type JupiterSwapQuotePreview = z.infer<typeof JupiterSwapQuotePreviewSchema>;

export const AiProviderSchema = z.literal("openrouter");
export type AiProvider = z.infer<typeof AiProviderSchema>;
export const AiProviderSettingSchema = z.object({
  provider: AiProviderSchema,
  configured: z.boolean(),
  model: z.string().min(1).max(192),
}).strict();
export type AiProviderSetting = z.infer<typeof AiProviderSettingSchema>;
export const AiSettingsResponseSchema = z.object({ schemaVersion: z.literal(1), providers: z.array(AiProviderSettingSchema).max(1) }).strict();
export type AiSettingsResponse = z.infer<typeof AiSettingsResponseSchema>;
export const AiSaveProviderRequestSchema = RequestBaseSchema.extend({
  provider: AiProviderSchema,
  apiKey: z.string().trim().min(8).max(512),
  model: z.string().trim().min(1).max(192),
  acknowledgedExternalProcessing: z.literal(true),
}).strict();
export const AiProviderMutationResponseSchema = RequestBaseSchema.extend({ setting: AiProviderSettingSchema }).strict();
export type AiSaveProviderRequest = z.infer<typeof AiSaveProviderRequestSchema>;
export type AiProviderMutationResponse = z.infer<typeof AiProviderMutationResponseSchema>;

export const OpenRouterModelViewSchema = z.object({
  id: z.string().min(1).max(192),
  name: z.string().min(1).max(192),
  contextLength: z.number().int().positive(),
  promptPrice: z.string().max(64),
  completionPrice: z.string().max(64),
  supportsStructuredOutput: z.boolean(),
  supportsTools: z.boolean(),
}).strict();
export type OpenRouterModelView = z.infer<typeof OpenRouterModelViewSchema>;
export const AiPreviewOpenRouterModelsRequestSchema = RequestBaseSchema.extend({
  apiKey: z.string().trim().min(8).max(512),
  acknowledgedExternalProcessing: z.literal(true),
}).strict();
export const AiPreviewOpenRouterModelsResponseSchema = RequestBaseSchema.extend({ models: z.array(OpenRouterModelViewSchema).max(500) }).strict();
export type AiPreviewOpenRouterModelsRequest = z.infer<typeof AiPreviewOpenRouterModelsRequestSchema>;
export type AiPreviewOpenRouterModelsResponse = z.infer<typeof AiPreviewOpenRouterModelsResponseSchema>;

export const AiChatRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(12_000),
  mode: z.enum(["agent", "mission"]),
  permission: z.enum(["restricted", "full"]),
  walletAddress: z.string().min(32).max(44).nullable(),
  acknowledgedExternalProcessing: z.literal(true),
}).strict();
export const AiChatResponseSchema = RequestBaseSchema.extend({
  model: z.string().min(1).max(192),
  text: z.string().min(1).max(12_000),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative().nullable(),
  }).strict(),
  toolsUsed: z.array(AiToolNameSchema).max(32),
  missionPreview: MissionContractPreviewSchema.nullable(),
  pumpTradePreview: PumpTradeContractPreviewSchema.nullable(),
  pumpTokenIntelligence: PumpTokenIntelligenceSchema.nullable(),
  pumpDiscoverySnapshot: PumpDiscoverySnapshotSchema.nullable(),
  limitOrderPreview: LimitOrderContractPreviewSchema.nullable(),
  evmSwapProposal: EvmSwapProposalSchema.nullable(),
  bridgeProposal: BridgeProposalSchema.nullable().optional(),
  bridgePreflight: BridgePreflightEvidenceSchema.nullable().optional(),
  bridgeReceipt: BridgeReceiptSchema.nullable().optional(),
  dcaSetup: AutomationSetupDcaRequestSchema.nullable().optional(),
  exitSetup: AutomationSetupExitRequestSchema.nullable().optional(),
}).strict();
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;
export type AiChatResponse = z.infer<typeof AiChatResponseSchema>;

export const JupiterSettingsResponseSchema = z.object({ schemaVersion: z.literal(1), configured: z.boolean() }).strict();
export const JupiterSaveKeyRequestSchema = RequestBaseSchema.extend({
  apiKey: z.string().trim().min(8).max(512),
  acknowledgedMainnetMarketData: z.literal(true),
}).strict();
export const JupiterKeyMutationResponseSchema = RequestBaseSchema.extend({ configured: z.boolean() }).strict();
export type JupiterSettingsResponse = z.infer<typeof JupiterSettingsResponseSchema>;
export type JupiterSaveKeyRequest = z.infer<typeof JupiterSaveKeyRequestSchema>;
export type JupiterKeyMutationResponse = z.infer<typeof JupiterKeyMutationResponseSchema>;

export const TavilySettingsResponseSchema = z.object({ schemaVersion: z.literal(1), configured: z.boolean() }).strict();
export const TavilySaveKeyRequestSchema = RequestBaseSchema.extend({
  apiKey: z.string().trim().min(8).max(512),
  acknowledgedExternalProcessing: z.literal(true),
}).strict();
export const TavilyKeyMutationResponseSchema = RequestBaseSchema.extend({ configured: z.boolean() }).strict();
export type TavilySettingsResponse = z.infer<typeof TavilySettingsResponseSchema>;
export type TavilySaveKeyRequest = z.infer<typeof TavilySaveKeyRequestSchema>;

export const SolanaRpcSettingsResponseSchema = z.object({ schemaVersion: z.literal(1), rpcUrl: z.string().nullable() }).strict();
export const SolanaRpcSaveUrlRequestSchema = RequestBaseSchema.extend({
  rpcUrl: z.string().trim().url().nullable(),
}).strict();
export const SolanaRpcMutationResponseSchema = RequestBaseSchema.extend({ rpcUrl: z.string().nullable() }).strict();
export type SolanaRpcSettingsResponse = z.infer<typeof SolanaRpcSettingsResponseSchema>;
export type SolanaRpcSaveUrlRequest = z.infer<typeof SolanaRpcSaveUrlRequestSchema>;
export type SolanaRpcMutationResponse = z.infer<typeof SolanaRpcMutationResponseSchema>;

export const RobinhoodSettingsResponseSchema = z.object({
  schemaVersion: z.literal(1),
  zeroExConfigured: z.boolean(),
  rpcConfigured: z.boolean(),
  executionEnabled: z.boolean(),
  executionMissing: z.array(z.string().min(1).max(128)).max(10),
}).strict();
export const RobinhoodSaveZeroXKeyRequestSchema = RequestBaseSchema.extend({
  apiKey: z.string().trim().min(8).max(512),
  acknowledgedExternalQuoteProvider: z.literal(true),
}).strict();
export const RobinhoodSaveRpcUrlRequestSchema = RequestBaseSchema.extend({
  rpcUrl: z.string().trim().url().max(1_024).refine((value) => value.startsWith("https://"), "Robinhood RPC URL must use HTTPS"),
}).strict();
export const RobinhoodKeyMutationResponseSchema = RequestBaseSchema.extend({ configured: z.literal(true) }).strict();
export const RobinhoodRpcMutationResponseSchema = RequestBaseSchema.extend({ configured: z.literal(true) }).strict();
export const RobinhoodTestRpcResponseSchema = RequestBaseSchema.extend({ chainId: z.literal(4663) }).strict();
export const RobinhoodTestZeroXResponseSchema = RequestBaseSchema.extend({ chainId: z.literal(4663) }).strict();
export const EvmWalletSummarySchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/u),
  primary: z.boolean(),
}).strict();
export const RobinhoodWalletGetResponseSchema = z.object({
  schemaVersion: z.literal(1),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/u).nullable(),
  wallets: z.array(EvmWalletSummarySchema).max(20),
}).strict();
export const RobinhoodWalletCreateRequestSchema = RequestBaseSchema.extend({ acknowledgedHotWalletRisk: z.literal(true) }).strict();
export const RobinhoodWalletCreateResponseSchema = RequestBaseSchema.extend({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/u),
  recoveryMnemonic: z.string().min(32).max(512),
  derivationPath: z.literal("m/44'/60'/0'/0/0"),
}).strict();
export const RobinhoodWalletImportMnemonicRequestSchema = RequestBaseSchema.extend({
  mnemonic: z.string().min(32).max(512),
  acknowledgedHotWalletRisk: z.literal(true),
}).strict();
export const RobinhoodWalletImportPrivateKeyRequestSchema = RequestBaseSchema.extend({
  privateKey: z.string().trim().regex(/^(0x)?[0-9a-fA-F]{64}$/u, "EVM private key must be 32-byte hexadecimal"),
  acknowledgedHotWalletRisk: z.literal(true),
}).strict();
export const RobinhoodWalletImportResponseSchema = RequestBaseSchema.extend({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/u) }).strict();
const EvmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/u);
export const RobinhoodIndicativePriceRequestSchema = RequestBaseSchema.extend({
  walletAddress: EvmAddressSchema.optional(),
  sellToken: EvmAddressSchema,
  buyToken: EvmAddressSchema,
  sellAmount: z.string().regex(/^[1-9]\d*$/u),
  slippageBps: z.number().int().min(0).max(1_000),
  acknowledgedReadOnlyQuote: z.literal(true),
}).strict();
export const RobinhoodIndicativePriceSchema = z.object({
  sellToken: EvmAddressSchema,
  buyToken: EvmAddressSchema,
  sellAmount: z.string().regex(/^[1-9]\d*$/u),
  buyAmount: z.string().regex(/^[1-9]\d*$/u),
  minBuyAmount: z.string().regex(/^[1-9]\d*$/u).nullable(),
  blockNumber: z.string().regex(/^[1-9]\d*$/u).nullable(),
  zeroExFeeAmount: z.string().regex(/^[1-9]\d*$/u).nullable(),
  zeroExFeeToken: EvmAddressSchema.nullable(),
  liquidityAvailable: z.boolean(),
  sellTokenSymbol: z.string().min(1).max(32),
  buyTokenSymbol: z.string().min(1).max(32),
  sellTokenMultiplier: z.string().min(1).max(64),
  buyTokenMultiplier: z.string().min(1).max(64),
}).strict();
export const RobinhoodIndicativePriceResponseSchema = RequestBaseSchema.extend({ quote: RobinhoodIndicativePriceSchema }).strict();
export const RobinhoodPrepareTradeResponseSchema = RequestBaseSchema.extend({
  preflight: z.object({ id: z.string().uuid(), expiresAt: z.string().datetime(), allowanceRequired: z.boolean(), currentAllowance: z.string().regex(/^\d+$/u), gasLimit: z.string().regex(/^[1-9]\d*$/u), maxFeePerGas: z.string().regex(/^[1-9]\d*$/u), maxGasCostWei: z.string().regex(/^\d+$/u) }).strict(),
  sellTokenSymbol: z.string().min(1).max(32), buyTokenSymbol: z.string().min(1).max(32), expectedBuyAmount: z.string().regex(/^[1-9]\d*$/u), minimumBuyAmount: z.string().regex(/^[1-9]\d*$/u),
}).strict();
export const RobinhoodExecutionReceiptSchema = z.object({ id: z.string().uuid(), transactionHash: z.string().regex(/^0x[0-9a-fA-F]+$/u), kind: z.enum(["approval", "swap"]), status: z.enum(["confirmed", "reverted", "unknown"]), reconciledAt: z.string().datetime() }).strict();
export const RobinhoodExecuteApprovalRequestSchema = RequestBaseSchema.extend({
  walletAddress: EvmAddressSchema.optional(),
  preflightId: z.string().uuid(),
  masterPassword: z.string().min(8).max(256),
  confirmation: z.literal("APPROVE ROBINHOOD MAINNET"),
  acknowledgedIrreversible: z.literal(true),
}).strict();
export const RobinhoodExecuteSwapRequestSchema = RequestBaseSchema.extend({
  walletAddress: EvmAddressSchema.optional(),
  preflightId: z.string().uuid(),
  masterPassword: z.string().min(8).max(256),
  confirmation: z.literal("EXECUTE ROBINHOOD MAINNET SWAP"),
  acknowledgedIrreversible: z.literal(true),
}).strict();
export const RobinhoodExecutionResponseSchema = RequestBaseSchema.extend({
  receipt: RobinhoodExecutionReceiptSchema,
}).strict();
export const RobinhoodReceiptsResponseSchema = z.object({ schemaVersion: z.literal(1), receipts: z.array(RobinhoodExecutionReceiptSchema).max(500) }).strict();
export const RobinhoodReconcileReceiptsResponseSchema = z.object({ schemaVersion: z.literal(1), reconciled: z.array(RobinhoodExecutionReceiptSchema).max(500) }).strict();
export type RobinhoodSettingsResponse = z.infer<typeof RobinhoodSettingsResponseSchema>;
export type RobinhoodSaveZeroXKeyRequest = z.infer<typeof RobinhoodSaveZeroXKeyRequestSchema>;
export type RobinhoodSaveRpcUrlRequest = z.infer<typeof RobinhoodSaveRpcUrlRequestSchema>;
export type RobinhoodKeyMutationResponse = z.infer<typeof RobinhoodKeyMutationResponseSchema>;
export type RobinhoodRpcMutationResponse = z.infer<typeof RobinhoodRpcMutationResponseSchema>;
export type RobinhoodTestRpcResponse = z.infer<typeof RobinhoodTestRpcResponseSchema>;
export type RobinhoodTestZeroXResponse = z.infer<typeof RobinhoodTestZeroXResponseSchema>;
export type RobinhoodWalletGetResponse = z.infer<typeof RobinhoodWalletGetResponseSchema>;
export type EvmWalletSummary = z.infer<typeof EvmWalletSummarySchema>;
export type RobinhoodWalletCreateRequest = z.infer<typeof RobinhoodWalletCreateRequestSchema>;
export type RobinhoodWalletCreateResponse = z.infer<typeof RobinhoodWalletCreateResponseSchema>;
export type RobinhoodWalletImportMnemonicRequest = z.infer<typeof RobinhoodWalletImportMnemonicRequestSchema>;
export type RobinhoodWalletImportPrivateKeyRequest = z.infer<typeof RobinhoodWalletImportPrivateKeyRequestSchema>;
export type RobinhoodWalletImportResponse = z.infer<typeof RobinhoodWalletImportResponseSchema>;
export type RobinhoodIndicativePriceRequest = z.infer<typeof RobinhoodIndicativePriceRequestSchema>;
export type RobinhoodIndicativePrice = z.infer<typeof RobinhoodIndicativePriceSchema>;
export type RobinhoodIndicativePriceResponse = z.infer<typeof RobinhoodIndicativePriceResponseSchema>;
export type RobinhoodPrepareTradeResponse = z.infer<typeof RobinhoodPrepareTradeResponseSchema>;
export type RobinhoodExecutionReceipt = z.infer<typeof RobinhoodExecutionReceiptSchema>;
export type RobinhoodExecuteApprovalRequest = z.infer<typeof RobinhoodExecuteApprovalRequestSchema>;
export type RobinhoodExecuteSwapRequest = z.infer<typeof RobinhoodExecuteSwapRequestSchema>;
export type RobinhoodExecutionResponse = z.infer<typeof RobinhoodExecutionResponseSchema>;
export type RobinhoodReceiptsResponse = z.infer<typeof RobinhoodReceiptsResponseSchema>;
export type RobinhoodReconcileReceiptsResponse = z.infer<typeof RobinhoodReconcileReceiptsResponseSchema>;

export type TavilyKeyMutationResponse = z.infer<typeof TavilyKeyMutationResponseSchema>;

export const EvmWalletGetResponseSchema = z.object({
  schemaVersion: z.literal(1),
  address: SessionEvmAddressSchema.nullable(),
  wallets: z.array(EvmWalletSummarySchema).max(20),
}).strict();
export type EvmWalletGetResponse = z.infer<typeof EvmWalletGetResponseSchema>;

export const EvmWalletCreateRequestSchema = RequestBaseSchema.extend({ acknowledgedHotWalletRisk: z.literal(true) }).strict();
export const EvmWalletCreateResponseSchema = RequestBaseSchema.extend({
  address: SessionEvmAddressSchema,
  recoveryMnemonic: z.string().min(32).max(512),
  derivationPath: z.literal("m/44'/60'/0'/0/0"),
}).strict();
export const EvmWalletImportMnemonicRequestSchema = RequestBaseSchema.extend({
  mnemonic: z.string().min(32).max(512),
  acknowledgedHotWalletRisk: z.literal(true),
}).strict();
export const EvmWalletImportPrivateKeyRequestSchema = RequestBaseSchema.extend({
  privateKey: z.string().trim().regex(/^(0x)?[0-9a-fA-F]{64}$/u, "EVM private key must be 32-byte hexadecimal"),
  acknowledgedHotWalletRisk: z.literal(true),
}).strict();
export const EvmWalletImportResponseSchema = RequestBaseSchema.extend({ address: SessionEvmAddressSchema }).strict();
export const EvmWalletClearAllRequestSchema = RequestBaseSchema.extend({ confirmation: z.literal("CLEAR ALL EVM WALLETS") }).strict();
export const EvmWalletClearAllResponseSchema = RequestBaseSchema.extend({ removed: z.number().int().min(0).max(20) }).strict();

export type EvmWalletCreateRequest = z.infer<typeof EvmWalletCreateRequestSchema>;
export type EvmWalletCreateResponse = z.infer<typeof EvmWalletCreateResponseSchema>;
export type EvmWalletImportMnemonicRequest = z.infer<typeof EvmWalletImportMnemonicRequestSchema>;
export type EvmWalletImportPrivateKeyRequest = z.infer<typeof EvmWalletImportPrivateKeyRequestSchema>;
export type EvmWalletImportResponse = z.infer<typeof EvmWalletImportResponseSchema>;
export type EvmWalletClearAllRequest = z.infer<typeof EvmWalletClearAllRequestSchema>;
export type EvmWalletClearAllResponse = z.infer<typeof EvmWalletClearAllResponseSchema>;

export const EvmSettingsResponseSchema = z.object({
  schemaVersion: z.literal(1),
  rpcConfigured: z.boolean(),
  executionEnabled: z.boolean(),
}).strict();
export const EvmSaveRpcUrlRequestSchema = RequestBaseSchema.extend({
  rpcUrl: z.string().trim().url().max(1_024).refine((value) => value.startsWith("https://"), "EVM RPC URL must use HTTPS"),
}).strict();
export const EvmRpcMutationResponseSchema = RequestBaseSchema.extend({ configured: z.literal(true) }).strict();
export const EvmTestRpcResponseSchema = RequestBaseSchema.extend({ chainId: z.number().int().positive() }).strict();

export type EvmSettingsResponse = z.infer<typeof EvmSettingsResponseSchema>;
export type EvmSaveRpcUrlRequest = z.infer<typeof EvmSaveRpcUrlRequestSchema>;
export type EvmRpcMutationResponse = z.infer<typeof EvmRpcMutationResponseSchema>;
export type EvmTestRpcResponse = z.infer<typeof EvmTestRpcResponseSchema>;

export const EvmPrepareKyberSwapRequestSchema = RequestBaseSchema.extend({
  chainKey: EvmChainKeySchema,
  walletAddress: SessionEvmAddressSchema,
  sellToken: SessionEvmAddressSchema,
  buyToken: SessionEvmAddressSchema,
  sellAmount: z.string().regex(/^[1-9]\d*$/u),
  slippageBps: z.number().int().min(0).max(1_000),
}).strict();
export const EvmPrepareKyberSwapResponseSchema = RequestBaseSchema.extend({
  proposal: EvmSwapProposalSchema,
}).strict();
export const EvmExecuteKyberSwapRequestSchema = RequestBaseSchema.extend({
  proposalId: z.string().uuid(),
  masterPassword: z.string().min(1).max(256),
  confirmation: z.literal("EXECUTE EVM SWAP"),
}).strict();
export const EvmExecuteKyberSwapResponseSchema = RequestBaseSchema.extend({
  receipt: EvmSessionExecutionReceiptSchema,
}).strict();

export type EvmPrepareKyberSwapRequest = z.infer<typeof EvmPrepareKyberSwapRequestSchema>;
export type EvmPrepareKyberSwapResponse = z.infer<typeof EvmPrepareKyberSwapResponseSchema>;
export type EvmExecuteKyberSwapRequest = z.infer<typeof EvmExecuteKyberSwapRequestSchema>;
export type EvmExecuteKyberSwapResponse = z.infer<typeof EvmExecuteKyberSwapResponseSchema>;

export const EvmReceiptsResponseSchema = z.object({ schemaVersion: z.literal(1), receipts: z.array(EvmSessionExecutionReceiptSchema).max(500) }).strict();
export const EvmReconcileReceiptsResponseSchema = z.object({ schemaVersion: z.literal(1), reconciled: z.array(EvmSessionExecutionReceiptSchema).max(500) }).strict();

export type EvmReceiptsResponse = z.infer<typeof EvmReceiptsResponseSchema>;
export type EvmReconcileReceiptsResponse = z.infer<typeof EvmReconcileReceiptsResponseSchema>;

export const EvmBridgePrepareRequestSchema = RequestBaseSchema.extend({
  contract: EvmBridgeContractSchema,
}).strict();
export const EvmBridgePrepareResponseSchema = RequestBaseSchema.extend({
  quote: EvmBridgeQuoteSchema,
  preflight: EvmBridgePreflightSchema,
}).strict();
export const EvmBridgeExecuteRequestSchema = RequestBaseSchema.extend({
  preflightId: z.string().uuid(),
  masterPassword: z.string().min(1).max(256),
  confirmation: z.literal("EXECUTE EVM BRIDGE"),
}).strict();
export const EvmBridgeExecuteResponseSchema = RequestBaseSchema.extend({
  receipt: EvmBridgeReceiptSchema,
}).strict();
export const EvmBridgeReceiptsResponseSchema = z.object({ schemaVersion: z.literal(1), receipts: z.array(EvmBridgeReceiptSchema).max(500) }).strict();
export const EvmBridgeReconcileRequestSchema = RequestBaseSchema.extend({
  receiptId: z.string().uuid(),
}).strict();
export const EvmBridgeReconcileResponseSchema = RequestBaseSchema.extend({
  receipt: EvmBridgeReceiptSchema,
}).strict();

export type EvmBridgePrepareRequest = z.infer<typeof EvmBridgePrepareRequestSchema>;
export type EvmBridgePrepareResponse = z.infer<typeof EvmBridgePrepareResponseSchema>;
export type EvmBridgeExecuteRequest = z.infer<typeof EvmBridgeExecuteRequestSchema>;
export type EvmBridgeExecuteResponse = z.infer<typeof EvmBridgeExecuteResponseSchema>;
export type EvmBridgeReceiptsResponse = z.infer<typeof EvmBridgeReceiptsResponseSchema>;
export type EvmBridgeReconcileRequest = z.infer<typeof EvmBridgeReconcileRequestSchema>;
export type EvmBridgeReconcileResponse = z.infer<typeof EvmBridgeReconcileResponseSchema>;

export const UniswapSettingsResponseSchema = z.object({ schemaVersion: z.literal(1), configured: z.boolean() }).strict();
export const UniswapSaveKeyRequestSchema = RequestBaseSchema.extend({ apiKey: z.string().trim().min(8).max(512) }).strict();
export const UniswapKeyMutationResponseSchema = RequestBaseSchema.extend({ configured: z.boolean() }).strict();
export const UniswapTestKeyRequestSchema = RequestBaseSchema.strict();
export const UniswapTestKeyResponseSchema = RequestBaseSchema.extend({ chainId: z.number().int().positive() }).strict();

export type UniswapSettingsResponse = z.infer<typeof UniswapSettingsResponseSchema>;
export type UniswapSaveKeyRequest = z.infer<typeof UniswapSaveKeyRequestSchema>;
export type UniswapKeyMutationResponse = z.infer<typeof UniswapKeyMutationResponseSchema>;
export type UniswapTestKeyRequest = z.infer<typeof UniswapTestKeyRequestSchema>;
export type UniswapTestKeyResponse = z.infer<typeof UniswapTestKeyResponseSchema>;

export const EvmPortfolioTokenRequestSchema = z.object({
  address: SessionEvmAddressSchema,
  symbol: z.string().trim().min(1).max(32),
  decimals: z.number().int().min(0).max(18),
}).strict();
export const EvmPortfolioGetRequestSchema = RequestBaseSchema.extend({
  chainKey: EvmChainKeySchema,
  address: SessionEvmAddressSchema,
  tokens: z.array(EvmPortfolioTokenRequestSchema).max(12).default([]),
}).strict();
export const EvmPortfolioAssetSchema = EvmPortfolioTokenRequestSchema.extend({
  rawAmount: z.string().regex(/^\d+$/u),
  uiAmount: z.string().min(1).max(128),
  usdPrice: z.number().finite().nonnegative().nullable().optional(),
  usdValue: z.number().finite().nonnegative().nullable().optional(),
}).strict();

export const EvmPortfolioSnapshotSchema = z.object({
  chainKey: EvmChainKeySchema,
  chainId: EvmChainIdSchema,
  chainName: z.string().min(1).max(80),
  address: SessionEvmAddressSchema,
  blockNumber: z.string().regex(/^\d+$/u),
  nativeSymbol: z.string().min(1).max(16),
  nativeRawAmount: z.string().regex(/^\d+$/u),
  nativeUiAmount: z.string().min(1).max(128),
  nativeUsdPrice: z.number().finite().nonnegative().nullable().optional(),
  nativeUsdValue: z.number().finite().nonnegative().nullable().optional(),
  totalUsd: z.number().finite().nonnegative().nullable().optional(),
  valuationStatus: z.enum(["complete", "partial", "unavailable"]).optional(),
  assets: z.array(EvmPortfolioAssetSchema).max(12),
  verifiedAt: z.string().datetime(),
}).strict();
export const EvmPortfolioGetResponseSchema = RequestBaseSchema.extend({
  snapshot: EvmPortfolioSnapshotSchema,
}).strict();
export type EvmPortfolioTokenRequest = z.infer<typeof EvmPortfolioTokenRequestSchema>;
export type EvmPortfolioGetRequest = z.infer<typeof EvmPortfolioGetRequestSchema>;
export type EvmPortfolioAsset = z.infer<typeof EvmPortfolioAssetSchema>;
export type EvmPortfolioSnapshot = z.infer<typeof EvmPortfolioSnapshotSchema>;
export type EvmPortfolioGetResponse = z.infer<typeof EvmPortfolioGetResponseSchema>;

export const GuardedCapabilitySchema = z.enum([
  "solana-swap",
  "evm-swap",
  "bridge",
  "token-launch",
]);
export type GuardedCapability = z.infer<typeof GuardedCapabilitySchema>;

export const FullAccessGrantRecordSchema = z.object({
  id: z.string().uuid(),
  capability: GuardedCapabilitySchema,
  chainKey: EvmChainKeySchema.optional(),
  grantedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict();
export type FullAccessGrantRecord = z.infer<typeof FullAccessGrantRecordSchema>;
export const FullAccessGrantCreateRequestSchema = RequestBaseSchema.extend({
  capability: GuardedCapabilitySchema,
  chainKey: EvmChainKeySchema.optional(),
  masterPassword: z.string().min(1).max(256),
}).strict();
export type FullAccessGrantCreateRequest = z.infer<typeof FullAccessGrantCreateRequestSchema>;

export const PumpLaunchManagedMetadataPublishRequestSchema = RequestBaseSchema.extend({
  sessionId: z.string().uuid(),
  draftId: z.string().uuid(),
}).strict();
export const PumpLaunchManagedMetadataPublishResponseSchema = RequestBaseSchema.extend({
  metadataUri: z.string().url(),
}).strict();
export type PumpLaunchManagedMetadataPublishRequest = z.infer<typeof PumpLaunchManagedMetadataPublishRequestSchema>;
export type PumpLaunchManagedMetadataPublishResponse = z.infer<typeof PumpLaunchManagedMetadataPublishResponseSchema>;
