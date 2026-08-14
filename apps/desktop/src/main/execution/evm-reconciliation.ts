import type { Hex } from "viem";

import { getEvmChain } from "../integrations/evm-chains.js";
import type { EvmExecutionReceipt } from "./evm-kyber-execution.js";

type ReceiptStore = {
  list(): Promise<EvmExecutionReceipt[]>;
  save(receipt: EvmExecutionReceipt): Promise<void>;
};

type EngineFactory = (input: { chainKey: EvmExecutionReceipt["chainKey"]; chainId: number }) => Promise<{
  getReceiptStatus(hash: Hex): Promise<"success" | "reverted" | null>;
}>;

/** Reconciles known hashes only. It has no signer and no broadcast method. */
export class EvmReceiptReconciliationService {
  readonly #store: ReceiptStore;

  constructor(store: ReceiptStore) {
    this.#store = store;
  }

  async reconcilePending(engineFor: EngineFactory, now = new Date()): Promise<EvmExecutionReceipt[]> {
    const reconciled: EvmExecutionReceipt[] = [];
    for (const receipt of await this.#store.list()) {
      if (receipt.status !== "unknown") continue;
      const chain = getEvmChain(receipt.chainKey);
      if (chain.chainId !== receipt.chainId) continue;
      const engine = await engineFor({ chainKey: receipt.chainKey, chainId: receipt.chainId });
      const status = await engine.getReceiptStatus(receipt.transactionHash);
      if (status === null) continue;
      const next: EvmExecutionReceipt = {
        ...receipt,
        status: status === "success" ? "confirmed" : "reverted",
        reconciledAt: now.toISOString(),
      };
      await this.#store.save(next);
      reconciled.push(next);
    }
    return reconciled;
  }
}
