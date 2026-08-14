// @ts-nocheck
import {
  UnifiedPortfolioSnapshotSchema,
  type EvmSessionExecutionReceipt,
  type EvmPortfolioSnapshot,
  type PortfolioSnapshot,
  type SessionRecord,
  type UnifiedActivityEntry,
  type UnifiedPortfolioChain,
  type UnifiedPortfolioSnapshot,
  type WalletActivitySnapshot,
} from "@silfable/contracts";
import { activityExplorerUrl, explorerBaseUrl } from "./explorer-mapping.js";
import type { EvmUsdPriceEvidence } from "../integrations/evm-price-provider.js";

type BuildUnifiedPortfolioInput = {
  session: SessionRecord;
  solanaPortfolio?: PortfolioSnapshot | null;
  evmPortfolio?: EvmPortfolioSnapshot | null;
  evmPrices?: EvmUsdPriceEvidence | null;
  evmPortfolios?: Array<{
    snapshot: EvmPortfolioSnapshot;
    prices?: EvmUsdPriceEvidence | null;
  }>;
  chainActivity?: WalletActivitySnapshot | null;
  evmReceipts?: EvmSessionExecutionReceipt[];
  now?: string;
};

type ActivitySeed = any;

function solanaChain(snapshot: PortfolioSnapshot): UnifiedPortfolioChain {
  const lamports = BigInt(Math.round(Number(snapshot.solBalance) * 1_000_000_000)).toString();
  const nativeUsdValue = snapshot.solUsdPrice === null
    ? null
    : Number(snapshot.solBalance) * snapshot.solUsdPrice;
  return {
    family: "solana",
    chainKey: "solana",
    chainId: "solana-mainnet",
    chainName: "Solana Mainnet",
    walletAddress: snapshot.address,
    blockReference: snapshot.slot.toString(),
    nativeSymbol: "SOL",
    nativeAmountRaw: lamports,
    nativeUiAmount: snapshot.solBalance,
    nativeUsdPrice: snapshot.solUsdPrice,
    nativeUsdValue,
    totalUsd: snapshot.totalUsd,
    assets: snapshot.assets.map((asset) => ({
      assetId: asset.mint,
      symbol: null,
      amountRaw: asset.amount,
      decimals: asset.decimals,
      uiAmount: asset.uiAmount,
      usdPrice: asset.usdPrice,
      usdValue: asset.usdValue,
      valuationSource: asset.usdPrice === null ? null : "jupiter-price",
      priceVerifiedAt: asset.usdPrice === null ? null : snapshot.verifiedAt,
    })),
    valuationStatus: snapshot.totalUsd === null
      ? "unavailable"
      : snapshot.assets.every((asset) => asset.usdValue !== null) ? "complete" : "partial",
    valuationSource: snapshot.totalUsd === null ? null : "jupiter-price",
    priceVerifiedAt: snapshot.totalUsd === null ? null : snapshot.verifiedAt,
    explorerBaseUrl: explorerBaseUrl("solana", "solana"),
    verifiedAt: snapshot.verifiedAt,
  };
}

