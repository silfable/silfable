export const WEB_EVM_CHAINS = [
  { key: "robinhood", chainId: 4_663, name: "Robinhood Chain", nativeSymbol: "ETH", explorerUrl: "https://robinhoodchain.blockscout.com" },
  { key: "ethereum", chainId: 1, name: "Ethereum", nativeSymbol: "ETH", explorerUrl: "https://etherscan.io" },
  { key: "base", chainId: 8_453, name: "Base", nativeSymbol: "ETH", explorerUrl: "https://basescan.org" },
  { key: "arbitrum", chainId: 42_161, name: "Arbitrum One", nativeSymbol: "ETH", explorerUrl: "https://arbiscan.io" },
  { key: "optimism", chainId: 10, name: "Optimism", nativeSymbol: "ETH", explorerUrl: "https://optimistic.etherscan.io" },
  { key: "polygon", chainId: 137, name: "Polygon", nativeSymbol: "POL", explorerUrl: "https://polygonscan.com" },
  { key: "avalanche", chainId: 43_114, name: "Avalanche C-Chain", nativeSymbol: "AVAX", explorerUrl: "https://snowtrace.io" },
] as const;

export type WebEvmChainKey = (typeof WEB_EVM_CHAINS)[number]["key"];

export function getWebEvmChain(key: string) {
  return WEB_EVM_CHAINS.find((chain) => chain.key === key) ?? null;
}

