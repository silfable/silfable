import { getCompiledTransactionMessageDecoder, getTransactionDecoder, getTransactionEncoder, partiallySignTransaction } from "@solana/kit";
import { LimitOrderCancelReceiptSchema, LimitOrderCancelSimulationSchema, LimitOrderExecutionReceiptSchema, LimitOrderSimulationPreviewSchema, LimitOrderViewSchema, type LimitOrderCancelReceipt, type LimitOrderCancelSimulation, type LimitOrderContractPreview, type LimitOrderExecutionReceipt, type LimitOrderSimulationPreview, type LimitOrderView } from "@silfable/contracts";

import type { MainnetReadService, SignatureVerification } from "../integrations/read-only.js";
import type { JupiterTriggerV2Client, TriggerDeposit, TriggerVault } from "../integrations/trigger-v2.js";
import type { WalletOnboardingService } from "../wallet/onboarding.js";
import type { TransactionSettingsService } from "./transaction-settings.js";
import { MissionPolicyService } from "./policy.js";

const ALLOWED_VAULT_PROGRAMS = new Set([
  "11111111111111111111111111111111", "ComputeBudget111111111111111111111111111111",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
]);

export class LimitOrderService {
  readonly #reads: MainnetReadService;
  readonly #wallets: WalletOnboardingService;
  readonly #trigger: JupiterTriggerV2Client;
  readonly #policy: MissionPolicyService;
  readonly #prepared = new Map<string, { preview: LimitOrderContractPreview; deposit: TriggerDeposit; vault: TriggerVault; expiresAt: number }>();
  readonly #preparedCancellations = new Map<string, { walletAddress: string; orderId: string; transaction: string; requestId: string; expiresAt: number }>();

  constructor(input: { reads: MainnetReadService; wallets: WalletOnboardingService; trigger: JupiterTriggerV2Client; transactionSettings?: Pick<TransactionSettingsService, "get"> }) {
    this.#reads = input.reads; this.#wallets = input.wallets; this.#trigger = input.trigger; this.#policy = new MissionPolicyService(input.reads, input.transactionSettings);
  }

  async simulate(preview: LimitOrderContractPreview): Promise<LimitOrderSimulationPreview> {
    const base = { id: crypto.randomUUID(), orderId: preview.id, transactionSigned: false as const, broadcastAttempted: false as const, simulatedAt: new Date().toISOString() };
    try {
      const refreshed = await this.#refresh(preview);
      if (refreshed.status !== "ready-for-review") return result(base, "blocked", null, [], null, null, "Limit-order policy no longer passes against current Mainnet evidence.");
      const vault = await this.#trigger.getOrRegisterVault(preview.walletAddress);
      const deposit = await this.#trigger.craftSingleDeposit({ walletAddress: preview.walletAddress, inputMint: preview.inputMint, outputMint: preview.outputMint, amount: preview.inputAmount });
      if (deposit.receiverAddress !== vault.vaultPubkey || deposit.mint !== preview.inputMint || deposit.amount !== preview.inputAmount) throw new Error("Jupiter deposit is not bound to the approved vault, mint, and amount");
      const programIds = inspectVaultTransaction(deposit.transaction, preview.walletAddress);
      const simulation = await this.#reads.simulateUnsignedTransaction(deposit.transaction);
      if (simulation.err !== null) return result(base, "failed", vault.vaultPubkey, programIds, simulation.unitsConsumed, simulation.feeLamports, `Deposit simulation failed: ${safeJson(simulation.err)}`);
      this.#purge();
      this.#prepared.set(base.id, { preview, deposit, vault, expiresAt: Date.now() + 90_000 });
      return result(base, "passed", vault.vaultPubkey, programIds, simulation.unitsConsumed, simulation.feeLamports, null);
    } catch (error) {
      return result(base, "blocked", null, [], null, null, error instanceof Error ? error.message.slice(0, 500) : "Limit-order simulation was blocked safely.");
    }
  }

