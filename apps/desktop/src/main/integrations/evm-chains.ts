import type { EvmChainId, EvmChainKey } from "@silfable/contracts";

export type EvmChainDefinition = Readonly<{
  key: EvmChainKey;
  chainId: EvmChainId;
  name: string;
  nativeSymbol: string;
  explorerUrl: string;
  kyberSlug: string | null;
  priceNetwork: string | null;
  wrappedNativeAddress: `0x${string}` | null;
  defaultRpcUrl: `https://${string}`;
  /**
   * Public read/preflight fallbacks. Every candidate is independently checked
   * against the pinned chain ID before it is used.
   */
  fallbackRpcUrls?: readonly `https://${string}`[];
  rpcSecretName: "robinhood-rpc-url";
  quoteProvider: "kyberswap" | "uniswap";
  universalRouterAddress?: `0x${string}`;
  universalRouterVersion?: "2.1.1";
  executionStatus: "release-gated";
}>;

const CHAINS: readonly EvmChainDefinition[] = [
  {
    key: "robinhood",
    chainId: 4_663,
    name: "Robinhood Chain",
    nativeSymbol: "ETH",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    kyberSlug: "robinhood",
    priceNetwork: null,
    wrappedNativeAddress: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    defaultRpcUrl: "https://hood-rpc.pastrylabs.cloud/",
    // The official public endpoint can be temporarily unavailable. This is a
    // read/preflight fallback only; the runtime proves chain ID 4663 and a
    // fresh block read before using it for any quote, estimate, simulation,
    // or one-attempt broadcast.
    fallbackRpcUrls: [
      "https://rpc.mainnet.chain.robinhood.com",
      "https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public",
    ],
    rpcSecretName: "robinhood-rpc-url",
    // KyberSwap does not index every Robinhood asset. Robinhood is therefore
    // deliberately pinned to the separately allowlisted Uniswap adapter.
    quoteProvider: "uniswap",
    universalRouterAddress: "0x8876789976decbfcbbbe364623c63652db8c0904",
    universalRouterVersion: "2.1.1",
    executionStatus: "release-gated",
  },
] as const;

const BY_KEY = new Map<EvmChainKey, EvmChainDefinition>(CHAINS.map((chain) => [chain.key, chain]));

export function listEvmChains(): readonly EvmChainDefinition[] {
  return CHAINS;
}

export function getEvmChain(key: EvmChainKey): EvmChainDefinition {
  const chain = BY_KEY.get(key);
  if (chain === undefined) throw new Error(`Unsupported EVM chain: ${key}`);
  return chain;
}
