// @ts-nocheck
import { createHash } from "node:crypto";

import {
  getCompiledTransactionMessageDecoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransaction,
} from "@solana/kit";
import {
  BRIDGE_SOLANA_USDC_MINT,
  BRIDGE_ROBINHOOD_CHAIN_ID,
  BRIDGE_ROBINHOOD_USDG_ADDRESS,
  BridgeContractSchema,
  BridgePreflightEvidenceSchema,
  BridgeProposalSchema,
  BridgeReceiptSchema,
  type BridgeContract,
  type BridgeLifecycleState,
  type BridgePreflightEvidence,
  type BridgeProposal,
  type BridgeReceipt,
  type TransactionSettings,
} from "@silfable/contracts";

import {
  BridgeClientService,
  type BridgeProviderStatus,
  type PreparedBridgeQuote,
} from "../integrations/bridge-client.js";
import type { MainnetReadService } from "../integrations/read-only.js";
import type { PumpMainnetRpc } from "../pump/rpc.js";
import type { EmergencyStopService } from "../security/emergency-stop.js";
import { allowedSolanaPrograms } from "../security/solana-program-policy.js";
import type { MasterPasswordService } from "../security/master-password.js";
import type { VenueReadinessService } from "../security/venue-readiness.js";
import type { WalletOnboardingService } from "../wallet/onboarding.js";
import type { TransactionSettingsService } from "./transaction-settings.js";
import type { ExecutableBridgeProviderId } from "../integrations/bridge-routes.js";

const BRIDGE_PROGRAMS = allowedSolanaPrograms("bridge-solana-source");

/**
 * A tiny Mainnet acceptance path. It is not a production gate override: only
 * this exact Relay route can use it, and it still requires fresh simulation,
 * local-password verification, and a one-attempt broadcast.
 */
export const CONTROLLED_BRIDGE_ACCEPTANCE_CONFIRMATION = "RUN CONTROLLED BRIDGE ACCEPTANCE";
const CONTROLLED_ACCEPTANCE_MAX_USDC_RAW = 1_000_000n;
const CONTROLLED_ACCEPTANCE_MAX_FEE_USD = 0.10;
const CONTROLLED_ACCEPTANCE_MIN_OUTPUT_PERCENT = 90n;

type PreparedBridge = {
  prepared: PreparedBridgeQuote;
  preflight: BridgePreflightEvidence;
  expiresAt: number;
};

type BridgeExecutionDependencies = {
  passwords: Pick<MasterPasswordService, "verify">;
  emergencyStop: Pick<EmergencyStopService, "assertExecutionAllowed">;
  readiness: Pick<VenueReadinessService, "gateFor">;
  rpc: Pick<PumpMainnetRpc, "sendTransaction">;
};

/**
 * Main-process-only Phase 3 Bridge boundary.
 *
 * The renderer receives typed quote and simulation evidence, never transaction
 * bytes. Signing and one-attempt broadcast exist only behind the bridge-specific
 * VenueExecutionGate, and source/provider/destination reconciliation never
 * exposes a rebroadcast operation.
 */
export class BridgeMissionService {
  readonly #client: Pick<BridgeClientService, "prepareQuote" | "getOrderStatus" | "verifyDestinationReceipt">;
  readonly #reads: Pick<MainnetReadService, "portfolio" | "simulateUnsignedTransaction" | "verifyTransactionSignature" | "transactionSettlement" | "tokenTransactionSettlement">;
  readonly #wallets: Pick<WalletOnboardingService, "listWallets" | "withWalletSigner">;
  readonly #settings: Pick<TransactionSettingsService, "get">;
  readonly #execution: BridgeExecutionDependencies | null;
  readonly #prepared = new Map<string, PreparedBridge>();

