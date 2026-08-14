import type { Hex } from "viem";

import type { RobinhoodExecutionReceipt } from "./robinhood-receipt-store.js";

type ReceiptStore = {
  list(): Promise<RobinhoodExecutionReceipt[]>;
  save(receipt: RobinhoodExecutionReceipt): Promise<void>;
};

type ReceiptReader = { getReceiptStatus(hash: Hex): Promise<"success" | "reverted" | null> };

/** Reconciles only previously broadcast hashes. It intentionally has no signing or broadcast capability. */
export class RobinhoodReceiptReconciliationService {
  readonly #store: ReceiptStore;
  constructor(store: ReceiptStore) { this.#store = store; }

  async reconcilePending(engine: ReceiptReader, now = new Date()): Promise<RobinhoodExecutionReceipt[]> {
    const reconciled: RobinhoodExecutionReceipt[] = [];
    for (const receipt of await this.#store.list()) {
      if (receipt.status !== "unknown") continue;
      const status = await engine.getReceiptStatus(receipt.transactionHash);
      if (status === null) continue;
      const next = { ...receipt, status: status === "success" ? "confirmed" as const : "reverted" as const, reconciledAt: now.toISOString() };
      await this.#store.save(next); reconciled.push(next);
    }
    return reconciled;
  }
}