  async execute(preview: LimitOrderContractPreview, simulationId: string): Promise<LimitOrderExecutionReceipt> {
    this.#purge();
    const prepared = this.#prepared.get(simulationId); this.#prepared.delete(simulationId);
    if (prepared === undefined || prepared.preview.id !== preview.id || prepared.expiresAt < Date.now()) throw new Error("Limit-order simulation approval expired; run a new simulation");
    const refreshed = await this.#refresh(preview);
    if (refreshed.status !== "ready-for-review") throw new Error("Limit-order policy no longer passes against current Mainnet evidence");
    inspectVaultTransaction(prepared.deposit.transaction, preview.walletAddress);
    const decoded = getTransactionDecoder().decode(Buffer.from(prepared.deposit.transaction, "base64"));
    const signedTransaction = await this.#wallets.withWalletSigner(preview.walletAddress, async (signer) => {
      const signed = await partiallySignTransaction([signer.keyPair], decoded);
      return Buffer.from(getTransactionEncoder().encode(signed)).toString("base64");
    });
    const createdAt = new Date().toISOString();
    try {
      const order = await this.#trigger.createSingleOrder({
        depositRequestId: prepared.deposit.requestId, depositSignedTx: signedTransaction, userPubkey: preview.walletAddress,
        inputMint: preview.inputMint, inputAmount: preview.inputAmount, outputMint: preview.outputMint, triggerMint: preview.triggerMint,
        triggerCondition: preview.triggerCondition, triggerPriceUsd: preview.triggerPriceUsd, slippageBps: preview.maxSlippageBps, expiresAt: Date.parse(preview.expiresAt),
      });
      let verification: SignatureVerification | null = null;
      try { verification = await this.#reads.verifyTransactionSignature(order.txSignature); } catch { /* receipt stays independently unverified */ }
      const confirmed = order.depositConfirmed && (verification?.state === "confirmed" || verification?.state === "finalized");
      return LimitOrderExecutionReceiptSchema.parse({
        id: crypto.randomUUID(), previewId: preview.id, simulationId, orderId: order.id, status: confirmed ? "active" : "unknown",
        depositSignature: order.txSignature, vaultAddress: prepared.vault.vaultPubkey, explorerUrl: `https://explorer.solana.com/tx/${order.txSignature}`,
        depositConfirmed: order.depositConfirmed, chainVerification: verification?.state ?? "unavailable", chainSlot: verification?.slot ?? null,
        error: confirmed ? null : "Jupiter accepted the order, but the deposit signature is not independently confirmed yet.", verifiedAt: verification?.verifiedAt ?? null, createdAt,
      });
    } catch (error) {
      return LimitOrderExecutionReceiptSchema.parse({
        id: crypto.randomUUID(), previewId: preview.id, simulationId, orderId: null, status: "unknown", depositSignature: null,
        vaultAddress: prepared.vault.vaultPubkey, explorerUrl: null, depositConfirmed: false, chainVerification: "unavailable", chainSlot: null,
        error: error instanceof Error ? error.message.slice(0, 500) : "Limit-order submission status is unknown", verifiedAt: null, createdAt,
      });
    }
  }

  async list(walletAddress: string, state: "active" | "past"): Promise<LimitOrderView[]> {
    const history = await this.#trigger.history(walletAddress, state);
    return history.orders.filter((order) => order.userPubkey === walletAddress).map((order) => LimitOrderViewSchema.parse(order));
  }

  async simulateCancel(walletAddress: string, orderId: string): Promise<LimitOrderCancelSimulation> {
    const base = { id: crypto.randomUUID(), orderId, transactionSigned: false as const, broadcastAttempted: false as const, simulatedAt: new Date().toISOString() };
    try {
      const active = await this.list(walletAddress, "active");
      const order = active.find((candidate) => candidate.id === orderId);
      if (!order || !["pending", "open", "pending_withdraw"].includes(order.orderState)) return cancelResult(base, "blocked", [], null, null, "Order is not owned by this wallet or is not cancellable.");
      const draft = await this.#trigger.initiateCancel(walletAddress, orderId);
      if (draft.id !== orderId) throw new Error("Jupiter cancellation is not bound to the selected order");
      const programIds = inspectVaultTransaction(draft.transaction, walletAddress);
      const simulation = await this.#reads.simulateUnsignedTransaction(draft.transaction);
      if (simulation.err !== null) return cancelResult(base, "failed", programIds, simulation.unitsConsumed, simulation.feeLamports, `Withdrawal simulation failed: ${safeJson(simulation.err)}`);
      this.#purge(); this.#preparedCancellations.set(base.id, { walletAddress, orderId, transaction: draft.transaction, requestId: draft.requestId, expiresAt: Date.now() + 90_000 });
      return cancelResult(base, "passed", programIds, simulation.unitsConsumed, simulation.feeLamports, null);
    } catch (error) { return cancelResult(base, "blocked", [], null, null, error instanceof Error ? error.message.slice(0, 500) : "Cancellation simulation was blocked safely."); }
  }

  async executeCancel(walletAddress: string, orderId: string, simulationId: string): Promise<LimitOrderCancelReceipt> {
    this.#purge(); const prepared = this.#preparedCancellations.get(simulationId); this.#preparedCancellations.delete(simulationId);
    if (!prepared || prepared.walletAddress !== walletAddress || prepared.orderId !== orderId || prepared.expiresAt < Date.now()) throw new Error("Cancellation simulation approval expired; run a new simulation");
    inspectVaultTransaction(prepared.transaction, walletAddress);
    const decoded = getTransactionDecoder().decode(Buffer.from(prepared.transaction, "base64"));
    const signedTransaction = await this.#wallets.withWalletSigner(walletAddress, async (signer) => Buffer.from(getTransactionEncoder().encode(await partiallySignTransaction([signer.keyPair], decoded))).toString("base64"));
    const createdAt = new Date().toISOString();
    try {
      const cancellation = await this.#trigger.confirmCancel(walletAddress, orderId, signedTransaction, prepared.requestId);
      if (cancellation.id !== orderId) throw new Error("Jupiter cancellation receipt is not bound to the selected order");
      let verification: SignatureVerification | null = null; try { verification = await this.#reads.verifyTransactionSignature(cancellation.txSignature); } catch { /* unknown */ }
      const confirmed = verification?.state === "confirmed" || verification?.state === "finalized";
      return LimitOrderCancelReceiptSchema.parse({ id: crypto.randomUUID(), orderId, simulationId, status: confirmed ? "cancelled" : "unknown", withdrawalSignature: cancellation.txSignature, explorerUrl: `https://explorer.solana.com/tx/${cancellation.txSignature}`, chainVerification: verification?.state ?? "unavailable", chainSlot: verification?.slot ?? null, error: confirmed ? null : "Withdrawal was submitted but is not independently confirmed yet.", verifiedAt: verification?.verifiedAt ?? null, createdAt });
    } catch (error) { return LimitOrderCancelReceiptSchema.parse({ id: crypto.randomUUID(), orderId, simulationId, status: "unknown", withdrawalSignature: null, explorerUrl: null, chainVerification: "unavailable", chainSlot: null, error: error instanceof Error ? error.message.slice(0, 500) : "Cancellation submission status is unknown", verifiedAt: null, createdAt }); }
  }

  async verifyExecutionReceipt(receipt: LimitOrderExecutionReceipt): Promise<LimitOrderExecutionReceipt> {
    if (receipt.depositSignature === null) throw new Error("This limit-order execution receipt has no signature to verify");
    try {
      const verification = await this.#reads.verifyTransactionSignature(receipt.depositSignature);
      const confirmed = verification.state === "confirmed" || verification.state === "finalized";
      const failed = verification.state === "failed";
      const status = confirmed ? "active" : failed ? "failed" : "unknown";
      return LimitOrderExecutionReceiptSchema.parse({
        ...receipt,
        status,
        depositConfirmed: confirmed,
        chainVerification: verification.state,
        chainSlot: verification.slot,
        error: confirmed ? null : verification.error ?? (status === "unknown" ? "Deposit transaction is not yet confirmed in Solana transaction history" : "Solana reported that the deposit transaction failed"),
        verifiedAt: verification.verifiedAt,
      });
    } catch (error) {
      return LimitOrderExecutionReceiptSchema.parse({
        ...receipt,
        status: "unknown",
        chainVerification: "unavailable",
        chainSlot: null,
        error: error instanceof Error ? error.message.slice(0, 500) : "Verification check failed",
        verifiedAt: null,
      });
    }
  }

  async verifyCancelReceipt(receipt: LimitOrderCancelReceipt): Promise<LimitOrderCancelReceipt> {
    if (receipt.withdrawalSignature === null) throw new Error("This limit-order cancellation receipt has no signature to verify");
    try {
      const verification = await this.#reads.verifyTransactionSignature(receipt.withdrawalSignature);
      const confirmed = verification.state === "confirmed" || verification.state === "finalized";
      const failed = verification.state === "failed";
      const status = confirmed ? "cancelled" : failed ? "failed" : "unknown";
      return LimitOrderCancelReceiptSchema.parse({
        ...receipt,
        status,
        chainVerification: verification.state,
        chainSlot: verification.slot,
        error: confirmed ? null : verification.error ?? (status === "unknown" ? "Withdrawal transaction is not yet confirmed in Solana transaction history" : "Solana reported that the withdrawal transaction failed"),
        verifiedAt: verification.verifiedAt,
      });
    } catch (error) {
      return LimitOrderCancelReceiptSchema.parse({
        ...receipt,
        status: "unknown",
        chainVerification: "unavailable",
        chainSlot: null,
        error: error instanceof Error ? error.message.slice(0, 500) : "Verification check failed",
        verifiedAt: null,
      });
    }
  }

  async #refresh(preview: LimitOrderContractPreview): Promise<LimitOrderContractPreview> {
    return this.#policy.limitOrderPreview({ goal: preview.goal, walletAddress: preview.walletAddress, inputMint: preview.inputMint, outputMint: preview.outputMint, inputAmount: preview.inputAmount, triggerMint: preview.triggerMint, triggerCondition: preview.triggerCondition, triggerPriceUsd: preview.triggerPriceUsd, maxSlippageBps: preview.maxSlippageBps, expiresAt: preview.expiresAt });
  }
  #purge(): void { const now = Date.now(); for (const [id, value] of this.#prepared) if (value.expiresAt < now) this.#prepared.delete(id); for (const [id, value] of this.#preparedCancellations) if (value.expiresAt < now) this.#preparedCancellations.delete(id); }
}