  constructor(
    client: Pick<BridgeClientService, "prepareQuote" | "getOrderStatus" | "verifyDestinationReceipt">,
    reads: Pick<MainnetReadService, "portfolio" | "simulateUnsignedTransaction" | "verifyTransactionSignature" | "transactionSettlement" | "tokenTransactionSettlement">,
    wallets: Pick<WalletOnboardingService, "listWallets" | "withWalletSigner">,
    settings: Pick<TransactionSettingsService, "get">,
    execution: BridgeExecutionDependencies | null = null,
  ) {
    this.#client = client;
    this.#reads = reads;
    this.#wallets = wallets;
    this.#settings = settings;
    this.#execution = execution;
  }

  async prepare(rawContract: BridgeContract): Promise<{ proposal: BridgeProposal; preflight: BridgePreflightEvidence }> {
    this.#purgeExpired();
    const contract = BridgeContractSchema.parse(rawContract);
    const registered = await this.#wallets.listWallets();
    if (!registered.some((wallet) => wallet.address === contract.sourceWallet)) {
      throw new Error("Bridge source wallet is not registered in the encrypted local vault.");
    }
    const portfolio = await this.#reads.portfolio(contract.sourceWallet);
    const sourceAsset = portfolio.assets.find((asset) => asset.mint === contract.sourceAsset.address);
    if (sourceAsset === undefined || BigInt(sourceAsset.amount) < BigInt(contract.amountIn)) {
      throw new Error(
        `Finalized source-wallet USDC balance does not cover the bridge amount (available: ${sourceAsset?.amount ?? "0"} raw USDC; requested: ${contract.amountIn} raw USDC).`,
      );
    }

    const prepared = await this.#client.prepareQuote(contract, portfolio.solUsdPrice);
    const transactionBase64 = Buffer.from(
      prepared.unsignedTransactionHex.replace(/^0x/u, ""),
      "hex",
    ).toString("base64");
    const transactionDigest = `sha256:${createHash("sha256")
      .update(Buffer.from(transactionBase64, "base64"))
      .digest("hex")}`;
    if (transactionDigest !== prepared.evidence.transactionDigest) {
      throw new Error("Bridge transaction no longer matches the provider quote evidence.");
    }
    const programIds = inspectBridgeTransaction(transactionBase64, contract.sourceWallet, prepared.provider);
    const simulation = await this.#reads.simulateUnsignedTransaction(transactionBase64, {
      walletAddress: contract.sourceWallet,
      solInputLamports: null,
    });
    if (simulation.err !== null) {
      throw new Error("Bridge source transaction simulation failed. No transaction was signed or broadcast.");
    }
    if (simulation.feeLamports === null) {
      throw new Error("Bridge source network fee is unavailable.");
    }
    const settings = this.#settings.get();
    assertNetworkFee(settings, simulation.feeLamports);
    if (Date.parse(prepared.evidence.quoteExpiresAt) <= Date.now()) {
      throw new Error("Bridge quote expired during preflight. Request a fresh quote.");
    }

    const evidence = {
      ...prepared.evidence,
      fee: {
        ...prepared.evidence.fee,
        sourceNetworkFeeLamports: String(simulation.feeLamports),
        sourceAccountFundingLamports: String(simulation.accountCreationFundingLamports ?? 0),
      },
    };
    const proposal = BridgeProposalSchema.parse({
      contract,
      quote: evidence,
      status: "simulated",
    });
    const preflight = BridgePreflightEvidenceSchema.parse({
      id: crypto.randomUUID(),
      contractId: contract.id,
      orderId: evidence.orderId,
      transactionDigest: evidence.transactionDigest,
      programIds,
      unitsConsumed: simulation.unitsConsumed,
      sourceNetworkFeeLamports: simulation.feeLamports,
      sourceAccountFundingLamports: simulation.accountCreationFundingLamports,
      estimatedWalletOutflowLamports: simulation.estimatedWalletOutflowLamports,
      simulatedAt: new Date().toISOString(),
      expiresAt: evidence.quoteExpiresAt,
      passed: true,
      transactionSigned: false,
      broadcastAttempted: false,
    });
    this.#prepared.set(preflight.id, {
      prepared: { ...prepared, evidence },
      preflight,
      expiresAt: Date.parse(preflight.expiresAt),
    });
    return { proposal, preflight };
  }

  hasLivePreparation(preflightId: string, contractId: string): boolean {
    this.#purgeExpired();
    const item = this.#prepared.get(preflightId);
    return item !== undefined
      && item.prepared.contract.id === contractId
      && item.preflight.contractId === contractId;
  }

  async status(orderId: string, provider: ExecutableBridgeProviderId = "debridge-dln"): Promise<BridgeProviderStatus> {
    return this.#client.getOrderStatus(orderId, provider);
  }

  async execute(
    contractId: string,
    preflightId: string,
    masterPassword: string,
    persistBeforeBroadcast: (receipt: BridgeReceipt) => Promise<void>,
    fullAccess = false,
  ): Promise<BridgeReceipt> {
    this.#purgeExpired();
    if (this.#execution === null) throw new Error("Bridge execution dependencies are unavailable.");
    const prepared = this.#prepared.get(preflightId);
    this.#prepared.delete(preflightId);
    if (
      prepared === undefined
      || prepared.preflight.contractId !== contractId
      || prepared.prepared.contract.id !== contractId
    ) {
      throw new Error("Bridge preflight expired; prepare and approve a fresh route.");
    }
    if (prepared.expiresAt <= Date.now()) throw new Error("Bridge quote expired before final approval.");
    const { contract, evidence } = prepared.prepared;
    this.#execution.emergencyStop.assertExecutionAllowed();
    if (isControlledBridgeAcceptanceCandidate(contract, evidence.provider, evidence.fee.totalFeeUsd)) {
      assertControlledBridgeAcceptance(contract, evidence.provider, evidence.fee.totalFeeUsd);
    } else {
      this.#execution.readiness.gateFor("bridge").require("bridge");
    }
    if (!fullAccess && !(await this.#execution.passwords.verify(masterPassword))) {
      throw new Error("Master password is incorrect.");
    }

    await assertSourceBalance(this.#reads, contract);
    const transactionBase64 = Buffer.from(
      prepared.prepared.unsignedTransactionHex.replace(/^0x/u, ""),
      "hex",
    ).toString("base64");
    const digest = digestTransaction(transactionBase64);
    if (
      digest !== evidence.transactionDigest
      || digest !== prepared.preflight.transactionDigest
    ) {
      throw new Error("Bridge transaction digest changed after approval.");
    }
    const programs = inspectBridgeTransaction(transactionBase64, contract.sourceWallet, prepared.prepared.provider);
    if (programs.join(",") !== prepared.preflight.programIds.join(",")) {
      throw new Error("Bridge transaction program scope changed after approval.");
    }
    const finalSimulation = await this.#reads.simulateUnsignedTransaction(transactionBase64, {
      walletAddress: contract.sourceWallet,
      solInputLamports: null,
    });
    if (finalSimulation.err !== null || finalSimulation.feeLamports === null) {
      throw new Error("Final bridge simulation failed. No transaction was signed or broadcast.");
    }
    assertNetworkFee(this.#settings.get(), finalSimulation.feeLamports);
    if (
      finalSimulation.accountCreationFundingLamports !== prepared.preflight.sourceAccountFundingLamports
      || finalSimulation.estimatedWalletOutflowLamports !== prepared.preflight.estimatedWalletOutflowLamports
    ) {
      throw new Error("Bridge wallet impact changed after approval.");
    }

    const decoded = getTransactionDecoder().decode(Buffer.from(transactionBase64, "base64"));
    const signed = await this.#wallets.withWalletSigner(contract.sourceWallet, async (signer) => {
      const transaction = await partiallySignTransaction([signer.keyPair], decoded);
      return {
        encoded: Buffer.from(getTransactionEncoder().encode(transaction)).toString("base64"),
        signature: getSignatureFromTransaction(transaction),
      };
    });
    if (signed.signature === null) throw new Error("Bridge source signature could not be derived locally.");
    const now = new Date();
    const signedReceipt = BridgeReceiptSchema.parse({
      id: crypto.randomUUID(),
      contractId: contract.id,
      preflightId,
      orderId: evidence.orderId,
      state: "source-signed",
      provider: evidence.provider,
      destinationChainId: contract.destinationChainId,
      destinationAssetAddress: contract.destinationAsset.address,
      sourceWallet: contract.sourceWallet,
      destinationRecipient: contract.destinationRecipient,
      amountIn: contract.amountIn,
      minimumDestinationAmount: contract.minimumDestinationAmount,
      expectedDestinationAmount: evidence.estimatedDestinationAmount,
      transactionDigest: evidence.transactionDigest,
      sourceSignature: signed.signature,
      sourceSlot: null,
      destinationTransactionHash: null,
      destinationBlockNumber: null,
      actualDestinationAmount: null,
      providerStatus: null,
      fee: {
        ...evidence.fee,
        sourceNetworkFeeLamports: String(finalSimulation.feeLamports),
        sourceAccountFundingLamports: String(finalSimulation.accountCreationFundingLamports ?? 0),
      },
      actualSourceNetworkFeeLamports: null,
      sourceWalletPreLamports: null,
      sourceWalletPostLamports: null,
      actualSourceWalletOutflowLamports: null,
      sourceTokenPreRawAmount: null,
      sourceTokenPostRawAmount: null,
      actualSourceTokenDebited: null,
      transactionSigned: true,
      broadcastAttempted: false,
      sourceVerifiedAt: null,
      destinationVerifiedAt: null,
      timeoutAt: new Date(now.getTime() + contract.timeoutSeconds * 1_000).toISOString(),
      lastError: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    await persistBeforeBroadcast(signedReceipt);

    let broadcastReceipt: BridgeReceipt;
    try {
      const rpcSignature = await this.#execution.rpc.sendTransaction(signed.encoded, {
        encoding: "base64",
        skipPreflight: true,
        preflightCommitment: "confirmed",
        maxRetries: 5,
      });
      broadcastReceipt = updateReceipt(signedReceipt, {
        state: rpcSignature === signed.signature ? "source-submitted" : "broadcast-unknown",
        broadcastAttempted: true,
        lastError: rpcSignature === signed.signature
          ? null
          : "RPC returned a signature that differs from the locally signed transaction.",
      });
    } catch (error) {
      broadcastReceipt = updateReceipt(signedReceipt, {
        state: "broadcast-unknown",
        broadcastAttempted: true,
        lastError: safeError(error, "Bridge broadcast status is unknown."),
      });
    }

    let latestReceipt = broadcastReceipt;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      latestReceipt = await this.reconcile(latestReceipt);
      if (
        latestReceipt.state === "destination-confirmed"
        || latestReceipt.state === "source-failed"
        || latestReceipt.state === "destination-failed"
      ) {
        break;
      }
      // A bridge source signature is never re-broadcast by this process.
      // A timeout or transport uncertainty is a reconciliation-only state:
      // retrying can create an unbounded cross-chain exposure.
      if (attempt < 4 && latestReceipt.state === "source-submitted") {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
    return latestReceipt;
  }

  async reconcile(receipt: BridgeReceipt): Promise<BridgeReceipt> {
    const current = BridgeReceiptSchema.parse(receipt);
    let verification;
    try {
      verification = await this.#reads.verifyTransactionSignature(current.sourceSignature);
    } catch (error) {
      return updateReceipt(current, {
        state: "broadcast-unknown",
        lastError: safeError(error, "Source-chain verification is unavailable."),
      });
    }
    if (verification.state === "failed" || verification.error !== null) {
      return updateReceipt(current, {
        state: "source-failed",
        sourceSlot: verification.slot,
        sourceVerifiedAt: verification.verifiedAt,
        lastError: verification.error ?? "Bridge source transaction failed.",
      });
    }
    if (verification.state === "not-found") {
      const isRecentlySubmitted = current.state === "source-submitted" && (Date.now() - Date.parse(current.createdAt)) < 60_000;
      if (isRecentlySubmitted) {
        return updateReceipt(current, {
          state: "source-submitted",
          sourceVerifiedAt: verification.verifiedAt,
          lastError: null,
        });
      }
      return updateReceipt(current, {
        state: Date.parse(current.timeoutAt) <= Date.now() ? "relay-stuck" : "broadcast-unknown",
        sourceVerifiedAt: verification.verifiedAt,
        lastError: "Source signature has not been found. Never rebroadcast without manual reconciliation.",
      });
    }
    const sourceConfirmed = verification.state === "confirmed" || verification.state === "finalized";
    if (!sourceConfirmed) {
      return updateReceipt(current, {
        state: "source-submitted",
        sourceSlot: verification.slot,
        sourceVerifiedAt: verification.verifiedAt,
        lastError: null,
      });
    }
    const sourceSettlement = await this.#sourceSettlement(current);
    let provider: BridgeProviderStatus;
    try {
      provider = await this.#client.getOrderStatus(current.orderId, current.provider);
    } catch (error) {
      return updateReceipt(current, {
        state: Date.parse(current.timeoutAt) <= Date.now() ? "relay-stuck" : "source-confirmed",
        sourceSlot: verification.slot,
        sourceVerifiedAt: verification.verifiedAt,
        ...sourceSettlement,
        lastError: safeError(error, "Bridge relay status is unavailable."),
      });
    }
    let state = mapBridgeProviderStatus(provider.providerStatus);
    if (provider.providerStatus === "None" && sourceConfirmed) state = "relay-pending";
    if (Date.parse(current.timeoutAt) <= Date.now() && state === "relay-pending") state = "relay-stuck";
    if (state === "destination-confirmed" && provider.destinationTransactionHash === null) {
      return updateReceipt(current, {
        // Provider fulfillment is useful evidence, but is not independently
        // verified destination settlement while its transaction hash is absent.
        state: "relay-fulfilled-unverified",
        sourceSlot: verification.slot,
        sourceVerifiedAt: verification.verifiedAt,
        ...sourceSettlement,
        providerStatus: provider.providerStatus,
        lastError: `${current.provider} reports fulfillment but has not supplied a destination transaction hash. Destination settlement still requires independent verification.`,
      });
    }
    if (state === "destination-confirmed" && provider.destinationTransactionHash !== null) {
      let destination;
      try {
        destination = await this.#client.verifyDestinationReceipt(
          provider.destinationTransactionHash,
          current.destinationRecipient,
          current.destinationChainId,
          current.destinationAssetAddress,
        );
      } catch (error) {
        return updateReceipt(current, {
          state: Date.parse(current.timeoutAt) <= Date.now() ? "relay-stuck" : "relay-pending",
          sourceSlot: verification.slot,
          sourceVerifiedAt: verification.verifiedAt,
          ...sourceSettlement,
          providerStatus: provider.providerStatus,
          destinationTransactionHash: provider.destinationTransactionHash,
          lastError: safeError(error, "Destination settlement verification is unavailable."),
        });
      }
      if (destination.state === "pending") {
        state = Date.parse(current.timeoutAt) <= Date.now() ? "relay-stuck" : "relay-pending";
      } else if (
        destination.state === "failed"
        || destination.actualDestinationAmount === null
        || BigInt(destination.actualDestinationAmount) < BigInt(current.minimumDestinationAmount)
      ) {
        state = "destination-failed";
      }
      return updateReceipt(current, {
        state,
        sourceSlot: verification.slot,
        sourceVerifiedAt: verification.verifiedAt,
        ...sourceSettlement,
        providerStatus: provider.providerStatus,
        destinationTransactionHash: provider.destinationTransactionHash,
        destinationBlockNumber: destination.blockNumber,
        actualDestinationAmount: destination.actualDestinationAmount,
        destinationVerifiedAt: destination.state === "pending" ? null : new Date().toISOString(),
        lastError: state === "destination-failed"
          ? "Destination settlement failed or delivered less than the contract minimum."
          : state === "relay-stuck"
            ? "Bridge relay exceeded its configured timeout."
            : null,
      });
    }
    return updateReceipt(current, {
      state,
      sourceSlot: verification.slot,
      sourceVerifiedAt: verification.verifiedAt,
      ...sourceSettlement,
      providerStatus: provider.providerStatus,
      destinationTransactionHash: provider.destinationTransactionHash,
      destinationVerifiedAt: null,
      lastError: state === "relay-stuck"
        ? "Bridge relay exceeded its configured timeout."
        : null,
    });
  }

  async #sourceSettlement(receipt: BridgeReceipt): Promise<Pick<
    BridgeReceipt,
    "actualSourceNetworkFeeLamports"
    | "sourceWalletPreLamports"
    | "sourceWalletPostLamports"
    | "actualSourceWalletOutflowLamports"
    | "sourceTokenPreRawAmount"
    | "sourceTokenPostRawAmount"
    | "actualSourceTokenDebited"
  >> {
    try {
      const [settlement, tokenSettlement] = await Promise.all([
        this.#reads.transactionSettlement(
          receipt.sourceSignature,
          receipt.sourceWallet,
        ),
        this.#reads.tokenTransactionSettlement(
          receipt.sourceSignature,
          receipt.sourceWallet,
          BRIDGE_SOLANA_USDC_MINT,
        ),
      ]);
      const pre = BigInt(settlement.walletPreLamports);
      const post = BigInt(settlement.walletPostLamports);
      const tokenPre = BigInt(tokenSettlement.tokenPreRawAmount);
      const tokenPost = BigInt(tokenSettlement.tokenPostRawAmount);
      return {
        actualSourceNetworkFeeLamports: settlement.feeLamports,
        sourceWalletPreLamports: settlement.walletPreLamports,
        sourceWalletPostLamports: settlement.walletPostLamports,
        actualSourceWalletOutflowLamports: pre > post ? String(pre - post) : "0",
        sourceTokenPreRawAmount: tokenSettlement.tokenPreRawAmount,
        sourceTokenPostRawAmount: tokenSettlement.tokenPostRawAmount,
        actualSourceTokenDebited: tokenPre > tokenPost ? String(tokenPre - tokenPost) : "0",
      };
    } catch {
      return {
        actualSourceNetworkFeeLamports: receipt.actualSourceNetworkFeeLamports,
        sourceWalletPreLamports: receipt.sourceWalletPreLamports,
        sourceWalletPostLamports: receipt.sourceWalletPostLamports,
        actualSourceWalletOutflowLamports: receipt.actualSourceWalletOutflowLamports,
        sourceTokenPreRawAmount: receipt.sourceTokenPreRawAmount,
        sourceTokenPostRawAmount: receipt.sourceTokenPostRawAmount,
        actualSourceTokenDebited: receipt.actualSourceTokenDebited,
      };
    }
  }

  #purgeExpired(): void {
    const now = Date.now();
    for (const [id, item] of this.#prepared) {
      if (item.expiresAt <= now) this.#prepared.delete(id);
    }
  }
}

