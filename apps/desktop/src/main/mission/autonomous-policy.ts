import type { MissionContractPreview } from "@silfable/contracts";

import type { AgentKeyService } from "../wallet/agent-keys.js";
import type { TokenAllowlistService } from "./token-allowlist.js";

export type AutonomousPolicyEvaluation = {
  allowed: boolean;
  reasons: string[];
  agentAddress: string | null;
  agentTxValidation: { allowed: boolean; reason?: string };
};

export class AutonomousPolicyService {
  readonly #agentKeys: AgentKeyService;
  readonly #allowlist: TokenAllowlistService;

  constructor(agentKeys: AgentKeyService, allowlist: TokenAllowlistService) {
    this.#agentKeys = agentKeys;
    this.#allowlist = allowlist;
  }

  async evaluateMissionForAutonomousExecution(
    preview: MissionContractPreview,
    inputAmountLamports: bigint
  ): Promise<AutonomousPolicyEvaluation> {
    const reasons: string[] = [];

    // 1. Check Agent Key Status
    if (!this.#agentKeys.isInitialized()) {
      const status = this.#agentKeys.getAgentStatus();
      reasons.push(
        status.revoked
          ? `Agent key is revoked (${status.revokeReason ?? "Kill switch activated"}).`
          : "Agent key is not initialized in active session."
      );
    }

    const agentAddress = this.#agentKeys.getAgentStatus().address;

    // 2. Validate proposed tx limits on agent key
    const agentTxValidation = this.#agentKeys.validateProposedTransaction(inputAmountLamports);
    if (!agentTxValidation.allowed) {
      reasons.push(agentTxValidation.reason ?? "Agent limit check failed.");
    }

    // 3. Check Token Allowlist for Input Mint
    const inputTokenCheck = await this.#allowlist.evaluateAutonomousEligibility(preview.inputMint);
    if (!inputTokenCheck.eligible) {
      reasons.push(`Input token (${preview.inputMint}): ${inputTokenCheck.reason}`);
    }

    // 4. Check Token Allowlist for Output Mint
    const outputTokenCheck = await this.#allowlist.evaluateAutonomousEligibility(preview.outputMint);
    if (!outputTokenCheck.eligible) {
      reasons.push(`Output token (${preview.outputMint}): ${outputTokenCheck.reason}`);
    }

    // 5. Ensure preview itself passed basic checks
    if (preview.status !== "ready-for-review") {
      reasons.push(`Mission contract preview status is '${preview.status}', not 'ready-for-review'.`);
    }

    const allowed = reasons.length === 0;

    return {
      allowed,
      reasons,
      agentAddress,
      agentTxValidation,
    };
  }
}
