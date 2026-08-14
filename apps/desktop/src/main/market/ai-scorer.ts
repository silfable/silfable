export type TokenRiskEvaluationInput = {
  mint: string;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  top10HolderConcentrationPercent: number;
  bondingCurveProgressPercent: number;
  isMigratedToPumpSwap: boolean;
  creatorAddress?: string | null;
  isCreatorBlocked?: boolean;
};

export type TokenRiskScoringResult = {
  mint: string;
  score: number; // 0 (safest) to 100 (highest risk)
  grade: "Low Risk" | "Medium Risk" | "High Risk" | "Critical Risk";
  explanations: string[];
  evaluatedAt: string;
};

export function evaluateProbabilisticTokenRisk(input: TokenRiskEvaluationInput): TokenRiskScoringResult {
  let score = 0;
  const explanations: string[] = [];

  if (input.isCreatorBlocked) {
    score += 100;
    explanations.push("Creator address is explicitly blocked in local risk settings.");
  }

  if (!input.mintAuthorityRevoked) {
    score += 40;
    explanations.push("Mint authority is active (creator can mint arbitrary supply).");
  }

  if (!input.freezeAuthorityRevoked) {
    score += 40;
    explanations.push("Freeze authority is active (creator can freeze user token accounts).");
  }

  if (input.top10HolderConcentrationPercent > 50) {
    score += 30;
    explanations.push(`High concentration: Top 10 holders control ${input.top10HolderConcentrationPercent.toFixed(1)}% of total supply.`);
  } else if (input.top10HolderConcentrationPercent > 25) {
    score += 15;
    explanations.push(`Moderate concentration: Top 10 holders control ${input.top10HolderConcentrationPercent.toFixed(1)}% of total supply.`);
  } else {
    explanations.push(`Healthy distribution: Top 10 holders control ${input.top10HolderConcentrationPercent.toFixed(1)}% of total supply.`);
  }

  if (input.isMigratedToPumpSwap) {
    explanations.push("Token has completed bonding curve and migrated to PumpSwap AMM pool.");
  } else if (input.bondingCurveProgressPercent >= 90) {
    score += 5;
    explanations.push(`Near migration: Bonding curve progress is at ${input.bondingCurveProgressPercent.toFixed(1)}%.`);
  }

  const finalScore = Math.min(100, Math.max(0, score));
  let grade: TokenRiskScoringResult["grade"] = "Low Risk";
  if (finalScore >= 80) grade = "Critical Risk";
  else if (finalScore >= 50) grade = "High Risk";
  else if (finalScore >= 25) grade = "Medium Risk";

  return {
    mint: input.mint,
    score: finalScore,
    grade,
    explanations,
    evaluatedAt: new Date().toISOString(),
  };
}
