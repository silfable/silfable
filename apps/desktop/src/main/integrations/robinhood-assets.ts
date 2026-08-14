import { isAddress, type Address } from "viem";

const ASSETS_URL = "https://api.robinhood.com/rhj/assets";
const ROBINHOOD_CHAIN_ID = 4663;
type Fetch = typeof globalThis.fetch;

export type RobinhoodVerifiedAsset = { contractAddress: Address; symbol: string; name: string; multiplier: string };

/** Resolves active official Robinhood Stock Token contracts; unknown tokens fail closed. */
export async function resolveRobinhoodVerifiedAssets(addresses: readonly string[], fetcher: Fetch = globalThis.fetch): Promise<RobinhoodVerifiedAsset[]> {
  if (addresses.length === 0 || addresses.length > 2 || addresses.some((address) => !isAddress(address))) throw new Error("Robinhood asset addresses are invalid");
  let response: Response;
  try { response = await fetcher(ASSETS_URL, { signal: AbortSignal.timeout(10_000) }); }
  catch { throw new Error("Robinhood asset registry is temporarily unavailable"); }
  if (!response.ok) throw new Error(`Robinhood asset registry rejected the request (${response.status})`);
  const assets = parseAssets(await response.json().catch(() => null));
  return addresses.map((address) => {
    const found = assets.get(address.toLowerCase());
    if (found === undefined) throw new Error("Token is not an active official Robinhood Chain Stock Token");
    return found;
  });
}

function parseAssets(value: unknown): Map<string, RobinhoodVerifiedAsset> {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { assets?: unknown }).assets)) throw new Error("Robinhood asset registry returned invalid data");
  const result = new Map<string, RobinhoodVerifiedAsset>();
  for (const candidate of (value as { assets: unknown[] }).assets.slice(0, 1_000)) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const asset = candidate as Record<string, unknown>;
    if (asset.status !== "ASSET_STATUS_ACTIVE" || typeof asset.tokenSymbol !== "string" || typeof asset.tokenName !== "string" || typeof asset.currentMultiplier !== "string" || !Array.isArray(asset.deployments)) continue;
    for (const deployment of asset.deployments) {
      if (typeof deployment !== "object" || deployment === null) continue;
      const entry = deployment as { chainId?: unknown; contractAddress?: unknown };
      if (entry.chainId === ROBINHOOD_CHAIN_ID && typeof entry.contractAddress === "string" && isAddress(entry.contractAddress)) {
        result.set(entry.contractAddress.toLowerCase(), { contractAddress: entry.contractAddress, symbol: asset.tokenSymbol.slice(0, 32), name: asset.tokenName.slice(0, 128), multiplier: asset.currentMultiplier });
      }
    }
  }
  return result;
}
