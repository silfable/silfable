import type { SessionService } from "../sessions/service.js";
import type { LimitOrderService } from "../mission/limit-order.js";
import type { MissionSimulationService } from "../mission/simulation.js";
import { writeSafeAuditLog } from "../telemetry/safe-audit-log.js";

export class ReconciliationService {
  readonly #sessions: SessionService;
  readonly #limitOrders: LimitOrderService;
  readonly #simulations: MissionSimulationService;

  constructor(sessions: SessionService, limitOrders: LimitOrderService, simulations: MissionSimulationService) {
    this.#sessions = sessions;
    this.#limitOrders = limitOrders;
    this.#simulations = simulations;
  }

  /**
   * Scans all stored session records for limit orders with status 'unknown',
   * attempts to verify their transaction signature on-chain, and updates the local state.
   */
  async reconcilePendingOrders(): Promise<number> {
    let reconciledCount = 0;
    try {
      const allSessions = await this.#sessions.list();
      for (const session of allSessions) {
        let changed = false;
        const messages = [...session.messages];
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          if (!msg) continue;
          if (msg.limitOrderExecution && msg.limitOrderExecution.status === "unknown") {
            try {
              msg.limitOrderExecution = await this.#limitOrders.verifyExecutionReceipt(msg.limitOrderExecution);
              changed = true;
              reconciledCount++;
            } catch { /* stay unknown */ }
          }
          if (msg.limitOrderCancelReceipt && msg.limitOrderCancelReceipt.status === "unknown") {
            try {
              msg.limitOrderCancelReceipt = await this.#limitOrders.verifyCancelReceipt(msg.limitOrderCancelReceipt);
              changed = true;
              reconciledCount++;
            } catch { /* stay unknown */ }
          }
          // A prior broadcast may have timed out after a locally derived
          // signature was persisted. This is read-only recovery only: it
          // verifies that exact signature and cannot sign or rebroadcast.
          if (msg.missionExecution && msg.missionExecution.status === "unknown") {
            try {
              msg.missionExecution = await this.#simulations.verifyReceipt(msg.missionExecution);
              changed = true;
              reconciledCount++;
            } catch { /* stay unknown */ }
          }
        }
        if (changed) {
          await this.#sessions.upsert({ ...session, messages });
        }
      }
    } catch {
      // Do not print provider errors or decrypted session context. A later
      // unlocked session-list pass safely retries reconciliation.
      writeSafeAuditLog("reconciliation_failed", {
        operation: "session_receipt_reconciliation",
        outcome: "failure",
      });
    }
    return reconciledCount;
  }
}
