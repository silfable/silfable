import { EventEmitter } from "node:events";

import type { ExitTriggerEvent, PositionStrategyManager } from "./strategy-manager.js";
import type { TransactionSettingsService } from "../mission/transaction-settings.js";
import type { PumpMainnetRpc } from "../pump/rpc.js";
import type { EncryptedPumpReceiptService } from "../pump/receipt-store.js";
import type { PumpRiskLedgerService } from "../pump/risk-ledger.js";
import type { PumpRiskSettingsService } from "../pump/risk-settings.js";
import type { LocalEncryptedKeystore } from "../storage/keystore.js";
import type { EncryptedFullAccessGrantService } from "../security/full-access-grants.js";
import type { WalletOnboardingService } from "../wallet/onboarding.js";

export type AutonomousExecutorDependencies = {
  strategyManager: PositionStrategyManager;
  pumpRpc: PumpMainnetRpc;
  transactionSettings: TransactionSettingsService;
  pumpRiskSettings: PumpRiskSettingsService;
  pumpRiskLedger: PumpRiskLedgerService;
  keystore: LocalEncryptedKeystore;
  receiptStore: EncryptedPumpReceiptService;
  wallets: WalletOnboardingService;
  fullAccessGrants?: EncryptedFullAccessGrantService;
};

/**
 * Autonomous Execution Service for Full Access and Position Triggers.
 */
export class AutonomousExecutorService extends EventEmitter {
  readonly #dependencies: AutonomousExecutorDependencies;

  constructor(dependencies: AutonomousExecutorDependencies) {
    super();
    this.#dependencies = dependencies;
  }

  #isVaultLocked(): boolean {
    try {
      if (!this.#dependencies.keystore) return true;
      return Boolean(this.#dependencies.keystore.isLocked());
    } catch {
      return true;
    }
  }

  async #hasActiveGrant(sessionId?: string): Promise<boolean> {
    if (!sessionId || !this.#dependencies.fullAccessGrants) {
      // A missing grant service or session is never authority to sign.  The
      // previous fallback made a vault-unlocked process look autonomous.
      return false;
    }
    try {
      const activeGrant = await this.#dependencies.fullAccessGrants.activeForSession(sessionId);
      return Boolean(activeGrant && activeGrant.status === "ACTIVE");
    } catch {
      return false;
    }
  }

  async executeProposal(proposal: { id: string; strategyId: string; reason: string; sessionId?: string }): Promise<{ proposalId: string; status: string }> {
    const hasGrant = await this.#hasActiveGrant(proposal.sessionId);
    if (this.#isVaultLocked() || !hasGrant) {
      const error = new Error(
        "Autonomous execution is disabled. A trigger may create a reviewable proposal only; it cannot close a position, sign, or broadcast.",
      );
      this.emit("execution_error", { proposalId: proposal.id, error: error.message });
      throw error;
    }

    try {
      // Do not report a fake execution while dispatchers are not bound to a
      // versioned execution grant and immutable job digest.
      const result = { proposalId: proposal.id, status: "REVIEW_REQUIRED" };
      this.emit("proposal_requires_review", { proposalId: proposal.id, strategyId: proposal.strategyId });
      return result;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit("execution_error", { proposalId: proposal.id, error: error.message });
      throw error;
    }
  }

  async executeTrigger(event: ExitTriggerEvent & { sessionId?: string }): Promise<{ positionId: string; status: string }> {
    const hasGrant = await this.#hasActiveGrant(event.sessionId);
    if (this.#isVaultLocked() || !hasGrant) {
      const error = new Error(
        "Autonomous execution is disabled. A trigger may create a reviewable proposal only; it cannot close a position, sign, or broadcast.",
      );
      this.emit("execution_error", { positionId: event.positionId, error: error.message });
      throw error;
    }

    try {
      // Closing the position would be an irreversible state transition without
      // a signed transaction. Keep the trigger reviewable until a venue-specific
      // dispatcher supplies the immutable job and receipt flow.
      const result = { positionId: event.positionId, status: "REVIEW_REQUIRED" };
      this.emit("execution_requires_review", { positionId: event.positionId, reason: event.reason, amount: event.amount });
      return result;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit("execution_error", { positionId: event.positionId, error: error.message });
      throw error;
    }
  }
}

