// @ts-nocheck
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { UnifiedPortfolioSnapshotSchema } from "@silfable/contracts";

import { deriveVerifiedCostBasis } from "./cost-basis.js";

const WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

test("derives FIFO realized and unrealized PnL only from finalized USDC settlements", () => {
  const snapshot = UnifiedPortfolioSnapshotSchema.parse({
    sessionId: randomUUID(),
    walletScope: "solana",
    walletAddress: WALLET,
    chains: [{
      family: "solana",
      chainKey: "solana",
      chainId: "solana-mainnet",
      chainName: "Solana Mainnet",
      walletAddress: WALLET,
      blockReference: "100",
      nativeSymbol: "SOL",
      nativeAmountRaw: "1000000000",
      nativeUiAmount: "1",
      nativeUsdPrice: 100,
      nativeUsdValue: 100,
      totalUsd: 103,
      valuationStatus: "complete",
      valuationSource: "jupiter-price",
      priceVerifiedAt: "2026-07-30T01:03:00.000Z",
      explorerBaseUrl: "https://explorer.solana.com",
      assets: [{
        assetId: TOKEN,
        symbol: "JUP",
        amountRaw: "1500000",
        decimals: 6,
        uiAmount: "1.5",
        usdPrice: 2,
        usdValue: 3,
        valuationSource: "jupiter-price",
        priceVerifiedAt: "2026-07-30T01:03:00.000Z",
      }],
      verifiedAt: "2026-07-30T01:03:00.000Z",
    }],
    totalUsd: 103,
    activity: [
      {
        id: "buy",
        venue: "jupiter",
        kind: "swap",
        family: "solana",
        chainKey: "solana",
        walletAddress: WALLET,
        status: "finalized",
        transactionId: "buy-signature",
        inputAssetId: USDC,
        inputAmountRaw: "2000000",
        outputAssetId: TOKEN,
        expectedOutputRaw: "2000000",
        actualOutputRaw: "2000000",
        networkFeeRaw: "5000",
        accountFundingRaw: "0",
        totalWalletOutflowRaw: null,
        actualSlippageBps: 0,
        blockReference: "98",
        explorerUrl: null,
        details: [],
        occurredAt: "2026-07-30T01:01:00.000Z",
        source: "encrypted-session",
      },
      {
        id: "sell",
        venue: "jupiter",
        kind: "swap",
        family: "solana",
        chainKey: "solana",
        walletAddress: WALLET,
        status: "finalized",
        transactionId: "sell-signature",
        inputAssetId: TOKEN,
        inputAmountRaw: "500000",
        outputAssetId: USDC,
        expectedOutputRaw: "750000",
        actualOutputRaw: "750000",
        networkFeeRaw: "5000",
        accountFundingRaw: "0",
        totalWalletOutflowRaw: null,
        actualSlippageBps: 0,
        blockReference: "99",
        explorerUrl: null,
        details: [],
        occurredAt: "2026-07-30T01:02:00.000Z",
        source: "encrypted-session",
      },
    ],
    verifiedAt: "2026-07-30T01:03:00.000Z",
  });

  const result = deriveVerifiedCostBasis(snapshot);
  assert.equal(result.status, "verified");
  assert.equal(result.realizedPnlUsd, 0.25);
  assert.equal(result.unrealizedPnlUsd, 1.5);
  assert.equal(result.assets[0]?.coveredQuantityRaw, "1500000");
  assert.equal(result.assets[0]?.remainingCostBasisUsd, 1.5);
  assert.equal(result.lots[0]?.remainingRaw, "1500000");
});

test("does not manufacture PnL for non-USDC or incomplete activity", () => {
  const snapshot = UnifiedPortfolioSnapshotSchema.parse({
    sessionId: randomUUID(),
    walletScope: "solana",
    walletAddress: WALLET,
    chains: [],
    totalUsd: null,
    activity: [{
      id: "unsupported",
      venue: "pumpfun",
      kind: "token-launch",
      family: "solana",
      chainKey: "solana",
      walletAddress: WALLET,
      status: "finalized",
      transactionId: "launch-signature",
      inputAssetId: "SOL",
      inputAmountRaw: "1000",
      outputAssetId: TOKEN,
      expectedOutputRaw: null,
      actualOutputRaw: null,
      networkFeeRaw: "5000",
      accountFundingRaw: "0",
      totalWalletOutflowRaw: "6000",
      actualSlippageBps: null,
      blockReference: "99",
      explorerUrl: null,
      details: [],
      occurredAt: "2026-07-30T01:02:00.000Z",
      source: "encrypted-session",
    }],
    verifiedAt: "2026-07-30T01:03:00.000Z",
  });

  const result = deriveVerifiedCostBasis(snapshot);
  assert.equal(result.status, "unavailable");
  assert.equal(result.realizedPnlUsd, null);
  assert.equal(result.unrealizedPnlUsd, null);
  assert.equal(result.excludedActivityCount, 1);
});
