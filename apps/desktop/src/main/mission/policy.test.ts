import assert from "node:assert/strict";
import test from "node:test";

import type { MainnetReadService } from "../integrations/read-only.js";
import { MissionPolicyService } from "./policy.js";

const WALLET = "11111111111111111111111111111111";
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PUMP = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";

test("mission policy produces a non-executable review artifact only when every deterministic check passes", async () => {
  const reads = {
    portfolio: async () => ({ address: WALLET, slot: 1, solBalance: "1.5", solUsdPrice: 150, totalUsd: 225, assets: [], verifiedAt: new Date().toISOString() }),
    swapQuote: async () => ({ inputMint: SOL, outputMint: USDC, inAmount: "100000000", outAmount: "15000000", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true as const, verifiedAt: new Date().toISOString() }),
  } as unknown as MainnetReadService;
  const preview = await new MissionPolicyService(reads).preview({
    goal: "Preview selling 0.1 SOL for USDC",
    walletAddress: WALLET,
    inputMint: SOL,
    outputMint: USDC,
    inputAmount: "100000000",
    maxSlippageBps: 100,
    deadlineAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    stopConditions: ["Stop if any policy check fails"],
  });
  assert.equal(preview.status, "ready-for-review");
  assert.equal(preview.executionAllowed, false);
  assert.equal(preview.checks.every((check) => check.status === "pass"), true);
  assert.equal(preview.quote?.quoteOnly, true);
});

test("mission policy blocks insufficient balance and excessive slippage", async () => {
  const reads = {
    portfolio: async () => ({ address: WALLET, slot: 1, solBalance: "0.01", solUsdPrice: 150, totalUsd: 1.5, assets: [], verifiedAt: new Date().toISOString() }),
    swapQuote: async () => ({ inputMint: SOL, outputMint: USDC, inAmount: "100000000", outAmount: "15000000", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true as const, verifiedAt: new Date().toISOString() }),
  } as unknown as MainnetReadService;
  const preview = await new MissionPolicyService(reads).preview({
    goal: "Unsafe draft",
    walletAddress: WALLET,
    inputMint: SOL,
    outputMint: USDC,
    inputAmount: "100000000",
    maxSlippageBps: 500,
    deadlineAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    stopConditions: ["Stop on failure"],
  });
  assert.equal(preview.status, "blocked");
  assert.equal(preview.executionAllowed, false);
  assert.equal(preview.checks.find((check) => check.code === "balance_sufficient")?.status, "fail");
  assert.equal(preview.checks.find((check) => check.code === "slippage_within_limit")?.status, "fail");
});

test("transaction maximum slippage blocks a wider AI or session proposal", async () => {
  const reads = {
    portfolio: async () => ({ address: WALLET, slot: 1, solBalance: "1.5", solUsdPrice: 150, totalUsd: 225, assets: [], verifiedAt: new Date().toISOString() }),
    swapQuote: async () => ({ inputMint: SOL, outputMint: USDC, inAmount: "100000000", outAmount: "15000000", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true as const, verifiedAt: new Date().toISOString() }),
  } as unknown as MainnetReadService;
  const preview = await new MissionPolicyService(reads, { get: () => ({ maxSlippageBps: 50 }) }).preview({
    goal: "Do not widen the configured maximum", walletAddress: WALLET, inputMint: SOL, outputMint: USDC,
    inputAmount: "100000000", maxSlippageBps: 51, deadlineAt: new Date(Date.now() + 60 * 60_000).toISOString(), stopConditions: ["Stop on policy failure"],
  });
  assert.equal(preview.status, "blocked");
  assert.equal(preview.checks.find((check) => check.code === "slippage_within_limit")?.status, "fail");
  assert.match(preview.checks.find((check) => check.code === "slippage_within_limit")?.message ?? "", /configured maximum of 50 bps/u);
});

test("limit-order policy creates a persisted preview without execution authority", async () => {
  const reads = {
    portfolio: async () => ({ address: WALLET, slot: 1, solBalance: "1.5", solUsdPrice: 150, totalUsd: 225, assets: [], verifiedAt: new Date().toISOString() }),
    prices: async () => new Map([[SOL, { usdPrice: 150, createdAt: null, blockId: 1 }]]),
  } as unknown as MainnetReadService;
  const preview = await new MissionPolicyService(reads).limitOrderPreview({
    goal: "Sell 0.1 SOL when SOL trades above $200", walletAddress: WALLET, inputMint: SOL, outputMint: USDC,
    inputAmount: "100000000", triggerMint: SOL, triggerCondition: "above", triggerPriceUsd: 200,
    maxSlippageBps: 100, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
  });
  assert.equal(preview.status, "ready-for-review");
  assert.equal(preview.executionAllowed, false);
  assert.equal(preview.lifecycle, "preview-only");
  assert.equal(preview.estimatedInputValueUsd, 15);
  assert.equal(preview.checks.every((check) => check.status === "pass"), true);
});

