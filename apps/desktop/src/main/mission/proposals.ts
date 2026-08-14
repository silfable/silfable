import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { MainnetReadService } from "../integrations/read-only.js";
import type { DurableBackgroundObservationService } from "../execution/background-loop.js";
import type { ExitTriggerEvent } from "../execution/strategy-manager.js";

export type MissionProposal = {
  id: string;
  walletAddress: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  triggerCondition: "price_goes_up_to" | "price_goes_down_to";
  triggerPriceUsd: number;
  maxSlippageBps: number;
  reason: "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING_STOP";
  status: "draft" | "approved" | "rejected";
  createdAt: string;
};

export class MissionProposalService extends EventEmitter {
  readonly #reads: MainnetReadService;
  readonly #drafts = new Map<string, MissionProposal>();

  constructor(reads: MainnetReadService, observation: DurableBackgroundObservationService) {
    super();
    this.#reads = reads;

    observation.on("auto_execution_triggered", (event: ExitTriggerEvent) => {
      this.#handleTrigger(event).catch((err) => this.emit("error", err));
    });
  }

  async #handleTrigger(event: ExitTriggerEvent): Promise<void> {
    const id = randomUUID();
    
    // Default config for guarded execution
    const proposal: MissionProposal = {
      id,
      walletAddress: "primary-wallet-placeholder", // To be wired to active wallet
      inputMint: event.mintAddress,
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
      inputAmount: event.amount,
      triggerCondition: event.reason === "STOP_LOSS" || event.reason === "TRAILING_STOP" ? "price_goes_down_to" : "price_goes_up_to",
      triggerPriceUsd: event.targetPrice,
      maxSlippageBps: 200, // Safe default slippage
      reason: event.reason,
      status: "draft",
      createdAt: new Date().toISOString(),
    };

    this.#drafts.set(id, proposal);
    this.emit("proposal_created", proposal);
  }

  getDrafts(): MissionProposal[] {
    return Array.from(this.#drafts.values()).filter(p => p.status === "draft");
  }

  approveProposal(id: string): MissionProposal | null {
    const proposal = this.#drafts.get(id);
    if (!proposal || proposal.status !== "draft") return null;
    proposal.status = "approved";
    this.emit("proposal_approved", proposal);
    return proposal;
  }

  rejectProposal(id: string): void {
    const proposal = this.#drafts.get(id);
    if (proposal && proposal.status === "draft") {
      proposal.status = "rejected";
      this.emit("proposal_rejected", proposal);
    }
  }
}
