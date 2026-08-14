import {
  BRIDGE_ROBINHOOD_CHAIN_ID,
  BRIDGE_ROBINHOOD_USDG_ADDRESS,
  BRIDGE_SOLANA_CHAIN_ID,
  BRIDGE_SOLANA_USDC_MINT,
  type EvmChainKey,
} from "@silfable/contracts";

/**
 * Release-controlled route metadata shared by the Solana and EVM bridge
 * adapters.  It deliberately describes only canonical stablecoin routes.
 * A route being present here is not authority to sign or broadcast: the
 * adapter must still obtain provider transaction evidence, simulate it, and
 * pass its source-chain execution gate.
 */
export type CrossChainBridgeAsset = Readonly<{
  chainKey: "solana" | EvmChainKey;
  chainId: number;
  address: string;
  symbol: "USDC" | "USDG";
  decimals: 6;
}>;

export type CrossChainBridgeRoute = Readonly<{
  id: string;
  source: CrossChainBridgeAsset;
  destination: CrossChainBridgeAsset;
  /** Current adapter maturity, never a permission flag. */
  sourceExecution: "solana-live" | "evm-release-gated";
  providers: readonly ("debridge-dln" | "relay")[];
}>;

const solanaUsdc: CrossChainBridgeAsset = {
  chainKey: "solana",
  chainId: BRIDGE_SOLANA_CHAIN_ID,
  address: BRIDGE_SOLANA_USDC_MINT,
  symbol: "USDC",
  decimals: 6,
};

const evmAssets: readonly CrossChainBridgeAsset[] = [
  { chainKey: "robinhood", chainId: BRIDGE_ROBINHOOD_CHAIN_ID, address: BRIDGE_ROBINHOOD_USDG_ADDRESS, symbol: "USDG", decimals: 6 },
];

const routeId = (source: CrossChainBridgeAsset, destination: CrossChainBridgeAsset) =>
  `${source.chainKey}-${source.symbol.toLowerCase()}-to-${destination.chainKey}-${destination.symbol.toLowerCase()}`;

const routes: CrossChainBridgeRoute[] = [];

// Proven Solana source route family.  Robinhood remains Relay-only because
// the destination asset is USDG rather than canonical USDC.
for (const destination of evmAssets) {
  routes.push({
    id: routeId(solanaUsdc, destination),
    source: solanaUsdc,
    destination,
    sourceExecution: "solana-live",
    providers: destination.chainKey === "robinhood" ? ["relay"] : ["debridge-dln", "relay"],
  });
}

// EVM source routes are a separate execution boundary. They are intentionally
// release-gated until their own provider-payload adapter, signer simulation,
// source confirmation and destination reconciliation acceptance tests pass.
for (const source of evmAssets) {
  routes.push({
    id: routeId(source, solanaUsdc),
    source,
    destination: solanaUsdc,
    sourceExecution: "evm-release-gated",
    providers: ["debridge-dln", "relay"],
  });
  for (const destination of evmAssets) {
    if (source.chainId === destination.chainId) continue;
    routes.push({
      id: routeId(source, destination),
      source,
      destination,
      sourceExecution: "evm-release-gated",
      providers: ["debridge-dln", "relay"],
    });
  }
}

export const CROSS_CHAIN_BRIDGE_ROUTES: readonly CrossChainBridgeRoute[] = routes;

export function listCrossChainBridgeDestinations(sourceChain: "solana" | EvmChainKey): readonly CrossChainBridgeRoute[] {
  return CROSS_CHAIN_BRIDGE_ROUTES.filter((route) => route.source.chainKey === sourceChain);
}

export function resolveCrossChainBridgeRoute(
  sourceChainId: number,
  sourceAssetAddress: string,
  destinationChainId: number,
  destinationAssetAddress: string,
): CrossChainBridgeRoute {
  const route = CROSS_CHAIN_BRIDGE_ROUTES.find((candidate) =>
    candidate.source.chainId === sourceChainId
    && candidate.destination.chainId === destinationChainId
    && candidate.source.address.toLowerCase() === sourceAssetAddress.toLowerCase()
    && candidate.destination.address.toLowerCase() === destinationAssetAddress.toLowerCase(),
  );
  if (route === undefined) {
    throw new Error("This source asset and destination asset pair is not in the release-controlled bridge registry.");
  }
  return route;
}
