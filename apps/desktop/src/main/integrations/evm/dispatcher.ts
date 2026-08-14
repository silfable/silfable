import type { CrossChainVenueProvider, SupportedChainType } from "./provider.js";

export class CrossChainExecutionDispatcher {
  readonly #providers = new Map<string, CrossChainVenueProvider>();

  registerProvider(chainKey: string, provider: CrossChainVenueProvider): void {
    this.#providers.set(chainKey, provider);
  }

  getProvider(chainKey: string): CrossChainVenueProvider {
    const provider = this.#providers.get(chainKey);
    if (!provider) throw new Error(`Unsupported cross-chain provider for: ${chainKey}`);
    return provider;
  }

  validateAddressForChain(chainKey: string, address: string): boolean {
    const provider = this.getProvider(chainKey);
    return provider.validateAddress(address);
  }

  listRegisteredChains(): Array<{ chainKey: string; chainType: SupportedChainType; chainId: string | number }> {
    return [...this.#providers.entries()].map(([chainKey, provider]) => ({
      chainKey,
      chainType: provider.chainType,
      chainId: provider.chainId,
    }));
  }
}
