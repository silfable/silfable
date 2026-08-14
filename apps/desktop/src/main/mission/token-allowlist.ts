import type { MainnetReadService } from "../integrations/read-only.js";
import type { RuntimeDatabase } from "../storage/database.js";

export type AutonomousEligibilityResult = 
  | { eligible: true }
  | { eligible: false; reason: string };

export class TokenAllowlistService {
  readonly #db: RuntimeDatabase;
  readonly #reads: MainnetReadService;

  constructor(db: RuntimeDatabase, reads: MainnetReadService) {
    this.#db = db;
    this.#reads = reads;
  }

  /**
   * Retrieves the current user-defined allowlist of mint addresses.
   */
  getAllowlist(): string[] {
    const raw = this.#db.getSetting("autonomous_token_allowlist");
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fallback to empty
      }
    }
    return [];
  }

  /**
   * Updates the user-defined allowlist.
   */
  setAllowlist(mints: string[]): void {
    this.#db.setSetting("autonomous_token_allowlist", JSON.stringify(mints));
  }

  /**
   * Checks whether autonomous discovery (Degen Mode) is enabled.
   */
  isAutonomousDiscoveryEnabled(): boolean {
    return this.#db.getSetting("autonomous_discovery_enabled") === "true";
  }

  /**
   * Toggles autonomous discovery mode.
   */
  setAutonomousDiscoveryEnabled(enabled: boolean): void {
    this.#db.setSetting("autonomous_discovery_enabled", enabled ? "true" : "false");
  }

  /**
   * Evaluates whether a token is eligible for autonomous AI operations.
   * If token is not in explicit allowlist, but autonomous discovery is enabled,
   * performs dynamic risk evaluation.
   */
  async evaluateAutonomousEligibility(mint: string): Promise<AutonomousEligibilityResult> {
    const allowlist = this.getAllowlist();
    const isAllowlisted = allowlist.includes(mint);
    const discoveryEnabled = this.isAutonomousDiscoveryEnabled();

    if (!isAllowlisted && !discoveryEnabled) {
      return { eligible: false, reason: "Token is not in the autonomous allowlist and Autonomous Discovery is disabled." };
    }

    // Verify price / liquidity resolvability
    try {
      const prices = await this.#reads.prices([mint]);
      if (!prices.has(mint)) {
        // If discovery mode is enabled, token might be a brand new Pump.fun bonding curve token
        if (discoveryEnabled && !isAllowlisted) {
          // Perform basic Pump.fun format validation (base58 Solana address)
          if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
            return { eligible: false, reason: "Invalid token mint address format." };
          }
          return { eligible: true };
        }
        return { eligible: false, reason: "Token price is unresolvable or lacks liquidity." };
      }
    } catch (err) {
      if (!discoveryEnabled) {
        return { eligible: false, reason: "Failed to verify token liquidity." };
      }
    }

    return { eligible: true };
  }
}
