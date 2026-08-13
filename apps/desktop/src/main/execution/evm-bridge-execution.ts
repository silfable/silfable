// @ts-nocheck
import { randomUUID } from "node:crypto";
import type { Address, Hex } from "viem";

import { EvmBridgeReceiptSchema, type EvmBridgeReceipt } from "@silfable/contracts";
import type { EvmSignerService } from "../wallet/evm-signer.js";
import type { RelayEvmBridgeService } from "../integrations/relay-evm-bridge.js";
import type { EmergencyStopService } from "../security/emergency-stop.js";
import type { MasterPasswordService } from "../security/master-password.js";

type Engine = {
  assertExpectedChain(): Promise<number>;
  getBalance(address: Address): Promise<{ wei: bigint }>;
  getErc20Balance(token: Address, owner: Address): Promise<bigint>;
  simulateTransaction(input: { from: Address; to: Address; valueWei: bigint; data?: Hex }): Promise<{ gasLimit: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  getPendingNonce(address: Address): Promise<number>;
  sendRawTransaction(rawTx: Hex): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<{ status: "success" | "reverted" }>;
  getReceiptStatus(hash: Hex): Promise<"success" | "reverted" | null>;
};

type Store = { save(receipt: EvmBridgeReceipt): Promise<void>; get(id: string): Promise<EvmBridgeReceipt | null> };

/** Executes exactly one reviewed Relay EVM source step. */
export class EvmBridgeExecutionService {
  readonly #passwords: MasterPasswordService;
  readonly #emergencyStop: EmergencyStopService;
  readonly #preflights: RelayEvmBridgeService;
  readonly #receipts: Store;

  constructor(
    passwords: MasterPasswordService,
    emergencyStop: EmergencyStopService,
    preflights: RelayEvmBridgeService,
    receipts: Store,
  ) {
    this.#passwords = passwords;
    this.#emergencyStop = emergencyStop;
    this.#preflights = preflights;
    this.#receipts = receipts;
  }

  async execute(input: {
    preflightId: string;
    action: "approval" | "deposit";
    masterPassword: string;
    confirmation: "APPROVE BRIDGE TOKEN" | "EXECUTE EVM BRIDGE MAINNET";
    fullAccess?: boolean;
    engine: Engine;
    withSigner: <T>(operation: (signer: EvmSignerService) => Promise<T>) => Promise<T>;
  }): Promise<EvmBridgeReceipt> {
    const expected = input.action === "approval" ? "APPROVE BRIDGE TOKEN" : "EXECUTE EVM BRIDGE MAINNET";
    if (!input.fullAccess && input.confirmation !== expected) throw new Error("Exact EVM bridge Mainnet confirmation is required");
    this.#emergencyStop.assertExecutionAllowed();
    if (!input.fullAccess && !(await this.#passwords.verify(input.masterPassword))) throw new Error("Master password is incorrect");
    const prepared = this.#preflights.consume({ preflightId: input.preflightId, action: input.action });
    const wallet = prepared.contract.sourceWallet as Address;
    const transaction = prepared.transaction;
    if (await input.engine.assertExpectedChain() !== prepared.contract.sourceChainId) throw new Error("EVM bridge source chain changed after review");
    const fresh = await input.engine.simulateTransaction({ from: wallet, to: transaction.to, valueWei: transaction.valueWei, data: transaction.data });
    const maximumNetworkFeeWei = fresh.gasLimit * fresh.maxFeePerGas;
    const allowedMaximumBridgeFeeWei = (BigInt(prepared.evidence.maximumNetworkFeeWei) * 150n) / 100n;
    if (maximumNetworkFeeWei > allowedMaximumBridgeFeeWei) throw new Error("EVM bridge fee increased beyond the reviewed maximum; run a fresh preflight");
    const native = await input.engine.getBalance(wallet);
    if (native.wei < transaction.valueWei + maximumNetworkFeeWei) throw new Error("EVM wallet cannot cover bridge value and network fee");
    if (input.action === "deposit") {
      const tokenBalance = await input.engine.getErc20Balance(prepared.contract.sourceAssetAddress as Address, wallet);
      if (tokenBalance < BigInt(prepared.contract.amountIn)) throw new Error("EVM token balance no longer covers the bridge amount");
    }
    const nonce = await input.engine.getPendingNonce(wallet);
    const signed = await input.withSigner(async (signer) => await signer.signTransaction({
      to: transaction.to, value: transaction.valueWei, data: transaction.data, nonce,
      gasLimit: fresh.gasLimit, maxFeePerGas: fresh.maxFeePerGas,
      maxPriorityFeePerGas: fresh.maxPriorityFeePerGas, chainId: prepared.contract.sourceChainId,
    }));
    const sourceTransactionHash = await input.engine.sendRawTransaction(signed.rawTransaction);
    const now = new Date().toISOString();
    const pending = EvmBridgeReceiptSchema.parse({
      id: randomUUID(), contractId: prepared.contract.id, quoteId: prepared.quote.quoteId,
      preflightId: prepared.evidence.id, requestId: prepared.quote.requestId, provider: "relay",
      action: input.action, sourceChainKey: prepared.contract.sourceChainKey, sourceChainId: prepared.contract.sourceChainId,
      sourceAssetAddress: prepared.contract.sourceAssetAddress, sourceAssetSymbol: prepared.contract.sourceAssetSymbol,
      destinationChainId: prepared.contract.destination.chainId, destinationChainKey: prepared.contract.destination.chainKey,
      destinationAssetAddress: prepared.contract.destination.assetAddress, destinationAssetSymbol: prepared.contract.destination.assetSymbol,
      sourceWallet: prepared.contract.sourceWallet,
      destinationRecipient: prepared.contract.destination.recipient, amountIn: prepared.contract.amountIn,
      expectedDestinationAmount: prepared.quote.estimatedDestinationAmount,
      minimumDestinationAmount: prepared.quote.minimumDestinationAmount,
      sourceTransactionHash, destinationTransactionHash: null, status: "source-unknown",
      networkFeeWei: maximumNetworkFeeWei.toString(), broadcastAt: now, reconciledAt: now,
    });
    await this.#receipts.save(pending);
    try {
      const receipt = await input.engine.waitForReceipt(sourceTransactionHash);
      const settled = EvmBridgeReceiptSchema.parse({ ...pending, status: receipt.status === "success" ? "source-confirmed" : "source-reverted", reconciledAt: new Date().toISOString() });
      await this.#receipts.save(settled);
      return settled;
    } catch {
      return pending;
    }
  }
}

/**
 * Reconciliation is read-only. Relay success is not enough on its own: a
 * destination verifier must independently prove the destination transaction
 * and minimum received amount before the receipt becomes confirmed.
 */
export class EvmBridgeReconciliationService {
  readonly #receipts: Store;
  readonly #fetch: typeof fetch;
  readonly #apiUrl: string;

  constructor(receipts: Store, fetchImpl: typeof fetch = fetch, apiUrl = "https://api.relay.link") {
    this.#receipts = receipts;
    this.#fetch = fetchImpl;
    this.#apiUrl = apiUrl;
  }

  async reconcile(input: {
    receiptId: string;
    sourceEngine: Pick<Engine, "getReceiptStatus">;
    verifyDestination: (input: { receipt: EvmBridgeReceipt; transactionHash: string }) => Promise<boolean>;
  }): Promise<EvmBridgeReceipt> {
    const receipt = await this.#receipts.get(input.receiptId);
    if (receipt === null) throw new Error("EVM bridge receipt was not found");
    const source = await input.sourceEngine.getReceiptStatus(receipt.sourceTransactionHash as Hex);
    if (source === "reverted") return await this.#save({ ...receipt, status: "source-reverted" });
    if (source === null) return receipt;
    if (receipt.action === "approval") return await this.#save({ ...receipt, status: "source-confirmed" });
    const response = await this.#fetch(`${this.#apiUrl.replace(/\/$/u, "")}/intents/status/v3?requestId=${encodeURIComponent(receipt.requestId)}`);
    if (!response.ok) throw new Error(`Relay status request failed with HTTP ${response.status}`);
    const payload = await response.json() as { status?: unknown; txHashes?: unknown };
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
    if (status === "failure") return await this.#save({ ...receipt, status: "destination-failed" });
    if (status === "refunded" || status === "refund") return await this.#save({ ...receipt, status: "refunded" });
    if (status !== "success") return await this.#save({ ...receipt, status: "relay-pending" });
    const hashes = Array.isArray(payload.txHashes) ? payload.txHashes.filter((value): value is string => typeof value === "string") : [];
    if (hashes.length === 0) return await this.#save({ ...receipt, status: "relay-pending" });
    for (const transactionHash of [...hashes].reverse()) {
      try {
        if (await input.verifyDestination({ receipt, transactionHash })) {
          return await this.#save({ ...receipt, destinationTransactionHash: transactionHash, status: "destination-confirmed" });
        }
      } catch {
        // Relay can return source, approval, fill, and destination hashes in the
        // same list. A hash that belongs to another chain is not destination
        // evidence, so keep checking instead of trusting array order.
      }
    }
    throw new Error("Relay reported success but independent destination settlement verification did not pass");
  }

  async #save(raw: EvmBridgeReceipt): Promise<EvmBridgeReceipt> {
    const receipt = EvmBridgeReceiptSchema.parse({ ...raw, reconciledAt: new Date().toISOString() });
    await this.#receipts.save(receipt);
    return receipt;
  }
}
