// @ts-nocheck
import { formatUnits } from 'viem';

export function formatEvmTokenAmount(rawAmount: string | null | undefined, symbol: string): string {
  if (!rawAmount || rawAmount === "Unavailable") return "Unavailable";
  try {
    const bi = BigInt(rawAmount);
    const isEth = symbol === "ETH" || symbol === "WETH";
    const decimals = isEth ? 18 : 6;
    const val = Number(bi) / (10 ** decimals);
    if (val === 0 && bi > 0n) return `${bi} wei`;
    return `${val.toLocaleString("en-US", { maximumFractionDigits: isEth ? 8 : 4 })} ${symbol}`;
  } catch {
    return `${rawAmount} ${symbol}`;
  }
}

export function formatWeiToGweiOrEth(weiAmount: string | null | undefined): string {
  if (!weiAmount) return "0 wei";
  try {
    const bi = BigInt(weiAmount);
    const ethVal = Number(bi) / 1e18;
    if (ethVal >= 0.0001) return `${ethVal.toFixed(6)} ETH`;
    const gweiVal = Number(bi) / 1e9;
    return `${gweiVal.toFixed(2)} Gwei (${weiAmount} wei)`;
  } catch {
    return `${weiAmount} wei`;
  }
}

export function formatRuntimeTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function formatPortfolioUsd(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "Unpriced"
    : value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function portfolioAssetUsd(amount: string, price: number | null): number | null {
  const numericAmount = Number(amount);
  if (numericAmount === 0) return 0;
  if (!Number.isFinite(numericAmount) || price === null) return null;
  const value = numericAmount * price;
  return Number.isFinite(value) ? value : null;
}

export function formatPortfolioAmount(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (numeric > 0 && numeric < 0.000001) return numeric.toExponential(4);
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function formatPumpMetric(value: number | null, quoteSymbol: "SOL" | "USDC" | "unknown"): string {
  if (value === null) return "Unavailable";
  const formatted = value > 0 && value < 0.0001
    ? value.toExponential(4)
    : new Intl.NumberFormat(undefined, { notation: value >= 1_000 ? "compact" : "standard", maximumFractionDigits: 6 }).format(value);
  return quoteSymbol === "unknown" ? formatted : `${formatted} ${quoteSymbol}`;
}

export function formatPumpPercent(value: number | null): string {
  return value === null ? "Unavailable" : `${value.toFixed(2)}%`;
}

export function formatPumpBps(value: number | null): string {
  return value === null ? "Unavailable" : `${value.toFixed(3)} bps`;
}

export function formatPumpRawAmount(raw: string | null, decimals: number | null, suffix: string): string {
  if (raw === null || decimals === null) return "Unavailable";
  const numeric = Number(raw) / (10 ** decimals);
  if (!Number.isFinite(numeric)) return `${raw} raw`;
  const formatted = numeric > 0 && numeric < 0.000001
    ? numeric.toExponential(4)
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: Math.min(decimals, 9) }).format(numeric);
  return `${formatted} ${suffix}`;
}

export function formatLamportsToSol(lamports: number | string | null | undefined): string {
  if (lamports === null || lamports === undefined) return "Unavailable";
  const num = Number(lamports);
  if (isNaN(num)) return "Unavailable";
  const sol = num / 1_000_000_000;
  return `${sol.toLocaleString(undefined, { maximumFractionDigits: 9 })} SOL`;
}

export function formatSolanaAmount(amount: number | string | null | undefined, mint: string): string {
  if (amount === null || amount === undefined) return "Unavailable";
  const num = Number(amount);
  if (isNaN(num)) return "Unavailable";
  if (mint === "So11111111111111111111111111111111111111112") {
    return formatLamportsToSol(num);
  }
  if (mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") {
    return `${(num / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`;
  }
  return `${num.toLocaleString()} raw`;
}

export function formatPumpAmount(amount: string | number | null | undefined, side: "buy" | "sell", tokenMint?: string): string {
  if (amount === null || amount === undefined) return "Unavailable";
  const num = Number(amount);
  if (isNaN(num)) return "Unavailable";
  if (side === "buy") {
    return formatLamportsToSol(num);
  }
  return `${(num / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} tokens`;
}