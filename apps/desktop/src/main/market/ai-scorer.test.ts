import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProbabilisticTokenRisk } from "./ai-scorer.js";

test("ai-scorer correctly evaluates low-risk safe token", () => {
  const result = evaluateProbabilisticTokenRisk({
    mint: "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump",
    mintAuthorityRevoked: true,
    freezeAuthorityRevoked: true,
    top10HolderConcentrationPercent: 15,
    bondingCurveProgressPercent: 50,
    isMigratedToPumpSwap: false,
  });

  assert.equal(result.score, 0);
  assert.equal(result.grade, "Low Risk");
  assert.ok(result.explanations.some((e) => e.includes("Healthy distribution")));
});

test("ai-scorer assigns critical risk for unrevoked mint/freeze authority and blocked creator", () => {
  const result = evaluateProbabilisticTokenRisk({
    mint: "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump",
    mintAuthorityRevoked: false,
    freezeAuthorityRevoked: false,
    top10HolderConcentrationPercent: 60,
    bondingCurveProgressPercent: 10,
    isMigratedToPumpSwap: false,
    isCreatorBlocked: true,
  });

  assert.equal(result.score, 100);
  assert.equal(result.grade, "Critical Risk");
  assert.ok(result.explanations.some((e) => e.includes("blocked")));
});
