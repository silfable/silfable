import {
  createKeyPairSignerFromPrivateKeyBytes,
  type KeyPairSigner,
} from "@solana/kit";
import { randomBytes } from "node:crypto";

export type AgentLimits = {
  maxAllocationLamports: bigint;
  maxSingleTxLamports: bigint;
  maxDrawdownBps: number; // e.g. 1000 = 10% drawdown
  maxTxPerHour: number;
};

export type AgentStatus = {
  active: boolean;
  address: string | null;
  revoked: boolean;
  revokeReason: string | null;
  limits: AgentLimits | null;
  stats: {
    totalTxCount: number;
    recentTxTimestamps: number[];
    cumulativePnlLamports: bigint;
    peakBalanceLamports: bigint;
    currentBalanceLamports: bigint;
  };
};

export class AgentKeyService {
  #signer: KeyPairSigner | null = null;
  #privateKeyBytes: Uint8Array | null = null;
  #revoked = false;
  #revokeReason: string | null = null;
  #limits: AgentLimits | null = null;

  #stats = {
    totalTxCount: 0,
    recentTxTimestamps: [] as number[],
    cumulativePnlLamports: 0n,
    peakBalanceLamports: 0n,
    currentBalanceLamports: 0n,
  };

  async initializeAgent(limits: AgentLimits, initialBalanceLamports: bigint = 0n): Promise<{ address: string; limits: AgentLimits }> {
    if (this.#revoked) {
      throw new Error(`Agent is revoked (${this.#revokeReason ?? "Emergency Halt"}). Clear agent session before re-initializing.`);
    }

    const secretKey = new Uint8Array(randomBytes(32));
    this.#privateKeyBytes = secretKey;
    this.#signer = await createKeyPairSignerFromPrivateKeyBytes(secretKey);
    this.#limits = { ...limits };
    this.#stats = {
      totalTxCount: 0,
      recentTxTimestamps: [],
      cumulativePnlLamports: 0n,
      peakBalanceLamports: initialBalanceLamports,
      currentBalanceLamports: initialBalanceLamports,
    };

    return {
      address: this.#signer.address,
      limits: this.#limits,
    };
  }

  isInitialized(): boolean {
    return this.#signer !== null && !this.#revoked;
  }

  getSigner(): KeyPairSigner {
    if (this.#revoked) {
      throw new Error(`Agent key is REVOKED: ${this.#revokeReason ?? "Kill switch activated"}`);
    }
    if (this.#signer === null) {
      throw new Error("Agent key is not initialized. Initialize agent session first.");
    }
    return this.#signer;
  }

  getAgentStatus(): AgentStatus {
    return {
      active: this.#signer !== null && !this.#revoked,
      address: this.#signer?.address ?? null,
      revoked: this.#revoked,
      revokeReason: this.#revokeReason,
      limits: this.#limits ? { ...this.#limits } : null,
      stats: {
        totalTxCount: this.#stats.totalTxCount,
        recentTxTimestamps: [...this.#stats.recentTxTimestamps],
        cumulativePnlLamports: this.#stats.cumulativePnlLamports,
        peakBalanceLamports: this.#stats.peakBalanceLamports,
        currentBalanceLamports: this.#stats.currentBalanceLamports,
      },
    };
  }

  revokeAgent(reason: string = "Manual Emergency Stop"): void {
    this.#revoked = true;
    this.#revokeReason = reason;
    if (this.#privateKeyBytes) {
      this.#privateKeyBytes.fill(0);
      this.#privateKeyBytes = null;
    }
    this.#signer = null;
  }

  validateProposedTransaction(amountLamports: bigint): { allowed: boolean; reason?: string } {
    if (this.#revoked || this.#signer === null) {
      return { allowed: false, reason: `Agent is not active (Revoked: ${this.#revoked})` };
    }
    if (this.#limits === null) {
      return { allowed: false, reason: "No agent limits set" };
    }

    if (amountLamports > this.#limits.maxSingleTxLamports) {
      return {
        allowed: false,
        reason: `Proposed tx amount (${amountLamports} lamports) exceeds max single transaction limit (${this.#limits.maxSingleTxLamports} lamports)`,
      };
    }

    const now = Date.now();
    const oneHourAgo = now - 3600_000;
    const recentTxs = this.#stats.recentTxTimestamps.filter((ts) => ts > oneHourAgo);
    if (recentTxs.length >= this.#limits.maxTxPerHour) {
      return {
        allowed: false,
        reason: `Transaction rate limit reached (${recentTxs.length}/${this.#limits.maxTxPerHour} per hour)`,
      };
    }

    return { allowed: true };
  }

  recordTransactionResult(amountLamports: bigint, netPnlLamports: bigint, currentBalanceLamports: bigint): void {
    if (!this.isInitialized() || this.#limits === null) return;

    const now = Date.now();
    this.#stats.totalTxCount += 1;
    const oneHourAgo = now - 3600_000;
    this.#stats.recentTxTimestamps = [...this.#stats.recentTxTimestamps.filter((ts) => ts > oneHourAgo), now];
    this.#stats.cumulativePnlLamports += netPnlLamports;
    this.#stats.currentBalanceLamports = currentBalanceLamports;

    if (currentBalanceLamports > this.#stats.peakBalanceLamports) {
      this.#stats.peakBalanceLamports = currentBalanceLamports;
    }

    // Check Drawdown
    if (this.#stats.peakBalanceLamports > 0n) {
      const drop = this.#stats.peakBalanceLamports - currentBalanceLamports;
      if (drop > 0n) {
        const dropBps = Number((drop * 10000n) / this.#stats.peakBalanceLamports);
        if (dropBps > this.#limits.maxDrawdownBps) {
          this.revokeAgent(`Automated Kill Switch: Drawdown reached ${dropBps / 100}% (Limit: ${this.#limits.maxDrawdownBps / 100}%)`);
        }
      }
    }
  }
}
