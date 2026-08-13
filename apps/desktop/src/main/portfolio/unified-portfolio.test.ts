// @ts-nocheck
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  SessionRecordSchema,
  type EvmSessionExecutionReceipt,
  type EvmPortfolioSnapshot,
  type PortfolioSnapshot,
  type SessionRecord,
} from "@silfable/contracts";

import { buildUnifiedPortfolio } from "./unified-portfolio.js";

const SOLANA_WALLET = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const EVM_WALLET = "0x567ba1d5b49f88c74c8f23a843e094d18a3fd1c";
const EVM_TOKEN_IN = "0x1111111111111111111111111111111111111111";
const EVM_TOKEN_OUT = "0x2222222222222222222222222222222222222222";

function baseSession(input: Partial<SessionRecord>): SessionRecord {
  return SessionRecordSchema.parse({
    id: randomUUID(),
    title: "Unified portfolio",
    mode: "mission",
    permission: "restricted",
    workspace: "general",
    walletScope: "solana",
    walletAddress: SOLANA_WALLET,
    messages: [],
    startedAt: "2026-07-30T01:00:00.000Z",
    usage: { input: 0, output: 0, total: 0, cost: null },
    ...input,
  });
}

test("builds a Solana chain snapshot and normalized Jupiter receipt", () => {
  const signature = "5wvyob89LipLEMyD9ypWdR1mjb9UfPh8NmuJTcA8W4PhtKDRioZwWCybk1R8qrN7bFwYA4Up3T4qUfx98V32322";
  const session = baseSession({
    messages: [{
      id: randomUUID(),
      role: "assistant",
      text: "Swap finalized",
      at: "2026-07-30T01:01:00.000Z",
      missionExecution: {
        id: randomUUID(),
        missionId: randomUUID(),
        simulationId: randomUUID(),
        status: "confirmed",
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}`,
        router: "metis",
        inputAmount: "2000000",
        outputAmount: "148362",
        expectedOutputAmount: "148361",
        actualSlippageBps: -0.06,
        actualSlippageRawAmount: null,
        networkFeeLamports: 22556,
        actualNetworkFeeLamports: 22556,
        walletPreLamports: "152924049",
        walletPostLamports: "150901493",
        totalWalletOutflowLamports: "2022556",
        accountFundingLamports: "0",
        walletAddress: SOLANA_WALLET,
        inputMint: SOL_MINT,
        code: 0,
        error: null,
        transactionSigned: true,
        broadcastAttempted: true,
        executedAt: "2026-07-30T01:01:00.000Z",
        chainVerification: "finalized",
        chainSlot: 435909793,
        chainError: null,
        verifiedAt: "2026-07-30T01:01:01.000Z",
      },
    }],
  });
  const portfolio: PortfolioSnapshot = {
    address: SOLANA_WALLET,
    slot: 435909800,
    solBalance: "0.150901493",
    solUsdPrice: 74,
    totalUsd: 11.166710482,
    assets: [{
      mint: USDC_MINT,
      amount: "148362",
      decimals: 6,
      uiAmount: "0.148362",
      usdPrice: 1,
      usdValue: 0.148362,
    }],
    verifiedAt: "2026-07-30T01:01:02.000Z",
  };

  const result = buildUnifiedPortfolio({
    session,
    solanaPortfolio: portfolio,
    now: "2026-07-30T01:01:03.000Z",
  });

  assert.equal(result.chains[0]?.chainKey, "solana");
  assert.equal(result.chains[0]?.nativeAmountRaw, "150901493");
  assert.equal(result.activity[0]?.venue, "jupiter");
  assert.equal(result.activity[0]?.status, "finalized");
  assert.equal(result.activity[0]?.actualOutputRaw, "148362");
  assert.equal(result.activity[0]?.networkFeeRaw, "22556");
  assert.equal(result.activity[0]?.explorerUrl, `https://explorer.solana.com/tx/${signature}`);
  assert.equal((result.activity[0]?.details as any[])?.some((entry: any) => entry.label === "Wallet outflow"), true);
  assert.equal(result.chains[0]?.valuationStatus, "complete");
  assert.equal(result.chains[0]?.valuationSource, "jupiter-price");
});

test("builds an EVM snapshot and filters encrypted receipts to the session wallet", () => {
  const session = baseSession({
    walletScope: "evm",
    evmChainKey: "robinhood",
    walletAddress: EVM_WALLET,
  });
  const portfolio: EvmPortfolioSnapshot = {
    chainKey: "robinhood",
    chainId: 4663,
    chainName: "Robinhood Chain",
    address: EVM_WALLET,
    blockNumber: "33500000",
    nativeSymbol: "ETH",
    nativeRawAmount: "10000000000000000",
    nativeUiAmount: "0.01",
    assets: [{
      address: EVM_TOKEN_OUT,
      symbol: "USDC",
      decimals: 6,
      rawAmount: "1000000",
      uiAmount: "1",
    }],
    verifiedAt: "2026-07-30T02:00:00.000Z",
  };
  const receipt = {
    id: randomUUID(),
    chainKey: "robinhood",
    chainId: 4663,
    transactionHash: `0x${"a".repeat(64)}`,
    walletAddress: EVM_WALLET,
    kind: "swap",
    status: "confirmed",
    tokenIn: EVM_TOKEN_IN,
    tokenOut: EVM_TOKEN_OUT,
    amountIn: "1000000000000000",
    expectedAmountOut: "2500000",
    minimumAmountOut: "2475000",
    networkFeeWei: "12000000000000",
    broadcastAt: "2026-07-30T02:00:01.000Z",
    reconciledAt: "2026-07-30T02:00:02.000Z",
  };
  const otherReceipt = {
    ...receipt,
    id: randomUUID(),
    walletAddress: "0x9999999999999999999999999999999999999999",
  } as unknown as EvmSessionExecutionReceipt;

  const result = buildUnifiedPortfolio({
    session,
    evmPortfolio: portfolio,
    evmReceipts: [receipt, otherReceipt],
    now: "2026-07-30T02:00:03.000Z",
  });

  assert.equal(result.chains[0]?.chainName, "Robinhood Chain");
  assert.equal(result.chains[0]?.assets[0]?.symbol, "USDC");
  assert.equal(result.activity.length, 1);
  assert.equal(result.activity[0]?.venue, "evm-swap");
  assert.equal(result.activity[0]?.networkFeeRaw, "12000000000000");
  assert.equal(result.activity[0]?.explorerUrl, `https://robinhoodchain.blockscout.com/tx/${receipt.transactionHash}`);
  assert.equal(result.chains[0]?.valuationStatus, "unavailable");
  assert.equal(result.chains[0]?.valuationSource, null);
  assert.equal(result.chains[0]?.priceVerifiedAt, null);
});

test("values EVM native and ERC-20 balances from explicit provider evidence", () => {
  const session = baseSession({
    walletScope: "evm",
    evmChainKey: "robinhood",
    walletAddress: EVM_WALLET,
  });
  const portfolio: EvmPortfolioSnapshot = {
    chainKey: "robinhood",
    chainId: 4663,
    chainName: "Robinhood Chain",
    address: EVM_WALLET,
    blockNumber: "33500001",
    nativeSymbol: "ETH",
    nativeRawAmount: "10000000000000000",
    nativeUiAmount: "0.01",
    assets: [{
      address: EVM_TOKEN_OUT,
      symbol: "USDC",
      decimals: 6,
      rawAmount: "1000000",
      uiAmount: "1",
    }],
    verifiedAt: "2026-07-30T03:00:00.000Z",
  };
  const fetchedAt = "2026-07-30T03:00:01.000Z";
  const result = buildUnifiedPortfolio({
    session,
    evmPortfolio: portfolio,
    evmPrices: {
      source: "coingecko-onchain",
      fetchedAt,
      nativeAddress: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
      prices: new Map([
        ["0x0bd7d308f8e1639fab988df18a8011f41eacad73", 2_000],
        [EVM_TOKEN_OUT, 1],
      ]),
    },
  });

  assert.equal(result.chains[0]?.nativeUsdValue, 20);
  assert.equal(result.chains[0]?.assets[0]?.usdValue, 1);
  assert.equal(result.chains[0]?.totalUsd, 21);
  assert.equal(result.chains[0]?.valuationStatus, "complete");
  assert.equal(result.chains[0]?.valuationSource, "coingecko-onchain");
  assert.equal(result.chains[0]?.priceVerifiedAt, fetchedAt);
  assert.equal(result.chains[0]?.assets[0]?.priceVerifiedAt, fetchedAt);
});

test("keeps the Robinhood wallet snapshot scoped to the single enabled chain", () => {
  const session = baseSession({
    walletScope: "evm",
    evmChainKey: "robinhood",
    walletAddress: EVM_WALLET,
  });
  const robinhood: EvmPortfolioSnapshot = {
    chainKey: "robinhood",
    chainId: 4663,
    chainName: "Robinhood Chain",
    address: EVM_WALLET,
    blockNumber: "33500002",
    nativeSymbol: "ETH",
    nativeRawAmount: "10000000000000000",
    nativeUiAmount: "0.01",
    assets: [],
    verifiedAt: "2026-07-30T04:00:00.000Z",
  };
  const result = buildUnifiedPortfolio({
    session,
    evmPortfolios: [
      { snapshot: robinhood, prices: null },
    ],
  });

  assert.deepEqual(result.chains.map((chain) => chain.chainKey), ["robinhood"]);
  assert.equal(result.chains.every((chain) => chain.walletAddress === EVM_WALLET), true);
});