test("limit-order policy blocks sub-minimum deposits and unsafe slippage", async () => {
  const reads = {
    portfolio: async () => ({ address: WALLET, slot: 1, solBalance: "1.5", solUsdPrice: 150, totalUsd: 225, assets: [], verifiedAt: new Date().toISOString() }),
    prices: async () => new Map([[SOL, { usdPrice: 150, createdAt: null, blockId: 1 }]]),
  } as unknown as MainnetReadService;
  const preview = await new MissionPolicyService(reads).limitOrderPreview({
    goal: "Invalid small order", walletAddress: WALLET, inputMint: SOL, outputMint: USDC,
    inputAmount: "1000000", triggerMint: SOL, triggerCondition: "below", triggerPriceUsd: 100,
    maxSlippageBps: 900, expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  assert.equal(preview.status, "blocked");
  assert.equal(preview.checks.find((check) => check.code === "minimum_order_value")?.status, "fail");
  assert.equal(preview.checks.find((check) => check.code === "slippage_within_limit")?.status, "fail");
});

test("Pump trade policy creates a proposal-only contract from verified exact-mint evidence", async () => {
  const reads = {
    portfolio: async () => ({ address: WALLET, slot: 1, solBalance: "1.5", solUsdPrice: 150, totalUsd: 225, assets: [], verifiedAt: new Date().toISOString() }),
    pumpTokenAnalysis: async () => pumpEvidence({ venue: "pumpswap-migrated", concentration: 42, base: "900000000", quote: "4000000000" }),
    swapQuote: async () => ({ inputMint: SOL, outputMint: PUMP, inAmount: "1000000", outAmount: "12000000", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true as const, verifiedAt: new Date().toISOString() }),
  } as unknown as MainnetReadService;
  const preview = await new MissionPolicyService(reads).pumpTradePreview({
    goal: "Buy an explicitly selected Pump token", walletAddress: WALLET, side: "buy", tokenMint: PUMP,
    inputAmount: "1000000", maxSolExposureLamports: "1500000", minimumOutputAmount: "11000000", maxSlippageBps: 100,
    deadlineAt: new Date(Date.now() + 30 * 60_000).toISOString(), stopConditions: ["Stop if the quote changes"],
  });
  assert.equal(preview.status, "ready-for-review");
  assert.equal(preview.lifecycle, "proposal-only");
  assert.equal(preview.executionAllowed, false);
  assert.equal(preview.venue, "pumpswap-migrated");
  assert.equal(preview.checks.every((item) => item.status === "pass"), true);
});

test("Pump trade policy blocks unsafe authorities, concentration, exposure, and output", async () => {
  const reads = {
    portfolio: async () => ({ address: WALLET, slot: 1, solBalance: "1.5", solUsdPrice: 150, totalUsd: 225, assets: [], verifiedAt: new Date().toISOString() }),
    pumpTokenAnalysis: async () => ({ ...pumpEvidence({ venue: "bonding-curve-active", concentration: 96, base: null, quote: null }), mintAuthority: WALLET }),
    swapQuote: async () => ({ inputMint: SOL, outputMint: PUMP, inAmount: "1000000", outAmount: "100", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true as const, verifiedAt: new Date().toISOString() }),
  } as unknown as MainnetReadService;
  const preview = await new MissionPolicyService(reads).pumpTradePreview({
    goal: "Unsafe Pump proposal", walletAddress: WALLET, side: "buy", tokenMint: PUMP,
    inputAmount: "1000000", maxSolExposureLamports: "500000", minimumOutputAmount: "1000", maxSlippageBps: 100,
    deadlineAt: new Date(Date.now() + 30 * 60_000).toISOString(), stopConditions: ["Stop on risk"],
  });
  assert.equal(preview.status, "blocked");
  for (const code of ["sol_exposure_within_limit", "token_authorities_safe", "concentration_within_limit", "minimum_output_valid"] as const) {
    assert.equal(preview.checks.find((item) => item.code === code)?.status, "fail");
  }
});

function pumpEvidence(input: { venue: "bonding-curve-active" | "pumpswap-migrated"; concentration: number; base: string | null; quote: string | null }) {
  return {
    mint: PUMP, programId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" as const, pumpSwapProgramId: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA" as const,
    bondingCurveAddress: WALLET, pumpSwapPoolAddress: WALLET, venue: input.venue, bondingCurveExists: true, accountVerified: true,
    pumpSwapPoolVerified: input.venue === "pumpswap-migrated", complete: input.venue === "pumpswap-migrated", virtualTokenReserves: "1000", virtualQuoteReserves: "1000",
    realTokenReserves: input.venue === "bonding-curve-active" ? "1000" : "0", realQuoteReserves: "1000", tokenTotalSupply: "1000000",
    tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", decimals: 6, mintSupply: "1000000", mintAuthority: null, freezeAuthority: null,
    top10ConcentrationPercent: input.concentration, poolBaseTokenAccount: input.base === null ? null : WALLET, poolQuoteTokenAccount: input.quote === null ? null : WALLET,
    poolBaseReserves: input.base, poolQuoteReserves: input.quote, pumpSwapVirtualQuoteReserves: input.quote === null ? null : "0", pumpSwapEffectiveQuoteReserves: input.quote,
    slot: 123, warnings: [], verifiedAt: new Date().toISOString(),
  };
}
