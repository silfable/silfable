import { getCompiledTransactionMessageDecoder, getSignatureFromTransaction, getTransactionDecoder, getTransactionEncoder, partiallySignTransaction } from "@solana/kit";
import { MissionExecutionReceiptSchema, MissionSimulationPreviewSchema, type MissionContractPreview, type MissionExecutionReceipt, type MissionSimulationPreview, type TransactionSettings } from "@silfable/contracts";

import type { MainnetReadService, RawSimulationResult, SignatureVerification, TransactionSettlement, UnsignedSwapOrder } from "../integrations/read-only.js";
import { allowedSolanaPrograms } from "../security/solana-program-policy.js";
import { writeSafeAuditLog } from "../telemetry/safe-audit-log.js";
import type { WalletOnboardingService } from "../wallet/onboarding.js";
import { MissionPolicyService } from "./policy.js";
import { DEFAULT_TRANSACTION_SETTINGS, type TransactionSettingsService } from "./transaction-settings.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";

const ALLOWED_PROGRAMS = allowedSolanaPrograms("jupiter-swap");

export class MissionSimulationService {
  readonly #reads: MainnetReadService;
  readonly #wallets: WalletOnboardingService;
  readonly #settings: Pick<TransactionSettingsService, "get">;
  readonly #prepared = new Map<string, {
    mission: MissionContractPreview;
    order: UnsignedSwapOrder;
    settings: TransactionSettings;
    accountFundingLamports: number | null;
    estimatedWalletOutflowLamports: string | null;
    expiresAt: number;
  }>();

  constructor(reads: MainnetReadService, wallets: WalletOnboardingService, settings: Pick<TransactionSettingsService, "get"> = { get: () => ({ ...DEFAULT_TRANSACTION_SETTINGS }) }) {
    this.#reads = reads;
    this.#wallets = wallets;
    this.#settings = settings;
  }

  async simulate(mission: MissionContractPreview, sessionSettings: TransactionSettings = this.#settings.get()): Promise<MissionSimulationPreview> {
    const base = { id: crypto.randomUUID(), missionId: mission.id, transactionSigned: false as const, broadcastAttempted: false as const, simulatedAt: new Date().toISOString() };
    try {
      const policy = new MissionPolicyService(this.#reads, { get: () => sessionSettings });
      const refreshed = await policy.preview({
        goal: mission.goal, walletAddress: mission.walletAddress, inputMint: mission.inputMint, outputMint: mission.outputMint,
        inputAmount: mission.inputAmount, maxSlippageBps: mission.maxSlippageBps, deadlineAt: mission.deadlineAt, stopConditions: mission.stopConditions,
      });
      if (refreshed.status !== "ready-for-review" || refreshed.quote === null) return result(base, "blocked", null, null, [], null, null, [], "Mission policy no longer passes against current Mainnet evidence.");
      const priority = sessionSettings.priority;
      const order = await this.#reads.buildUnsignedSwapOrder(mission.inputMint, mission.outputMint, mission.inputAmount, mission.walletAddress, mission.maxSlippageBps, priority);
      const minimumOut = BigInt(refreshed.quote.outAmount) * BigInt(10_000 - mission.maxSlippageBps) / 10_000n;
      if (BigInt(order.outAmount) < minimumOut) return result(base, "blocked", order.router, order.outAmount, [], null, null, [], "Unsigned order output fell below the mission slippage floor.");
      const programIds = inspectUnsignedTransaction(order.transaction, mission.walletAddress);
      const simulation = await this.#reads.simulateUnsignedTransaction(order.transaction, simulationWalletScope(mission));
      const walletImpact = simulationWalletImpact(simulation);
      const fee = await evaluateFeeGuard(this.#reads, { get: () => sessionSettings }, mission, simulation.feeLamports);
      if (simulation.err !== null) return result(base, "failed", order.router, order.outAmount, programIds, simulation.unitsConsumed, simulation.feeLamports, simulation.logs, `Simulation failed: ${safeJson(simulation.err)}`, fee, walletImpact);
      if (!fee.feeGuardPassed) return result(base, "blocked", order.router, order.outAmount, programIds, simulation.unitsConsumed, simulation.feeLamports, simulation.logs, fee.feeGuardMessage ?? "Fee guard blocked execution.", fee, walletImpact);
      this.#purgeExpired();
      this.#prepared.set(base.id, {
        mission,
        order,
        settings: sessionSettings,
        ...walletImpact,
        expiresAt: Date.now() + 90_000,
      });
      return result(base, "passed", order.router, order.outAmount, programIds, simulation.unitsConsumed, simulation.feeLamports, simulation.logs, null, fee, walletImpact);
    } catch (error) {
      return result(base, "blocked", null, null, [], null, null, [], error instanceof Error ? error.message.slice(0, 500) : "Simulation was blocked safely.");
    }
  }

  async execute(mission: MissionContractPreview, simulationId: string): Promise<MissionExecutionReceipt> {
    this.#purgeExpired();
    const prepared = this.#prepared.get(simulationId);
    this.#prepared.delete(simulationId);
    if (prepared === undefined || prepared.mission.id !== mission.id) throw new Error("Simulation approval expired; run a new simulation");
    if (prepared.expiresAt < Date.now() || Date.parse(mission.deadlineAt) <= Date.now()) throw new Error("Mission or simulation approval expired");
    const policy = new MissionPolicyService(this.#reads, { get: () => prepared.settings });
    const refreshed = await policy.preview({
      goal: mission.goal, walletAddress: mission.walletAddress, inputMint: mission.inputMint, outputMint: mission.outputMint,
      inputAmount: mission.inputAmount, maxSlippageBps: mission.maxSlippageBps, deadlineAt: mission.deadlineAt, stopConditions: mission.stopConditions,
    });
    if (refreshed.status !== "ready-for-review" || refreshed.quote === null) throw new Error("Mission policy no longer passes against current Mainnet evidence");
    const minimumOut = BigInt(refreshed.quote.outAmount) * BigInt(10_000 - mission.maxSlippageBps) / 10_000n;
    if (BigInt(prepared.order.outAmount) < minimumOut) throw new Error("Approved transaction is now below the mission slippage floor");
    inspectUnsignedTransaction(prepared.order.transaction, mission.walletAddress);
    const finalSimulation = await this.#reads.simulateUnsignedTransaction(prepared.order.transaction, simulationWalletScope(mission));
    if (finalSimulation.err !== null) {
      throw new Error(`${friendlySwapFailure(prepared.order.router, safeJson(finalSimulation.err), finalSimulation.logs)} No transaction was signed or broadcast.`);
    }
    const finalFee = await evaluateFeeGuard(this.#reads, { get: () => prepared.settings }, mission, finalSimulation.feeLamports);
    if (!finalFee.feeGuardPassed) throw new Error(`${finalFee.feeGuardMessage ?? "Fee guard blocked execution."} No transaction was signed or broadcast.`);
    assertFinalWalletImpact(prepared, simulationWalletImpact(finalSimulation));
    const decoded = getTransactionDecoder().decode(Buffer.from(prepared.order.transaction, "base64"));
    const signedTransaction = await this.#wallets.withWalletSigner(mission.walletAddress, async (signer) => {
      const signed = await partiallySignTransaction([signer.keyPair], decoded);
      return {
        encoded: Buffer.from(getTransactionEncoder().encode(signed)).toString("base64"),
        signature: getSignatureFromTransaction(signed),
      };
    });
    const base = { id: crypto.randomUUID(), missionId: mission.id, simulationId, router: prepared.order.router, walletAddress: mission.walletAddress, inputMint: mission.inputMint, transactionSigned: true as const, broadcastAttempted: true as const, executedAt: new Date().toISOString() };
    try {
      const execution = await this.#reads.executeSignedSwap(signedTransaction.encoded, prepared.order.requestId, prepared.order.lastValidBlockHeight);
      if (
        execution.signature !== null &&
        execution.signature !== signedTransaction.signature
      ) {
        throw new Error(
          "The router returned a signature that does not match the locally signed transaction",
        );
      }
      const receiptSignature = execution.signature ?? signedTransaction.signature;
      let verification: SignatureVerification | null = null;
      let settlement: TransactionSettlement | null = null;
      let verificationError: string | null = null;
      if (receiptSignature !== null) {
        try { verification = await this.#reads.verifyTransactionSignature(receiptSignature); }
        catch (error) { verificationError = error instanceof Error ? error.message.slice(0, 500) : "Solana RPC verification is unavailable"; }
        if (verification?.state === "confirmed" || verification?.state === "finalized") {
          try { settlement = await this.#reads.transactionSettlement(receiptSignature, mission.walletAddress); } catch { /* Can be retried from the persisted receipt. */ }
        }
      }
      const receiptDecision = resolveSwapReceiptStatus(execution.status, execution.code, receiptSignature, verification);
      const status = receiptDecision.status;
      if (receiptDecision.conflictCode !== null) {
        writeSafeAuditLog("provider_rpc_evidence_conflict", {
          operation: "jupiter_swap_reconciliation",
          outcome: "blocked",
          code: receiptDecision.conflictCode,
        });
      }
      const outflow = settlementDetails(settlement, mission.inputMint === SOL_MINT ? execution.totalInputAmount : null);
      return MissionExecutionReceiptSchema.parse({
        ...base,
        status,
        signature: receiptSignature,
        explorerUrl: `https://explorer.solana.com/tx/${receiptSignature}`,
        inputAmount: execution.totalInputAmount,
        outputAmount: execution.totalOutputAmount,
        expectedOutputAmount: prepared.order.outAmount,
        actualSlippageBps: calculateSlippageBps(prepared.order.outAmount, execution.totalOutputAmount),
        networkFeeLamports: finalSimulation.feeLamports,
        actualNetworkFeeLamports: settlement?.feeLamports ?? null,
        walletPreLamports: settlement?.walletPreLamports ?? null,
        walletPostLamports: settlement?.walletPostLamports ?? null,
        ...outflow,
        code: execution.code,
        error: status === "confirmed" ? null : friendlySwapFailure(prepared.order.router, verification?.error ?? execution.error ?? (status === "unknown" ? "Broadcast result has not yet been independently confirmed by Solana RPC" : "The transaction failed")),
        chainVerification: verification?.state ?? "unavailable",
        chainSlot: verification?.slot ?? null,
        chainError: verification?.error === null || verification?.error === undefined ? verificationError : friendlySwapFailure(prepared.order.router, verification.error),
        verifiedAt: verification?.verifiedAt ?? null,
      });
    } catch (error) {
      return MissionExecutionReceiptSchema.parse({
        ...base, status: "unknown", signature: signedTransaction.signature, explorerUrl: `https://explorer.solana.com/tx/${signedTransaction.signature}`, inputAmount: null, outputAmount: null,
        expectedOutputAmount: prepared.order.outAmount, actualSlippageBps: null, networkFeeLamports: finalSimulation.feeLamports,
        actualNetworkFeeLamports: null, walletPreLamports: null, walletPostLamports: null, totalWalletOutflowLamports: null, accountFundingLamports: null, code: null,
        error: error instanceof Error ? error.message.slice(0, 500) : "Execution was submitted but its status is unknown",
        chainVerification: "unavailable", chainSlot: null, chainError: "The locally derived signature is available for read-only verification; never rebroadcast without checking it first", verifiedAt: null,
      });
    }
  }

  async verifyReceipt(receipt: MissionExecutionReceipt): Promise<MissionExecutionReceipt> {
    if (receipt.signature === null) throw new Error("This receipt has no signature to verify");
    try {
      const verification = await this.#reads.verifyTransactionSignature(receipt.signature);
      let settlement: TransactionSettlement | null = null;
      if ((verification.state === "confirmed" || verification.state === "finalized") && receipt.walletAddress) {
        try { settlement = await this.#reads.transactionSettlement(receipt.signature, receipt.walletAddress); } catch { /* Status evidence remains usable independently. */ }
      }
      const status = verification.state === "confirmed" || verification.state === "finalized"
        ? "confirmed"
        : verification.state === "failed" ? "failed" : "unknown";
      return MissionExecutionReceiptSchema.parse({
        ...receipt,
        status,
        error: status === "confirmed" ? null : friendlySwapFailure(receipt.router, verification.error ?? (status === "unknown" ? "The signature is not yet confirmed in Solana transaction history" : "Solana reported that the transaction failed")),
        chainVerification: verification.state,
        chainSlot: verification.slot,
        chainError: verification.error === null ? null : friendlySwapFailure(receipt.router, verification.error),
        verifiedAt: verification.verifiedAt,
        actualNetworkFeeLamports: settlement?.feeLamports ?? receipt.actualNetworkFeeLamports ?? null,
        walletPreLamports: settlement?.walletPreLamports ?? receipt.walletPreLamports ?? null,
        walletPostLamports: settlement?.walletPostLamports ?? receipt.walletPostLamports ?? null,
        ...(settlement && receipt.inputMint ? settlementDetails(settlement, receipt.inputMint === SOL_MINT ? receipt.inputAmount : null) : {}),
      });
    } catch (error) {
      return MissionExecutionReceiptSchema.parse({
        ...receipt,
        chainVerification: "unavailable",
        chainError: error instanceof Error ? error.message.slice(0, 500) : "Solana RPC verification is unavailable",
        verifiedAt: new Date().toISOString(),
      });
    }
  }

  #purgeExpired(): void {
    const now = Date.now();
    for (const [id, prepared] of this.#prepared) if (prepared.expiresAt < now) this.#prepared.delete(id);
  }
}

function inspectUnsignedTransaction(encoded: string, walletAddress: string): string[] {
  const bytes = Buffer.from(encoded, "base64");
  const transaction = getTransactionDecoder().decode(bytes);
  const signatures = Object.entries(transaction.signatures);
  if (signatures.length !== 1 || signatures[0]?.[0] !== walletAddress || signatures[0]?.[1] !== null) throw new Error("Unsigned order signer scope is not restricted to the selected wallet");
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  if (message.version === 1) throw new Error("Transaction message version is not supported for Mainnet simulation review");
  if (message.header.numSignerAccounts !== 1 || String(message.staticAccounts[0]) !== walletAddress) throw new Error("Selected wallet is not the sole fee payer and signer");
  const programs = [...new Set(message.instructions.map((instruction) => {
    const program = message.staticAccounts[instruction.programAddressIndex];
    if (program === undefined) throw new Error("Transaction program was loaded indirectly and cannot be allowlisted");
    return String(program);
  }))];
  if (programs.length < 1 || programs.length > 16) throw new Error("Transaction program scope is invalid");
  const denied = programs.filter((program) => !ALLOWED_PROGRAMS.has(program));
  if (denied.length > 0) throw new Error(`Transaction contains a non-allowlisted program: ${denied[0]}`);
  return programs;
}

function result(
  base: Pick<MissionSimulationPreview, "id" | "missionId" | "transactionSigned" | "broadcastAttempted" | "simulatedAt">,
  status: MissionSimulationPreview["status"], router: string | null, expectedOutAmount: string | null, programIds: string[],
  unitsConsumed: number | null, feeLamports: number | null, logs: string[], error: string | null,
  fee: FeeEvaluation = unavailableFee("Network fee is unavailable."),
  walletImpact: SimulationWalletImpact = {
    accountFundingLamports: null,
    estimatedWalletOutflowLamports: null,
  },
): MissionSimulationPreview {
  return MissionSimulationPreviewSchema.parse({
    ...base,
    status,
    router,
    expectedOutAmount,
    programIds,
    unitsConsumed,
    feeLamports,
    logs,
    error,
    ...fee,
    ...walletImpact,
  });
}

type FeeEvaluation = Pick<MissionSimulationPreview, "feeSol" | "feeUsd" | "feePercent" | "feeRisk" | "feeGuardPassed" | "feeGuardMessage">;
type SimulationWalletImpact = {
  accountFundingLamports: number | null;
  estimatedWalletOutflowLamports: string | null;
};

function simulationWalletScope(mission: MissionContractPreview): {
  walletAddress: string;
  solInputLamports: string | null;
} {
  return {
    walletAddress: mission.walletAddress,
    solInputLamports: mission.inputMint === SOL_MINT ? mission.inputAmount : null,
  };
}

function simulationWalletImpact(simulation: RawSimulationResult): SimulationWalletImpact {
  return {
    accountFundingLamports: simulation.accountCreationFundingLamports ?? null,
    estimatedWalletOutflowLamports: simulation.estimatedWalletOutflowLamports ?? null,
  };
}

function assertFinalWalletImpact(
  reviewed: SimulationWalletImpact,
  current: SimulationWalletImpact,
): void {
  if (reviewed.accountFundingLamports !== null) {
    if (current.accountFundingLamports === null) {
      throw new Error("Final account-funding evidence is unavailable. No transaction was signed or broadcast.");
    }
    if (current.accountFundingLamports > reviewed.accountFundingLamports) {
      throw new Error("Final account funding exceeds the reviewed simulation. Run a new simulation before signing.");
    }
  }
  if (reviewed.estimatedWalletOutflowLamports !== null) {
    if (current.estimatedWalletOutflowLamports === null) {
      throw new Error("Final wallet-outflow evidence is unavailable. No transaction was signed or broadcast.");
    }
    if (BigInt(current.estimatedWalletOutflowLamports) > BigInt(reviewed.estimatedWalletOutflowLamports)) {
      throw new Error("Final wallet outflow exceeds the reviewed simulation. Run a new simulation before signing.");
    }
  }
}

async function evaluateFeeGuard(reads: MainnetReadService, service: Pick<TransactionSettingsService, "get">, mission: MissionContractPreview, feeLamports: number | null): Promise<FeeEvaluation> {
  if (feeLamports === null) return unavailableFee("Network fee could not be verified, so execution is blocked.");
  const settings = service.get();
  const feeSol = lamportsToSol(feeLamports);
  let feeUsd: number | null = null;
  let feePercent: number | null = mission.inputMint === SOL_MINT ? feeLamports / Number(BigInt(mission.inputAmount)) * 100 : null;
  try {
    const portfolio = await reads.portfolio(mission.walletAddress);
    feeUsd = portfolio.solUsdPrice === null ? null : Number(feeSol) * portfolio.solUsdPrice;
    if (feePercent === null) {
      const asset = portfolio.assets.find((entry) => entry.mint === mission.inputMint);
      if (asset?.usdPrice !== null && asset?.usdPrice !== undefined && feeUsd !== null) {
        const inputValueUsd = Number(mission.inputAmount) / (10 ** asset.decimals) * asset.usdPrice;
        if (Number.isFinite(inputValueUsd) && inputValueUsd > 0) feePercent = feeUsd / inputValueUsd * 100;
      }
    }
  } catch { /* Absolute fee ceiling remains enforceable when pricing is unavailable. */ }
  const absoluteExceeded = feeLamports > settings.maxNetworkFeeLamports;
  const percentageExceeded = feePercent !== null && feePercent > settings.maxFeePercent;
  const utilization = Math.max(feeLamports / settings.maxNetworkFeeLamports, feePercent === null ? 0 : feePercent / settings.maxFeePercent);
  const feeRisk = absoluteExceeded || percentageExceeded ? "extreme" : utilization >= 0.75 ? "high" : "reasonable";
  const feeGuardPassed = !absoluteExceeded && !percentageExceeded;
  const feeGuardMessage = feeGuardPassed
    ? `Fee is within limits (${feeLamports.toLocaleString()} / ${settings.maxNetworkFeeLamports.toLocaleString()} lamports${feePercent === null ? "" : `; ${feePercent.toFixed(2)}% / ${settings.maxFeePercent}%`}).`
    : `Fee guard blocked execution: ${feeLamports.toLocaleString()} lamports${feePercent === null ? "" : ` (${feePercent.toFixed(2)}%)`} exceeds the configured limit.`;
  return { feeSol, feeUsd, feePercent, feeRisk, feeGuardPassed, feeGuardMessage };
}

function unavailableFee(message: string): FeeEvaluation {
  return { feeSol: null, feeUsd: null, feePercent: null, feeRisk: "unavailable", feeGuardPassed: false, feeGuardMessage: message };
}

function lamportsToSol(value: number): string {
  const raw = String(value).padStart(10, "0");
  const whole = raw.slice(0, -9);
  const fraction = raw.slice(-9).replace(/0+$/u, "");
  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
}

function calculateSlippageBps(expected: string, actual: string | null): number | null {
  if (actual === null || BigInt(expected) === 0n) return null;
  return Number((BigInt(expected) - BigInt(actual)) * 1_000_000n / BigInt(expected)) / 100;
}

function settlementDetails(settlement: TransactionSettlement | null, solInputAmount: string | null): Pick<MissionExecutionReceipt, "totalWalletOutflowLamports" | "accountFundingLamports"> {
  if (settlement === null) return { totalWalletOutflowLamports: null, accountFundingLamports: null };
  const pre = BigInt(settlement.walletPreLamports);
  const post = BigInt(settlement.walletPostLamports);
  const total = pre > post ? pre - post : 0n;
  const tradeInput = solInputAmount === null ? 0n : BigInt(solInputAmount);
  const remainder = total - tradeInput - BigInt(settlement.feeLamports);
  return { totalWalletOutflowLamports: String(total), accountFundingLamports: String(remainder > 0n ? remainder : 0n) };
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value).slice(0, 400); } catch { return "Unknown simulation error"; }
}