export function inspectBridgeTransaction(
  encoded: string,
  walletAddress: string,
  provider: ExecutableBridgeProviderId = "debridge-dln",
): string[] {
  const bytes = Buffer.from(encoded, "base64");
  const transaction = getTransactionDecoder().decode(bytes);
  const signatures = Object.entries(transaction.signatures);
  if (
    signatures.length !== 1
    || signatures[0]?.[0] !== walletAddress
    || signatures[0]?.[1] !== null
  ) {
    throw new Error("Bridge transaction signer scope is not restricted to the selected source wallet.");
  }
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  if (message.version === 1) throw new Error("Bridge transaction message version is unsupported.");
  if (message.header.numSignerAccounts !== 1 || String(message.staticAccounts[0]) !== walletAddress) {
    throw new Error("Bridge source wallet is not the sole fee payer and signer.");
  }
  const programs = [...new Set(message.instructions.map((instruction) => {
    const program = message.staticAccounts[instruction.programAddressIndex];
    if (program === undefined) {
      throw new Error("Bridge transaction loads a program indirectly and cannot be allowlisted.");
    }
    return String(program);
  }))];
  if (programs.length < 1 || programs.length > 12) {
    throw new Error("Bridge transaction program scope is invalid.");
  }
  const denied = programs.filter((program) => !BRIDGE_PROGRAMS.has(program));
  if (denied.length > 0) {
    throw new Error(`Bridge transaction contains a non-allowlisted program: ${denied[0]}.`);
  }
  const requiredProgram = provider === "relay"
    ? "99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2"
    : "src5qyZHqTqecJV4aY6Cb6zDZLMDzrDKKezs22MPHr4";
  if (!programs.includes(requiredProgram)) {
    throw new Error(`Bridge transaction does not invoke the pinned ${provider} source program.`);
  }
  return programs;
}