function finiteUsdValue(uiAmount: string, usdPrice: number | null): number | null {
  if (usdPrice === null) return null;
  const value = Number(uiAmount) * usdPrice;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function evmChain(
  snapshot: EvmPortfolioSnapshot,
  evidence: EvmUsdPriceEvidence | null | undefined,
): UnifiedPortfolioChain {
  const nativeUsdPrice = evidence?.prices.get(evidence.nativeAddress.toLowerCase()) ?? null;
  const nativeUsdValue = finiteUsdValue(snapshot.nativeUiAmount, nativeUsdPrice);
  const assets = snapshot.assets.map((asset) => {
    const usdPrice = evidence?.prices.get(asset.address.toLowerCase()) ?? null;
    return {
      assetId: asset.address,
      symbol: asset.symbol,
      amountRaw: asset.rawAmount,
      decimals: asset.decimals,
      uiAmount: asset.uiAmount,
      usdPrice,
      usdValue: finiteUsdValue(asset.uiAmount, usdPrice),
      valuationSource: usdPrice === null ? null : "coingecko-onchain" as const,
      priceVerifiedAt: usdPrice === null ? null : evidence!.fetchedAt,
    };
  });
  const values = [nativeUsdValue, ...assets.map((asset) => asset.usdValue)];
  const pricedCount = values.filter((value) => value !== null).length;
  const totalUsd = pricedCount === 0
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const valuationStatus = pricedCount === 0
    ? "unavailable" as const
    : pricedCount === values.length ? "complete" as const : "partial" as const;
  return {
    family: "evm",
    chainKey: snapshot.chainKey,
    chainId: snapshot.chainId.toString(),
    chainName: snapshot.chainName,
    walletAddress: snapshot.address,
    blockReference: snapshot.blockNumber,
    nativeSymbol: snapshot.nativeSymbol,
    nativeAmountRaw: snapshot.nativeRawAmount,
    nativeUiAmount: snapshot.nativeUiAmount,
    nativeUsdPrice,
    nativeUsdValue,
    totalUsd,
    valuationStatus,
    valuationSource: pricedCount === 0 ? null : "coingecko-onchain",
    priceVerifiedAt: pricedCount === 0 ? null : evidence!.fetchedAt,
    explorerBaseUrl: explorerBaseUrl("evm", snapshot.chainKey),
    assets,
    verifiedAt: snapshot.verifiedAt,
  };
}

function sessionActivity(session: SessionRecord): ActivitySeed[] {
  const entries: ActivitySeed[] = [];
  for (const message of session.messages) {
    const source = "encrypted-session" as const;
    const swap = message.missionExecution;
    if (swap) {
      entries.push({
        id: `jupiter:${swap.id}`,
        venue: "jupiter",
        kind: "swap",
        family: "solana",
        chainKey: "solana",
        walletAddress: swap.walletAddress ?? session.walletAddress!,
        status: swap.status === "confirmed"
          ? swap.chainVerification === "finalized" ? "finalized" : "confirmed"
          : swap.status === "failed" ? "failed" : "broadcast-unknown",
        transactionId: swap.signature,
        inputAssetId: swap.inputMint ?? null,
        inputAmountRaw: swap.inputAmount,
        outputAssetId: message.missionPreview?.outputMint ?? null,
        expectedOutputRaw: swap.expectedOutputAmount ?? null,
        actualOutputRaw: swap.outputAmount,
        networkFeeRaw: swap.actualNetworkFeeLamports?.toString()
          ?? swap.networkFeeLamports?.toString()
          ?? null,
        accountFundingRaw: swap.accountFundingLamports ?? null,
        totalWalletOutflowRaw: swap.totalWalletOutflowLamports ?? null,
        actualSlippageBps: swap.actualSlippageBps ?? null,
        occurredAt: swap.verifiedAt ?? swap.executedAt,
        source,
      });
    }

    const launch = message.pumpLaunchExecution;
    if (launch) {
      entries.push({
        id: `pumpfun-launch:${launch.id}`,
        venue: "pumpfun",
        kind: "token-launch",
        family: "solana",
        chainKey: "solana",
        walletAddress: launch.creatorWallet,
        status: launch.status === "finalized"
          ? "finalized"
          : launch.status === "failed" ? "failed" : "broadcast-unknown",
        transactionId: launch.signature,
        inputAssetId: "SOL",
        inputAmountRaw: launch.actualWalletOutflowLamports ?? launch.totalEstimatedOutflowLamports,
        outputAssetId: launch.mintAddress,
        expectedOutputRaw: null,
        actualOutputRaw: null,
        networkFeeRaw: launch.actualNetworkFeeLamports?.toString() ?? launch.networkFeeLamports.toString(),
        accountFundingRaw: launch.actualAccountFundingLamports?.toString() ?? launch.rentLamports.toString(),
        totalWalletOutflowRaw: launch.actualWalletOutflowLamports ?? launch.totalEstimatedOutflowLamports,
        actualSlippageBps: null,
        occurredAt: launch.finalizedAt ?? launch.updatedAt,
        source,
      });
    }

    const pump = message.pumpExecution;
    if (pump) {
      const receipt = pump.receipt;
      entries.push({
        id: `pump-trade:${pump.id}`,
        venue: receipt ? "pumpfun" : "pumpswap",
        kind: "trade",
        family: "solana",
        chainKey: "solana",
        walletAddress: pump.walletAddress,
        status: pump.status === "finalized"
          ? "finalized"
          : pump.status === "failed" ? "failed" : "broadcast-unknown",
        transactionId: pump.signature,
        inputAssetId: pump.side === "buy" ? "SOL" : pump.tokenMint,
        inputAmountRaw: receipt?.actualInputAmount ?? null,
        outputAssetId: pump.side === "buy" ? pump.tokenMint : "SOL",
        expectedOutputRaw: null,
        actualOutputRaw: receipt?.actualOutputAmount ?? null,
        networkFeeRaw: receipt?.networkFeeLamports.toString() ?? null,
        accountFundingRaw: receipt?.accountCreationFundingLamports.toString() ?? null,
        totalWalletOutflowRaw: receipt && BigInt(receipt.walletLamportDelta) < 0n
          ? (-BigInt(receipt.walletLamportDelta)).toString()
          : null,
        actualSlippageBps: null,
        occurredAt: receipt?.reconciledAt ?? pump.updatedAt,
        source,
      });
    }

    const bridge = message.bridgeReceipt as any;
    if (bridge) {
      const destinationDone = bridge.state === "destination-confirmed";
      const failed = ["destination-failed", "source-failed", "relay-stuck", "expired"].includes(bridge.state);
      entries.push({
        id: `bridge:${bridge.id}`,
        venue: "bridge",
        kind: "bridge",
        family: "cross-chain",
        chainKey: "solana-to-base",
        walletAddress: bridge.sourceWallet,
        status: destinationDone ? "finalized"
          : bridge.state === "refunded" ? "refunded"
          : failed ? "failed"
          : bridge.state === "broadcast-unknown" ? "broadcast-unknown" : "pending",
        transactionId: bridge.destinationTransactionHash ?? bridge.sourceSignature,
        inputAssetId: "solana-usdc",
        inputAmountRaw: bridge.amountIn,
        outputAssetId: "base-usdc",
        expectedOutputRaw: bridge.expectedDestinationAmount,
        actualOutputRaw: bridge.actualDestinationAmount,
        networkFeeRaw: bridge.actualSourceNetworkFeeLamports?.toString() ?? null,
        accountFundingRaw: bridge.fee.sourceAccountFundingLamports?.toString() ?? null,
        totalWalletOutflowRaw: bridge.actualSourceWalletOutflowLamports,
        actualSlippageBps: null,
        occurredAt: bridge.destinationVerifiedAt ?? bridge.sourceVerifiedAt ?? bridge.updatedAt,
        source,
      });
    }

    const hyperliquid = (message as any).hyperliquidReceipt as any;
    if (hyperliquid) {
      entries.push({
        id: `hyperliquid:${hyperliquid.id}`,
        venue: "hyperliquid",
        kind: "order",
        family: "offchain",
        chainKey: "hyperliquid",
        walletAddress: hyperliquid.accountAddress,
        status: hyperliquid.state === "filled" ? "finalized"
          : hyperliquid.state === "cancelled" ? "cancelled"
          : hyperliquid.state === "rejected" ? "failed"
          : hyperliquid.state === "broadcast-unknown" ? "broadcast-unknown"
          : hyperliquid.state === "partially-filled" ? "partial" : "pending",
        transactionId: hyperliquid.orderId?.toString() ?? hyperliquid.clientOrderId,
        inputAssetId: "BTC-PERP",
        inputAmountRaw: hyperliquid.requestedSize,
        outputAssetId: null,
        expectedOutputRaw: null,
        actualOutputRaw: hyperliquid.filledSize,
        networkFeeRaw: null,
        accountFundingRaw: null,
        totalWalletOutflowRaw: null,
        actualSlippageBps: null,
        occurredAt: hyperliquid.updatedAt,
        source,
      });
    }

    const limit = message.limitOrderExecution as any;
    if (limit) {
      entries.push({
        id: `limit-order:${limit.id}`,
        venue: "limit-order",
        kind: "order",
        family: "solana",
        chainKey: "solana",
        walletAddress: limit.walletAddress ?? session.walletAddress!,
        status: limit.status === "settled" ? "finalized"
          : limit.status === "failed" ? "failed"
          : limit.status === "unknown" ? "broadcast-unknown"
          : limit.status === "action-required" ? "action-required" : "pending",
        transactionId: limit.depositSignature ?? limit.orderId,
        inputAssetId: null,
        inputAmountRaw: limit.inputAmount ?? limit.initialInputAmount ?? null,
        outputAssetId: null,
        expectedOutputRaw: null,
        actualOutputRaw: limit.outputAmount ?? null,
        networkFeeRaw: limit.networkFeeLamports?.toString() ?? null,
        accountFundingRaw: null,
        totalWalletOutflowRaw: null,
        actualSlippageBps: null,
        occurredAt: limit.verifiedAt ?? limit.createdAt,
        source,
      });
    }

    const cancel = message.limitOrderCancelReceipt as any;
    if (cancel) {
      entries.push({
        id: `limit-order-cancel:${cancel.id}`,
        venue: "limit-order",
        kind: "cancel",
        family: "solana",
        chainKey: "solana",
        walletAddress: cancel.walletAddress ?? session.walletAddress!,
        status: cancel.status === "cancelled" ? "cancelled"
          : cancel.status === "failed" ? "failed" : "broadcast-unknown",
        transactionId: cancel.withdrawalSignature,
        inputAssetId: null,
        inputAmountRaw: null,
        outputAssetId: null,
        expectedOutputRaw: null,
        actualOutputRaw: null,
        networkFeeRaw: cancel.networkFeeLamports?.toString() ?? null,
        accountFundingRaw: null,
        totalWalletOutflowRaw: null,
        actualSlippageBps: null,
        occurredAt: cancel.verifiedAt ?? cancel.createdAt,
        source,
      });
    }
  }
  return entries;
}

function evmStoredActivity(receipts: EvmSessionExecutionReceipt[], walletAddress: string): ActivitySeed[] {
  return receipts
    .filter((r) => (r as any).walletAddress?.toLowerCase() === walletAddress.toLowerCase())
    .map((r) => {
      const receipt = r as any;
      return {
        id: `evm:${receipt.id}`,
        venue: "evm-swap" as const,
        kind: receipt.kind === "swap" ? "swap" as const : "order" as const,
        family: "evm" as const,
        chainKey: receipt.chainKey,
        walletAddress: receipt.walletAddress,
        status: receipt.status === "confirmed"
          ? "confirmed" as const
          : receipt.status === "reverted" ? "failed" as const : "broadcast-unknown" as const,
        transactionId: receipt.transactionHash,
        inputAssetId: receipt.tokenIn,
        inputAmountRaw: receipt.amountIn,
        outputAssetId: receipt.tokenOut,
        expectedOutputRaw: receipt.expectedAmountOut,
        actualOutputRaw: null,
        networkFeeRaw: receipt.networkFeeWei,
        accountFundingRaw: null,
        totalWalletOutflowRaw: null,
        actualSlippageBps: null,
        occurredAt: receipt.reconciledAt,
        source: "encrypted-receipt-store" as const,
      };
    });
}

function chainReadActivity(snapshot: WalletActivitySnapshot | null | undefined): ActivitySeed[] {
  if (!snapshot) return [];
  return snapshot.entries.map((entry) => ({
    id: `solana-chain:${entry.signature}`,
    venue: "solana" as const,
    kind: "transfer" as const,
    family: "solana" as const,
    chainKey: "solana",
    walletAddress: snapshot.address,
    status: entry.status === "success" ? "finalized" as const : "failed" as const,
    transactionId: entry.signature,
    inputAssetId: null,
    inputAmountRaw: null,
    outputAssetId: null,
    expectedOutputRaw: null,
    actualOutputRaw: null,
    networkFeeRaw: null,
    accountFundingRaw: null,
    totalWalletOutflowRaw: null,
    actualSlippageBps: null,
    blockReference: entry.slot.toString(),
    occurredAt: entry.blockTime ?? snapshot.verifiedAt,
    source: "chain-read" as const,
  }));
}

function detail(label: string, value: string | null | undefined) {
  return value === null || value === undefined || value.length === 0 ? [] : [{ label, value }];
}

function finalizeActivity(entry: ActivitySeed): UnifiedActivityEntry {
  return {
    ...entry,
    blockReference: entry.blockReference ?? null,
    explorerUrl: activityExplorerUrl(entry),
    details: [
      ...detail("Transaction", entry.transactionId),
      ...detail("Input asset", entry.inputAssetId),
      ...detail("Input raw", entry.inputAmountRaw),
      ...detail("Output asset", entry.outputAssetId),
      ...detail("Expected output", entry.expectedOutputRaw),
      ...detail("Actual output", entry.actualOutputRaw),
      ...detail("Network fee", entry.networkFeeRaw),
      ...detail("Account funding", entry.accountFundingRaw),
      ...detail("Wallet outflow", entry.totalWalletOutflowRaw),
      ...detail("Actual slippage", entry.actualSlippageBps === null ? null : `${entry.actualSlippageBps} bps`),
      ...detail("Block / slot", entry.blockReference),
      { label: "Evidence", value: entry.source },
    ].slice(0, 16),
  };
}

export function buildUnifiedPortfolio(input: BuildUnifiedPortfolioInput): UnifiedPortfolioSnapshot {
  if (input.session.walletAddress === null || input.session.walletScope === undefined) {
    throw new Error("Unified portfolio requires a wallet-bound session.");
  }
  const chains = [
    ...(input.solanaPortfolio ? [solanaChain(input.solanaPortfolio)] : []),
    ...(input.evmPortfolio ? [evmChain(input.evmPortfolio, input.evmPrices)] : []),
    ...(input.evmPortfolios ?? []).map((portfolio) => evmChain(portfolio.snapshot, portfolio.prices)),
  ];
  const deduped = new Map<string, UnifiedActivityEntry>();
  const activity = [
    ...sessionActivity(input.session),
    ...evmStoredActivity(input.evmReceipts ?? [], input.session.walletAddress),
    ...chainReadActivity(input.chainActivity),
  ].map(finalizeActivity);
  for (const entry of activity) {
    const key = entry.transactionId ? `${entry.venue}:${entry.transactionId}` : entry.id;
    const current = deduped.get(key);
    if (!current || Date.parse(entry.occurredAt) >= Date.parse(current.occurredAt)) deduped.set(key, entry);
  }
  const totalValues = chains.map((chain) => chain.totalUsd);
  const totalUsd = totalValues.length > 0 && totalValues.every((value) => value !== null)
    ? totalValues.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : totalValues.find((value) => value !== null) ?? null;
  return UnifiedPortfolioSnapshotSchema.parse({
    sessionId: input.session.id,
    walletScope: input.session.walletScope,
    walletAddress: input.session.walletAddress,
    chains,
    totalUsd,
    activity: [...deduped.values()]
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
      .slice(0, 100),
    verifiedAt: input.now ?? new Date().toISOString(),
  });
}
