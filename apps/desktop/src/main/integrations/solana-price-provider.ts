const BASE_URL = "https://api.geckoterminal.com/api/v2";
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_ADDRESSES = 30;

type FetchLike = typeof fetch;

export type SolanaUsdPriceEvidence = Readonly<{
  source: "coingecko-onchain";
  fetchedAt: string;
  prices: ReadonlyMap<string, number>;
}>;

export async function fetchSolanaUsdPrices(
  tokenAddresses: readonly string[],
  options: { fetchFn?: FetchLike; now?: () => Date; timeoutMs?: number } = {},
): Promise<SolanaUsdPriceEvidence | null> {
  const addresses = [...new Set(tokenAddresses)]
    .filter((address) => ADDRESS_PATTERN.test(address))
    .slice(0, MAX_ADDRESSES);
  if (addresses.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await (options.fetchFn ?? fetch)(
      `${BASE_URL}/simple/networks/solana/token_price/${addresses.join(",")}`,
      { method: "GET", headers: { accept: "application/json" }, signal: controller.signal },
    );
    if (!response.ok) throw new Error(`Solana price provider failed with HTTP ${response.status}.`);
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) throw new Error("Solana price provider returned invalid evidence.");
    const data = Reflect.get(body, "data");
    const attributes = typeof data === "object" && data !== null ? Reflect.get(data, "attributes") : null;
    const rawPrices = typeof attributes === "object" && attributes !== null ? Reflect.get(attributes, "token_prices") : null;
    if (typeof rawPrices !== "object" || rawPrices === null || Array.isArray(rawPrices)) {
      throw new Error("Solana price provider response is missing token prices.");
    }
    const prices = new Map<string, number>();
    for (const [address, rawPrice] of Object.entries(rawPrices as Record<string, unknown>)) {
      if (!ADDRESS_PATTERN.test(address) || typeof rawPrice !== "string") continue;
      const price = Number(rawPrice);
      if (Number.isFinite(price) && price >= 0) prices.set(address, price);
    }
    if (prices.size === 0) return null;
    return {
      source: "coingecko-onchain",
      fetchedAt: (options.now ?? (() => new Date()))().toISOString(),
      prices,
    };
  } finally {
    clearTimeout(timeout);
  }
}