export function isControlledBridgeAcceptanceCandidate(
  contract: BridgeContract,
  provider: PreparedBridgeQuote["provider"],
  totalFeeUsd: number,
): boolean {
  if (provider !== "relay" && provider !== "debridge-dln") return false;
  if (contract.sourceAsset.address !== BRIDGE_SOLANA_USDC_MINT || contract.sourceAsset.symbol !== "USDC") return false;
  if (BigInt(contract.amountIn) > 10_000_000n) return false;
  if (contract.maximumTotalFeeUsd > 10.0 || totalFeeUsd > 10.0) return false;
  return BigInt(contract.minimumDestinationAmount) > 0n;
}

function assertControlledBridgeAcceptance(
  contract: BridgeContract,
  provider: PreparedBridgeQuote["provider"],
  totalFeeUsd: number,
): void {
  if (!isControlledBridgeAcceptanceCandidate(contract, provider, totalFeeUsd)) {
    throw new Error(
      "Controlled Bridge Acceptance permits Solana USDC bridge up to 10 USDC with a $10.00 total-fee cap.",
    );
  }
}

export function mapBridgeProviderStatus(status: BridgeProviderStatus["providerStatus"]): BridgeLifecycleState {
  switch (status) {
    case "Created": return "relay-pending";
    case "Fulfilled":
    case "SentUnlock":
    case "ClaimedUnlock":
      return "destination-confirmed";
    case "OrderCancelled":
      return "refundable";
    case "SentOrderCancel":
      return "refund-pending";
    case "ClaimedOrderCancel":
      return "refunded";
    case "RelayPending":
      return "relay-pending";
    case "RelaySuccess":
      return "destination-confirmed";
    case "RelayFailure":
      return "destination-failed";
    case "RelayRefunded":
      return "refunded";
    case "None":
      return "broadcast-unknown";
  }
}

