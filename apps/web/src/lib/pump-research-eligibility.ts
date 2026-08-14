import type { PumpResearchEligibility, PumpTokenIntelligence } from "@silfable/contracts";

const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

export const PUMP_RESEARCH_THRESHOLDS = {
  maxTop10ConcentrationPercent: 80,
  maxReferencePriceImpactBps: 1_500,
  maxEvidenceAgeMs: 2 * 60_000,
} as const;

export function evaluatePumpResearchEligibility(
  intelligence: PumpTokenIntelligence,
  now = new Date(),
): PumpResearchEligibility {
  const ageMs = now.getTime() - Date.parse(intelligence.verifiedAt);
  const canonicalVenue = (intelligence.venue === "bonding-curve-active" && intelligence.accountVerified)
    || (intelligence.venue === "pumpswap-migrated" && intelligence.pumpSwapPoolVerified);
  const authoritiesRevoked = intelligence.mintAuthority === null && intelligence.freezeAuthority === null;
  const concentration = intelligence.top10ConcentrationPercent;
  const referencePath = intelligence.metrics.referencePath;
  const priceImpacts = [referencePath.buyPriceImpactBps, referencePath.sellPriceImpactBps]
    .filter((value): value is number => value !== null);
  const priceImpactPassed = priceImpacts.length === 2
    && priceImpacts.every((value) => value <= PUMP_RESEARCH_THRESHOLDS.maxReferencePriceImpactBps);
  const checks: PumpResearchEligibility["checks"] = [
    check("canonical-venue", canonicalVenue, canonicalVenue
      ? "An active official Pump curve or canonical PumpSwap pool is verified."
      : "No active official Pump curve or canonical migrated PumpSwap pool is verified."),
    check("token-program", intelligence.tokenProgram !== null && TOKEN_PROGRAMS.has(intelligence.tokenProgram), intelligence.tokenProgram !== null && TOKEN_PROGRAMS.has(intelligence.tokenProgram)
      ? "The mint uses an allowlisted Solana token program."
      : "The mint token program is missing or not allowlisted."),
    check("authorities-revoked", authoritiesRevoked, authoritiesRevoked
      ? "Mint and freeze authorities are revoked."
      : "Mint or freeze authority remains active."),
    check("holder-concentration", concentration !== null && concentration <= PUMP_RESEARCH_THRESHOLDS.maxTop10ConcentrationPercent, concentration === null
      ? "Top-ten holder concentration is unavailable."
      : `Top-ten holder concentration is ${concentration.toFixed(2)}%; the maximum is ${PUMP_RESEARCH_THRESHOLDS.maxTop10ConcentrationPercent}%.`),
    check("quote-reserves", intelligence.metrics.quoteReservesUi !== null && intelligence.metrics.quoteReservesUi > 0, intelligence.metrics.quoteReservesUi !== null && intelligence.metrics.quoteReservesUi > 0
      ? "Finalized quote reserves are positive."
      : "Positive finalized quote reserves were not established."),
    check("reference-buy-path", positive(referencePath.buyInputQuoteAmount) && positive(referencePath.buyOutputTokenAmount), positive(referencePath.buyInputQuoteAmount) && positive(referencePath.buyOutputTokenAmount)
      ? "The reserve-only reference buy path has non-zero input and output."
      : "A non-zero reserve-only reference buy path is unavailable."),
    check("reference-sell-path", positive(referencePath.sellInputTokenAmount) && positive(referencePath.sellOutputQuoteAmount), positive(referencePath.sellInputTokenAmount) && positive(referencePath.sellOutputQuoteAmount)
      ? "The reserve-only sell-back path has non-zero input and output."
      : "A non-zero reserve-only sell-back path is unavailable."),
    check("price-impact", priceImpactPassed, priceImpactPassed
      ? `Reference buy and sell impacts are at most ${PUMP_RESEARCH_THRESHOLDS.maxReferencePriceImpactBps} bps.`
      : `Reference price impact is unavailable or exceeds ${PUMP_RESEARCH_THRESHOLDS.maxReferencePriceImpactBps} bps.`),
    check("freshness", Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= PUMP_RESEARCH_THRESHOLDS.maxEvidenceAgeMs, Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= PUMP_RESEARCH_THRESHOLDS.maxEvidenceAgeMs
      ? "Finalized evidence is at most two minutes old."
      : "Finalized evidence is stale or has an invalid timestamp."),
    check("no-execution-authority", true, "Research eligibility grants no signing or broadcast authority."),
  ];
  const passed = checks.every((item) => item.passed);
  return {
    status: passed ? "eligible" : "blocked",
    tokenMint: intelligence.mint,
    venue: intelligence.venue,
    evidenceSlot: intelligence.slot,
    thresholds: PUMP_RESEARCH_THRESHOLDS,
    checks,
    rankingAllowed: passed,
    executionAllowed: false,
    evaluatedAt: now.toISOString(),
  };
}

function check(id: PumpResearchEligibility["checks"][number]["id"], passed: boolean, message: string): PumpResearchEligibility["checks"][number] {
  return { id, passed, message };
}

function positive(value: string | null): boolean {
  return value !== null && /^[1-9]\d*$/u.test(value);
}