function friendlySwapFailure(router: string, error: string, logs: string[] = []): string {
  const evidence = `${error} ${logs.join(" ")}`;
  if (router.toLowerCase() === "okx" && (/MinReturnNotReached/iu.test(evidence) || /Custom[^0-9]*6010/iu.test(evidence))) {
    return "The OKX route could not meet the approved minimum output after market conditions changed. The swap did not settle; a broadcast transaction may still incur its Solana network fee.";
  }
  return error;
}

export function resolveSwapReceiptStatus(
  routerStatus: "Success" | "Failed",
  code: number | null,
  signature: string | null,
  verification: SignatureVerification | null,
): {
  status: MissionExecutionReceipt["status"];
  conflictCode: "ROUTER_FAILED_RPC_CONFIRMED" | "ROUTER_SUCCESS_RPC_FAILED" | null;
} {
  if (verification?.state === "confirmed" || verification?.state === "finalized") {
    return {
      status: "confirmed",
      conflictCode: routerStatus === "Failed" ? "ROUTER_FAILED_RPC_CONFIRMED" : null,
    };
  }
  if (verification?.state === "failed") {
    return {
      status: "failed",
      conflictCode: routerStatus === "Success" ? "ROUTER_SUCCESS_RPC_FAILED" : null,
    };
  }
  if (routerStatus === "Failed") return { status: "failed", conflictCode: null };
  if (routerStatus === "Success" && code === 0 && signature !== null) return { status: "unknown", conflictCode: null };
  return { status: "failed", conflictCode: null };
}