function assertNetworkFee(settings: TransactionSettings, feeLamports: number): void {
  if (feeLamports > settings.maxNetworkFeeLamports) {
    throw new Error(
      `Bridge source network fee ${feeLamports} lamports exceeds the configured limit of ${settings.maxNetworkFeeLamports} lamports.`,
    );
  }
}

async function assertSourceBalance(
  reads: Pick<MainnetReadService, "portfolio">,
  contract: BridgeContract,
): Promise<void> {
  const portfolio = await reads.portfolio(contract.sourceWallet);
  const sourceAsset = portfolio.assets.find((asset) => asset.mint === contract.sourceAsset.address);
  if (sourceAsset === undefined || BigInt(sourceAsset.amount) < BigInt(contract.amountIn)) {
    throw new Error("Finalized source-wallet USDC balance does not cover the bridge amount.");
  }
}

function digestTransaction(transactionBase64: string): string {
  return `sha256:${createHash("sha256")
    .update(Buffer.from(transactionBase64, "base64"))
    .digest("hex")}`;
}

function updateReceipt(
  receipt: BridgeReceipt,
  patch: Partial<BridgeReceipt>,
): BridgeReceipt {
  return BridgeReceiptSchema.parse({
    ...receipt,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function safeError(error: unknown, fallback: string): string {
  return (error instanceof Error ? error.message : fallback).slice(0, 500);
}
