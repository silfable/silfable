// @ts-nocheck
import { useState, useMemo, useEffect } from "react";
import type { EvmChainKey, EvmPortfolioSnapshot, PortfolioSnapshot, RuntimeStatus } from "@silfable/contracts";
import { Button } from "../ui";
import { RailSection } from "../setup/SetupHelpers";
import { EVM_PORTFOLIO_CHAINS, type SessionItem, type WalletSummary } from "../types";

type SolanaPortfolioView = { wallet: WalletSummary; snapshot: PortfolioSnapshot };
type EvmPortfolioView = { wallet: WalletSummary; snapshot: EvmPortfolioSnapshot };
type PortfolioLoadState = "idle" | "loading" | "ready" | "partial" | "error";
type PortfolioFamilyFilter = "all" | "solana" | "evm";
type EvmPortfolioToken = { address: `0x${string}`; symbol: string; decimals: number };

const EVM_NATIVE_ALIASES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
]);

function decimalsFromMultiplier(multiplier: string): number | null {
  if (!/^10*$/u.test(multiplier)) return null;
  return multiplier.length - 1;
}

async function settleTaskPool<T>(tasks: ReadonlyArray<() => Promise<T>>, concurrency: number): Promise<Array<PromiseSettledResult<T>>> {
  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      const task = tasks[index];
      if (!task) continue;
      try {
        results[index] = { status: "fulfilled", value: await task() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export function shorten(value: string): string {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;
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

export function PortfolioAssetRow({ symbol, amount, usdValue }: { symbol: string; amount: string; usdValue: number | null }) {
  return (
    <div className="portfolioAssetRow">
      <span>{symbol}</span>
      <strong>{formatPortfolioAmount(amount)}</strong>
      <div>
        <em>{formatPortfolioUsd(usdValue)}</em>
      </div>
    </div>
  );
}

export function UnifiedPortfolioRail({
  session,
  runtime,
  solanaWallets,
  evmWallets,
  refreshToken,
  copiedAddress,
  onCopyAddress,
}: {
  session: SessionItem | null;
  runtime: RuntimeStatus | null;
  solanaWallets: WalletSummary[];
  evmWallets: WalletSummary[];
  refreshToken: number;
  copiedAddress: string | null;
  onCopyAddress: (address: string) => void;
}) {
  const [solanaViews, setSolanaViews] = useState<SolanaPortfolioView[]>([]);
  const [evmViews, setEvmViews] = useState<EvmPortfolioView[]>([]);
  const [solanaState, setSolanaState] = useState<PortfolioLoadState>("idle");
  const [evmState, setEvmState] = useState<PortfolioLoadState>("idle");
  const [evmFailureChains, setEvmFailureChains] = useState<EvmChainKey[]>([]);
  const [walletFilter, setWalletFilter] = useState<PortfolioFamilyFilter>("all");
  const [chainFilter, setChainFilter] = useState<"all" | EvmChainKey>("all");
  const [retry, setRetry] = useState(0);
  const [costBasisSummary, setCostBasisSummary] = useState<any | null>(null);

  const sessionScope = session?.walletScope;
  const sessionWallet = session?.walletAddress ?? null;
  const solanaTargets = useMemo<WalletSummary[]>(() => {
    if (session) return sessionScope === "solana" && sessionWallet
      ? [{ address: sessionWallet, primary: true }]
      : [];
    return solanaWallets;
  }, [session?.id, sessionScope, sessionWallet, solanaWallets]);
  const evmTargets = useMemo<WalletSummary[]>(() => {
    if (session) return sessionScope === "evm" && sessionWallet
      ? [{ address: sessionWallet, primary: true }]
      : [];
    return evmWallets;
  }, [session?.id, sessionScope, sessionWallet, evmWallets]);
  const sessionEvmTokens = useMemo<EvmPortfolioToken[]>(() => {
    if (session?.walletScope !== "evm") return [];
    const tokens = new Map<string, EvmPortfolioToken>();
    for (const message of session.messages) {
      const quote = message.evmSwapProposal?.quote;
      if (!quote) continue;
      const candidates = [
        { address: quote.sellToken, symbol: quote.sellTokenSymbol, multiplier: quote.sellTokenMultiplier },
        { address: quote.buyToken, symbol: quote.buyTokenSymbol, multiplier: quote.buyTokenMultiplier },
      ];
      for (const candidate of candidates) {
        const address = candidate.address.toLowerCase();
        const decimals = decimalsFromMultiplier(candidate.multiplier);
        if (EVM_NATIVE_ALIASES.has(address) || decimals === null || decimals > 18) continue;
        tokens.set(address, {
          address: address as `0x${string}`,
          symbol: candidate.symbol,
          decimals,
        });
      }
    }
    return [...tokens.values()];
  }, [session]);

  useEffect(() => {
    setWalletFilter("all");
    setChainFilter(session?.walletScope === "evm" && session.evmChainKey
      ? session.evmChainKey
      : "all");
  }, [session?.id, session?.walletScope, session?.evmChainKey]);

  useEffect(() => {
    let active = true;
    setSolanaViews([]);
    if (runtime?.keystore !== "unlocked" || solanaTargets.length === 0) {
      setSolanaState("idle");
      return () => { active = false; };
    }
    setSolanaState("loading");
    const tasks = solanaTargets.map((wallet) => async () => ({
      wallet,
      snapshot: (await window.silfable.getPortfolio({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        address: wallet.address,
      })).snapshot,
    }));
    void settleTaskPool(tasks, 1).then((results) => {
      if (!active) return;
      const fulfilled = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setSolanaViews(fulfilled);
      setSolanaState(fulfilled.length === 0 ? "error" : fulfilled.length === results.length ? "ready" : "partial");
    });
    return () => { active = false; };
  }, [runtime?.keystore, solanaTargets, refreshToken, retry]);

  useEffect(() => {
    let active = true;
    setEvmViews([]);
    setEvmFailureChains([]);
    if (runtime?.keystore !== "unlocked" || evmTargets.length === 0) {
      setEvmState("idle");
      return () => { active = false; };
    }
    setEvmState("loading");
    const requests = evmTargets.flatMap((wallet) => EVM_PORTFOLIO_CHAINS.map((chain) => ({ wallet, chain })));
    const tasks = requests.map(({ wallet, chain }) => async () => ({
      wallet,
      snapshot: (await window.silfable.getEvmPortfolio({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        chainKey: chain.key,
        address: wallet.address,
        tokens: [...new Map(
          [...chain.tokens, ...(chain.key === session?.evmChainKey ? sessionEvmTokens : [])]
            .map((token) => [token.address.toLowerCase(), token]),
        ).values()],
      })).snapshot,
    }));
    void settleTaskPool(tasks, 3).then((results) => {
      if (!active) return;
      const fulfilled = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const failedChains = results.flatMap((result, index) => result.status === "rejected" && requests[index]
        ? [requests[index].chain.key]
        : []);
      setEvmViews(fulfilled);
      setEvmFailureChains([...new Set(failedChains)]);
      setEvmState(fulfilled.length === 0 ? "error" : fulfilled.length === results.length ? "ready" : "partial");
    });
    return () => { active = false; };
  }, [runtime?.keystore, evmTargets, refreshToken, retry, session?.evmChainKey, sessionEvmTokens]);

  useEffect(() => {
    let active = true;
    if (runtime?.keystore !== "unlocked" || solanaTargets.length === 0) {
      setCostBasisSummary(null);
      return;
    }
    if (typeof window.silfable.getPortfolioCostBasis !== "function") {
      setCostBasisSummary(null);
      return;
    }
    window.silfable.getPortfolioCostBasis({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      address: solanaTargets[0].address,
    }).then((res) => {
      if (active) setCostBasisSummary(res.summary);
    }).catch((err) => {
      console.warn("Failed to fetch cost basis summary", err);
    });
    return () => { active = false; };
  }, [runtime?.keystore, solanaTargets, refreshToken, retry]);

  const selectedSolana = solanaViews.filter(() => walletFilter === "all" || walletFilter === "solana");
  const selectedEvm = evmViews.filter((entry) =>
    (walletFilter === "all" || walletFilter === "evm")
    && (chainFilter === "all" || entry.snapshot.chainKey === chainFilter));
  const hasPositiveRawAmount = (amount: string): boolean => {
    try {
      return BigInt(amount) > 0n;
    } catch {
      return false;
    }
  };
  const visibleSolana = selectedSolana.filter((entry) =>
    Number(entry.snapshot.solBalance) > 0
    || entry.snapshot.assets.some((asset) => Number(asset.uiAmount) > 0));
  const visibleEvm = selectedEvm.filter((entry) =>
    hasPositiveRawAmount(entry.snapshot.nativeRawAmount)
    || entry.snapshot.assets.some((asset) => hasPositiveRawAmount(asset.rawAmount)));
  const hasVisibleAssets = visibleSolana.length + visibleEvm.length > 0;
  const knownTotals = [
    ...selectedSolana.map((entry) => entry.snapshot.totalUsd),
    ...selectedEvm.map((entry) => entry.snapshot.totalUsd ?? null),
  ].filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  const totalUsd = knownTotals.length > 0 ? knownTotals.reduce((sum, value) => sum + value, 0) : null;
  const includesSolana = session ? sessionScope === "solana" : walletFilter !== "evm";
  const includesEvm = session ? sessionScope === "evm" : walletFilter !== "solana";
  const loading = (includesSolana && solanaState === "loading") || (includesEvm && evmState === "loading");
  const failed = (includesSolana && (solanaState === "error" || solanaState === "partial"))
    || (includesEvm && (evmState === "error" || evmState === "partial"))
    || selectedEvm.some((entry) => entry.snapshot.valuationStatus === "partial");
  const robinhoodRpcUnavailable = chainFilter === "robinhood" && evmFailureChains.includes("robinhood");
  const configuredCount = session
    ? (sessionWallet ? 1 : 0)
    : (includesSolana ? solanaWallets.length : 0) + (includesEvm ? evmWallets.length : 0);
  const hasEvmSelection = sessionScope === "evm" || walletFilter === "evm";
  const totalLabel = !hasVisibleAssets
    ? "$0.00"
    : loading
    ? "Loading…"
    : totalUsd === null ? "Unpriced" : formatPortfolioUsd(totalUsd);

  return (
    <RailSection title={session ? "Position" : "Portfolio"}>
      <div className="portfolioHeadingRow">
        <span className="totalLabel">{session
          ? "Session wallet assets"
          : walletFilter === "solana" ? "Solana wallets" : walletFilter === "evm" ? "Robinhood wallets" : "All configured wallets"}</span>
        <small>{configuredCount} {configuredCount === 1 ? "wallet" : "wallets"}</small>
      </div>
      <strong className="portfolioTotal">{configuredCount === 0 ? "$0.00" : totalLabel}</strong>
  

      {!session && configuredCount > 1 && (
        <div className="portfolioScopeTabs" aria-label="Portfolio wallet scope">
          <button className={walletFilter === "all" ? "active" : ""} onClick={() => { setWalletFilter("all"); setChainFilter("all"); }}>All</button>
          <button className={walletFilter === "solana" ? "active" : ""} disabled={solanaWallets.length === 0} onClick={() => { setWalletFilter("solana"); setChainFilter("all"); }}>Solana</button>
          <button className={walletFilter === "evm" ? "active" : ""} disabled={evmWallets.length === 0} onClick={() => { setWalletFilter("evm"); setChainFilter("robinhood"); }}>Robinhood</button>
        </div>
      )}

      {hasEvmSelection && EVM_PORTFOLIO_CHAINS.length > 1 && (
        <div className="portfolioChainTabs" aria-label="EVM chain scope">
          <button className={chainFilter === "all" ? "active" : ""} onClick={() => setChainFilter("all")}>All</button>
          {EVM_PORTFOLIO_CHAINS.map((chain) => (
            <button key={chain.key} className={chainFilter === chain.key ? "active" : ""} onClick={() => setChainFilter(chain.key)}>{chain.label}</button>
          ))}
        </div>
      )}

      {(failed || (configuredCount > 0 && !loading && selectedSolana.length + selectedEvm.length === 0)) && (
        <div className="portfolioReadWarning">
          <span>{robinhoodRpcUnavailable
            ? "Robinhood Chain RPC did not respond. Add a custom provider endpoint in Settings → Connect integrations."
            : "Some network balances could not be verified."}</span>
          <Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry</Button>
        </div>
      )}

      <div className="portfolioAssetGroups">
        {visibleSolana.map((entry) => (
          <div className="portfolioAssetGroup" key={`solana:${entry.wallet.address}`}>
            <div className="portfolioGroupTitle"><span>SOLANA</span><strong>{formatPortfolioUsd(entry.snapshot.totalUsd)}</strong></div>
            <PortfolioAssetRow symbol="SOL" amount={entry.snapshot.solBalance} usdValue={portfolioAssetUsd(entry.snapshot.solBalance, entry.snapshot.solUsdPrice)} />
            {entry.snapshot.assets.slice(0, 8).map((asset) => {
              const knownMints: Record<string, string> = {
                "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
                "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
                "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
                "So11111111111111111111111111111111111111112": "SOL",
                "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
              };
              const resolvedSymbol = knownMints[asset.mint] || shorten(asset.mint);
              return (
                <PortfolioAssetRow key={asset.mint} symbol={resolvedSymbol} amount={asset.uiAmount} usdValue={asset.usdValue} />
              );
            })}
          </div>
        ))}
        {visibleEvm.map((entry) => (
          <div className="portfolioAssetGroup" key={`${entry.wallet.address}:${entry.snapshot.chainKey}`}>
            <div className="portfolioGroupTitle"><span>{entry.snapshot.chainName.toUpperCase()}</span><strong>{formatPortfolioUsd(entry.snapshot.totalUsd ?? null)}</strong></div>
            <PortfolioAssetRow symbol={entry.snapshot.nativeSymbol} amount={entry.snapshot.nativeUiAmount} usdValue={entry.snapshot.nativeUsdValue ?? null} />
            {entry.snapshot.assets.filter((asset) => BigInt(asset.rawAmount) > 0n).map((asset) => (
              <PortfolioAssetRow key={asset.address} symbol={asset.symbol} amount={asset.uiAmount} usdValue={asset.usdValue ?? null} />
            ))}
          </div>
        ))}
        {!loading && !hasVisibleAssets && configuredCount > 0 && (
          <p className="portfolioEmpty">No non-zero assets are available for this selection.</p>
        )}
      </div>

      <div className="portfolioWallets">
        {(session
          ? [...solanaTargets.map((wallet) => ({ ...wallet, family: "SOL" })), ...evmTargets.map((wallet) => ({ ...wallet, family: "ROBINHOOD" }))]
          : [
            ...(walletFilter !== "evm" ? solanaWallets.map((wallet) => ({ ...wallet, family: "SOL" })) : []),
            ...(walletFilter !== "solana" ? evmWallets.map((wallet) => ({ ...wallet, family: "ROBINHOOD" })) : []),
          ]
        ).map((wallet) => (
          <div className="walletLine" key={`${wallet.family}:${wallet.address}`}>
            <span>{wallet.family} {wallet.primary ? "PRIMARY" : "WALLET"}</span>
            <strong>{shorten(wallet.address)}</strong>
            <Button variant="ghost" size="sm" onClick={() => onCopyAddress(wallet.address)}>{copiedAddress === wallet.address ? "Copied" : "Copy"}</Button>
          </div>
        ))}
      </div>
    </RailSection>
  );
}
