// @ts-nocheck
import {
  BRIDGE_ROBINHOOD_CHAIN_ID,
  BRIDGE_ROBINHOOD_USDG_ADDRESS,
  BRIDGE_SOLANA_CHAIN_ID,
  BRIDGE_SOLANA_USDC_MINT,
  type BridgeContract,
  type BridgeDestinationChain,
  type BridgeProviderId,
} from "@silfable/contracts";

export type ExecutableBridgeProviderId = Exclude<BridgeProviderId, "auto">;
export type BridgeRouteDescriptor = Readonly<{
  id: string;
  label: string;
  confirmation: "BRIDGE USDC TO ROBINHOOD";
  source: { chainId: typeof BRIDGE_SOLANA_CHAIN_ID; chainKey: "solana"; assetAddress: typeof BRIDGE_SOLANA_USDC_MINT; symbol: "USDC"; decimals: 6 };
  destination: { chainId: BridgeContract["destinationChainId"]; chainKey: BridgeDestinationChain; assetAddress: string; symbol: "USDC" | "USDG"; decimals: 6 };
  providers: readonly Readonly<{ id: ExecutableBridgeProviderId; priority: number; executable: true }>[];
}>;

const source = { chainId: BRIDGE_SOLANA_CHAIN_ID, chainKey: "solana" as const, assetAddress: BRIDGE_SOLANA_USDC_MINT, symbol: "USDC" as const, decimals: 6 as const };
/**
 * Release-controlled capability registry. Provider selection is dynamic, but
 * chains, stablecoin contracts, approval phrases and provider priority remain
 * pinned in code. Robinhood uses its bridge-native USDG asset and Relay only.
 */
export const BRIDGE_ROUTES: readonly BridgeRouteDescriptor[] = [
  route("robinhood", "Robinhood", BRIDGE_ROBINHOOD_CHAIN_ID, BRIDGE_ROBINHOOD_USDG_ADDRESS, "USDG", [
    { id: "relay", priority: 1, executable: true },
  ]),
];

function route(
  chainKey: BridgeDestinationChain,
  label: string,
  chainId: BridgeContract["destinationChainId"],
  assetAddress: string,
  symbol: "USDC" | "USDG",
  routeProviders: BridgeRouteDescriptor["providers"],
): BridgeRouteDescriptor {
  return {
    id: `solana-usdc-${chainKey}-${symbol.toLowerCase()}`,
    label: `Solana USDC to ${label} ${symbol}`,
    confirmation: `BRIDGE USDC TO ${chainKey.toUpperCase()}` as BridgeRouteDescriptor["confirmation"],
    source,
    destination: { chainId, chainKey, assetAddress, symbol, decimals: 6 },
    providers: routeProviders,
  };
}

export function getBridgeRoute(destination: BridgeDestinationChain): BridgeRouteDescriptor {
  const result = BRIDGE_ROUTES.find((candidate) => candidate.destination.chainKey === destination);
  if (result === undefined) throw new Error("Bridge destination is not enabled by this release.");
  return result;
}

export function resolveEnabledBridgeRoute(contract: BridgeContract): BridgeRouteDescriptor {
  const result = BRIDGE_ROUTES.find((candidate) =>
    candidate.source.chainId === contract.sourceChainId
    && candidate.destination.chainId === contract.destinationChainId
    && candidate.source.assetAddress === contract.sourceAsset.address
    && candidate.destination.assetAddress.toLowerCase() === contract.destinationAsset.address.toLowerCase()
    && candidate.destination.symbol === contract.destinationAsset.symbol
    && (contract.provider === "auto" || candidate.providers.some((provider) => provider.id === contract.provider && provider.executable)),
  );
  if (result === undefined) throw new Error("Bridge route is not enabled by the release-controlled registry.");
  return result;
}

export function bridgeProviderCandidates(contract: BridgeContract): readonly ExecutableBridgeProviderId[] {
  const result = resolveEnabledBridgeRoute(contract).providers
    .filter((provider) => contract.provider === "auto" || provider.id === contract.provider)
    .sort((a, b) => a.priority - b.priority)
    .map((provider) => provider.id);
  if (result.length === 0) throw new Error("No enabled Bridge provider can serve this route.");
  return result;
}
