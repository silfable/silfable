import { BRIDGE_ROBINHOOD_USDG_ADDRESS, type EvmChainKey } from "@silfable/contracts";

import { getEvmChain } from "./evm-chains.js";

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/u;
const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_ADDRESSES = 12;

export type EvmUsdPriceEvidence = Readonly<{
  source: "coingecko-onchain" | "coingecko-spot";
  fetchedAt: string;
  nativeAddress: `0x${string}`;
  prices: ReadonlyMap<string, number>;
}>;

type FetchLike = typeof fetch;

function readTokenPrices(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("EVM price provider returned an invalid response.");
  const data = Reflect.get(value, "data");
  if (typeof data !== "object" || data === null) throw new Error("EVM price provider response is missing data.");
  const attributes = Reflect.get(data, "attributes");
  if (typeof attributes !== "object" || attributes === null) throw new Error("EVM price provider response is missing attributes.");
  const tokenPrices = Reflect.get(attributes, "token_prices");
  if (typeof tokenPrices !== "object" || tokenPrices === null || Array.isArray(tokenPrices)) {
    throw new Error("EVM price provider response is missing token prices.");
  }
  return tokenPrices as Record<string, unknown>;
}

export async function fetchEvmUsdPrices(
  input: {
    chainKey: EvmChainKey;
    tokenAddresses: readonly string[];
  },
  options: {
    fetchFn?: FetchLike;
    now?: () => Date;
    timeoutMs?: number;
  } = {},
): Promise<EvmUsdPriceEvidence | null> {
  const chain = getEvmChain(input.chainKey);
  if (chain.wrappedNativeAddress === null) return null;
  if (chain.priceNetwork === null) {
    if (chain.key !== "robinhood") return null;
    return await fetchRobinhoodEthUsdPrice(chain.wrappedNativeAddress, options);
  }

  const addresses = [...new Set([
    chain.wrappedNativeAddress.toLowerCase(),
    ...input.tokenAddresses.map((address) => address.toLowerCase()),
  ])].filter((address) => ADDRESS_PATTERN.test(address)).slice(0, MAX_ADDRESSES);
  if (addresses.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await (options.fetchFn ?? fetch)(
      `${BASE_URL}/simple/networks/${encodeURIComponent(chain.priceNetwork)}/token_price/${addresses.join(",")}`,
      {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`EVM price provider failed with HTTP ${response.status}.`);
    const rawPrices = readTokenPrices(await response.json());
    const prices = new Map<string, number>();
    for (const [address, rawPrice] of Object.entries(rawPrices)) {
      const normalized = address.toLowerCase();
      if (!ADDRESS_PATTERN.test(normalized) || typeof rawPrice !== "string") continue;
      const price = Number(rawPrice);
      if (Number.isFinite(price) && price >= 0) prices.set(normalized, price);
    }
    if (prices.size === 0) return null;
    return {
      source: "coingecko-onchain",
      fetchedAt: (options.now ?? (() => new Date()))().toISOString(),
      nativeAddress: chain.wrappedNativeAddress,
      prices,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildRobinhoodEvidence(nativeAddress: `0x${string}`, ethPrice: number, nowStr: string): EvmUsdPriceEvidence {
  const prices = new Map<string, number>([
    ["0x0000000000000000000000000000000000000000", ethPrice],
    ["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", ethPrice],
    [nativeAddress.toLowerCase(), ethPrice],
    [BRIDGE_ROBINHOOD_USDG_ADDRESS.toLowerCase(), 1.0],
  ]);
  return {
    source: "coingecko-spot",
    fetchedAt: nowStr,
    nativeAddress,
    prices,
  };
}

async function fetchRobinhoodEthUsdPrice(
  nativeAddress: `0x${string}`,
  options: { fetchFn?: FetchLike; now?: () => Date; timeoutMs?: number },
): Promise<EvmUsdPriceEvidence | null> {
  const fetchFn = options.fetchFn ?? fetch;
  const nowStr = (options.now ?? (() => new Date()))().toISOString();

  // Try CoinGecko spot first
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const res = await fetchFn(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { method: "GET", headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, signal: controller.signal },
    ).finally(() => clearTimeout(timeout));
    if (res.ok) {
      const body = await res.json() as { ethereum?: { usd?: unknown } };
      const price = typeof body.ethereum?.usd === "number" ? body.ethereum.usd : Number(body.ethereum?.usd);
      if (Number.isFinite(price) && price > 0) {
        return buildRobinhoodEvidence(nativeAddress, price, nowStr);
      }
    }
  } catch {
    // Fallthrough to Coinbase fallback
  }

  // Coinbase fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const res = await fetchFn("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (res.ok) {
      const body = await res.json() as { data?: { amount?: string } };
      const price = Number(body.data?.amount);
      if (Number.isFinite(price) && price > 0) {
        return buildRobinhoodEvidence(nativeAddress, price, nowStr);
      }
    }
  } catch {
    // Fallthrough to Binance fallback
  }

  // Binance fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const res = await fetchFn("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT", {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (res.ok) {
      const body = await res.json() as { price?: string };
      const price = Number(body.price);
      if (Number.isFinite(price) && price > 0) {
        return buildRobinhoodEvidence(nativeAddress, price, nowStr);
      }
    }
  } catch {
    // Fallthrough
  }

  return buildRobinhoodEvidence(nativeAddress, 0, nowStr);
}