function inspectVaultTransaction(encoded: string, walletAddress: string): string[] {
  const transaction = getTransactionDecoder().decode(Buffer.from(encoded, "base64"));
  const signatures = Object.entries(transaction.signatures);
  if (signatures.length !== 1 || signatures[0]?.[0] !== walletAddress || signatures[0]?.[1] !== null) throw new Error("Vault transaction signer scope is not restricted to the selected wallet");
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  if (message.version === 1 || message.header.numSignerAccounts !== 1 || String(message.staticAccounts[0]) !== walletAddress) throw new Error("Selected wallet is not the sole vault transaction signer");
  const programs = [...new Set(message.instructions.map((instruction) => { const program = message.staticAccounts[instruction.programAddressIndex]; if (program === undefined) throw new Error("Vault transaction loads a program indirectly"); return String(program); }))];
  const denied = programs.filter((program) => !ALLOWED_VAULT_PROGRAMS.has(program));
  if (programs.length < 1 || programs.length > 12 || denied.length > 0) throw new Error(`Vault transaction contains a non-allowlisted program${denied[0] ? `: ${denied[0]}` : ""}`);
  return programs;
}
function result(base: Pick<LimitOrderSimulationPreview, "id" | "orderId" | "transactionSigned" | "broadcastAttempted" | "simulatedAt">, status: LimitOrderSimulationPreview["status"], vaultAddress: string | null, programIds: string[], unitsConsumed: number | null, feeLamports: number | null, error: string | null): LimitOrderSimulationPreview { return LimitOrderSimulationPreviewSchema.parse({ ...base, status, vaultAddress, programIds, unitsConsumed, feeLamports, error }); }
function safeJson(value: unknown): string { try { return JSON.stringify(value).slice(0, 400); } catch { return "Unknown simulation error"; } }
function cancelResult(base: Pick<LimitOrderCancelSimulation, "id" | "orderId" | "transactionSigned" | "broadcastAttempted" | "simulatedAt">, status: LimitOrderCancelSimulation["status"], programIds: string[], unitsConsumed: number | null, feeLamports: number | null, error: string | null): LimitOrderCancelSimulation { return LimitOrderCancelSimulationSchema.parse({ ...base, status, programIds, unitsConsumed, feeLamports, error }); }
