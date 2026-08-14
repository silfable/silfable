import type { RuntimeDatabase } from "../storage/database.js";
import { evaluateProbabilisticTokenRisk, type TokenRiskEvaluationInput } from "./ai-scorer.js";

export class PumpWatchlistService {
  readonly #db: RuntimeDatabase;

  constructor(db: RuntimeDatabase) {
    this.#db = db;
  }

  blockCreator(address: string): void {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(address)) throw new Error("Invalid creator address format");
    this.#db.blockCreator(address);
  }

  unblockCreator(address: string): void {
    this.#db.unblockCreator(address);
  }

  listBlockedCreators(): string[] {
    return this.#db.listBlockedCreators();
  }

  isCreatorBlocked(address: string): boolean {
    return this.#db.isCreatorBlocked(address);
  }

  ignoreMint(mint: string): void {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(mint)) throw new Error("Invalid mint address format");
    this.#db.ignoreMint(mint);
  }

  unignoreMint(mint: string): void {
    this.#db.unignoreMint(mint);
  }

  listIgnoredMints(): string[] {
    return this.#db.listIgnoredMints();
  }

  isMintIgnored(mint: string): boolean {
    return this.#db.isMintIgnored(mint);
  }

  addCandidateToWatchlist(input: TokenRiskEvaluationInput): void {
    const risk = evaluateProbabilisticTokenRisk({
      ...input,
      isCreatorBlocked: input.creatorAddress ? this.isCreatorBlocked(input.creatorAddress) : false,
    });
    this.#db.addToWatchlist(input.mint, risk.score, JSON.stringify({ grade: risk.grade, explanations: risk.explanations }));
  }

  removeFromWatchlist(mint: string): void {
    this.#db.removeFromWatchlist(mint);
  }

  getWatchlist() {
    return this.#db.listWatchlist().map((item) => {
      let parsed = { grade: "Unknown", explanations: [] };
      try {
        parsed = JSON.parse(item.riskExplanation);
      } catch {
        // Fallback
      }
      return {
        mintAddress: item.mintAddress,
        addedAt: item.addedAt,
        riskScore: item.riskScore,
        grade: parsed.grade,
        explanations: parsed.explanations,
      };
    });
  }
}
