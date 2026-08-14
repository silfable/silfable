const ZERO_EX_SWAP_CHAINS_URL = "https://api.0x.org/swap/chains";
const ROBINHOOD_CHAIN_ID = 4663;

type Fetch = typeof globalThis.fetch;

/** Read-only 0x capability check. It never asks 0x for calldata or a transaction. */
export async function verifyZeroExRobinhoodSupport(apiKey: string, fetcher: Fetch = globalThis.fetch): Promise<{ chainId: 4663 }> {
  if (apiKey.trim().length < 8) throw new Error("0x API key is unavailable");
  let response: Response;
  try {
    response = await fetcher(ZERO_EX_SWAP_CHAINS_URL, {
      headers: { "0x-api-key": apiKey, "0x-version": "v2" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("0x API is temporarily unavailable");
  }
  if (!response.ok) throw new Error(`0x API rejected the capability check (${response.status})`);
  const body: unknown = await response.json().catch(() => null);
  if (!hasRobinhoodChain(body)) throw new Error("0x Swap API does not currently report Robinhood Chain support");
  return { chainId: ROBINHOOD_CHAIN_ID };
}

function hasRobinhoodChain(body: unknown): boolean {
  if (typeof body !== "object" || body === null || !Array.isArray((body as { chains?: unknown }).chains)) return false;
  return (body as { chains: unknown[] }).chains.some((chain) =>
    typeof chain === "object" && chain !== null && (chain as { chainId?: unknown }).chainId === ROBINHOOD_CHAIN_ID,
  );
}
