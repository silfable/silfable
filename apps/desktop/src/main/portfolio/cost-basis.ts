// @ts-nocheck
import {
  PortfolioCostBasisSummarySchema,
  type PortfolioAcquisitionLot,
  type PortfolioCostBasisAsset,
  type PortfolioCostBasisSummary,
  type UnifiedPortfolioAsset,
  type UnifiedPortfolioSnapshot,
} from "@silfable/contracts";

const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;

type MutableLot = PortfolioAcquisitionLot;

function rawToUi(raw: bigint, decimals: number): number {
  const divisor = 10 ** decimals;
  const value = Number(raw) / divisor;
  return Number.isFinite(value) ? value : 0;
}

function findAsset(
  snapshot: UnifiedPortfolioSnapshot,
  chainKey: string,
  assetId: string,
): UnifiedPortfolioAsset | null {
  const chain = snapshot.chains.find((candidate) => candidate.chainKey === chainKey);
  if (!chain) return null;
  if (chain.family === "solana" && assetId === "So11111111111111111111111111111111111111112") {
    return {
      assetId,
      symbol: chain.nativeSymbol,
      amountRaw: chain.nativeAmountRaw,
      decimals: 9,
      uiAmount: chain.nativeUiAmount,
      usdPrice: chain.nativeUsdPrice,
      usdValue: chain.nativeUsdValue,
      valuationSource: chain.valuationSource,
      priceVerifiedAt: chain.priceVerifiedAt,
    };
  }
  return chain.assets.find((asset) => asset.assetId.toLowerCase() === assetId.toLowerCase()) ?? null;
}

export function deriveVerifiedCostBasis(
  snapshot: UnifiedPortfolioSnapshot,
): PortfolioCostBasisSummary {
  const lots = new Map<string, MutableLot[]>();
  const realizedByAsset = new Map<string, number>();
  const partialAssets = new Set<string>();
  let excludedActivityCount = 0;

  const finalized = [...snapshot.activity]
    .filter((entry) => entry.status === "finalized")
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));

  for (const entry of finalized) {
    if (
      entry.family !== "solana"
      || entry.kind !== "swap"
      || entry.inputAssetId === null
      || entry.outputAssetId === null
      || entry.inputAmountRaw === null
      || entry.actualOutputRaw === null
      || entry.transactionId === null
    ) {
      excludedActivityCount += 1;
      continue;
    }
    const inputIsUsdc = entry.inputAssetId === SOLANA_USDC_MINT;
    const outputIsUsdc = entry.outputAssetId === SOLANA_USDC_MINT;
    if (inputIsUsdc === outputIsUsdc) {
      excludedActivityCount += 1;
      continue;
    }
    const assetId = inputIsUsdc ? entry.outputAssetId : entry.inputAssetId;
    const asset = findAsset(snapshot, "solana", assetId);
    if (asset === null) {
      excludedActivityCount += 1;
      continue;
    }
    const key = `solana:${assetId.toLowerCase()}`;
    if (inputIsUsdc) {
      const quantityRaw = BigInt(entry.actualOutputRaw);
      if (quantityRaw === 0n) continue;
      const costBasisUsd = rawToUi(BigInt(entry.inputAmountRaw), USDC_DECIMALS);
      const lot: MutableLot = {
        id: `lot:${entry.transactionId}:${assetId}`,
        chainKey: "solana",
        assetId,
        quantityRaw: quantityRaw.toString(),
        remainingRaw: quantityRaw.toString(),
        decimals: asset.decimals,
        costBasisUsd,
        remainingCostBasisUsd: costBasisUsd,
        acquiredAt: entry.occurredAt,
        sourceTransactionId: entry.transactionId,
        provenance: "finalized-usdc-settlement",
      };
      lots.set(key, [...(lots.get(key) ?? []), lot]);
      continue;
    }

    let quantityToSell = BigInt(entry.inputAmountRaw);
    const originalQuantity = quantityToSell;
    const proceedsUsd = rawToUi(BigInt(entry.actualOutputRaw), USDC_DECIMALS);
    let consumedCostUsd = 0;
    for (const lot of lots.get(key) ?? []) {
      if (quantityToSell === 0n) break;
      const remaining = BigInt(lot.remainingRaw);
      if (remaining === 0n) continue;
      const consumed = remaining < quantityToSell ? remaining : quantityToSell;
      const ratio = Number(consumed) / Number(remaining);
      const consumedCost = lot.remainingCostBasisUsd * ratio;
      lot.remainingRaw = (remaining - consumed).toString();
      lot.remainingCostBasisUsd = Math.max(0, lot.remainingCostBasisUsd - consumedCost);
      consumedCostUsd += consumedCost;
      quantityToSell -= consumed;
    }
    const covered = originalQuantity - quantityToSell;
    if (covered > 0n) {
      const coveredProceeds = proceedsUsd * (Number(covered) / Number(originalQuantity));
      realizedByAsset.set(key, (realizedByAsset.get(key) ?? 0) + coveredProceeds - consumedCostUsd);
    }
    if (quantityToSell > 0n) partialAssets.add(key);
  }

  const costBasisAssets: PortfolioCostBasisAsset[] = [];
  for (const [key, assetLots] of lots) {
    const remainingLots = assetLots.filter((lot) => BigInt(lot.remainingRaw) > 0n);
    const coveredRaw = remainingLots.reduce((sum, lot) => sum + BigInt(lot.remainingRaw), 0n);
    const remainingCostBasisUsd = remainingLots.reduce((sum, lot) => sum + lot.remainingCostBasisUsd, 0);
    const first = assetLots[0]!;
    const current = findAsset(snapshot, first.chainKey, first.assetId);
    const currentValueUsd = current?.usdPrice === null || current?.usdPrice === undefined
      ? null
      : rawToUi(coveredRaw, first.decimals) * current.usdPrice;
    costBasisAssets.push({
      chainKey: first.chainKey,
      assetId: first.assetId,
      symbol: current?.symbol ?? null,
      decimals: first.decimals,
      coveredQuantityRaw: coveredRaw.toString(),
      remainingCostBasisUsd,
      currentValueUsd,
      realizedPnlUsd: realizedByAsset.get(key) ?? 0,
      unrealizedPnlUsd: currentValueUsd === null ? null : currentValueUsd - remainingCostBasisUsd,
      coverage: partialAssets.has(key) ? "partial" : "complete",
    });
  }

  const allLots = [...lots.values()].flat();
  const realizedPnlUsd = costBasisAssets.length === 0
    ? null
    : costBasisAssets.reduce((sum, asset) => sum + asset.realizedPnlUsd, 0);
  const unrealizedAvailable = costBasisAssets.length > 0
    && costBasisAssets.every((asset) => asset.unrealizedPnlUsd !== null);
  const partial = partialAssets.size > 0 || excludedActivityCount > 0 || !unrealizedAvailable;
  return PortfolioCostBasisSummarySchema.parse({
    method: "fifo",
    status: costBasisAssets.length === 0 ? "unavailable" : partial ? "partial" : "verified",
    realizedPnlUsd,
    unrealizedPnlUsd: unrealizedAvailable
      ? costBasisAssets.reduce((sum, asset) => sum + asset.unrealizedPnlUsd!, 0)
      : null,
    lots: allLots,
    assets: costBasisAssets,
    excludedActivityCount,
    evaluatedAt: snapshot.verifiedAt,
  });
}
