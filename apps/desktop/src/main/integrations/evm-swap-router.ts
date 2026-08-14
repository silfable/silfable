import type { EvmChainKey } from "@silfable/contracts";

import type { KyberSwapBuild, KyberSwapQuote } from "./kyberswap.js";
import { KyberSwapQuoteService } from "./kyberswap.js";
import type { UniswapBuild, UniswapQuote } from "./uniswap.js";
import { UniswapQuoteService } from "./uniswap.js";
import { getEvmChain } from "./evm-chains.js";

export type EvmSwapQuote = KyberSwapQuote | UniswapQuote;
export type EvmSwapBuild = (KyberSwapBuild | UniswapBuild) & { approvalSpender: `0x${string}` };

/** Provider selection is code-pinned by chain; model output cannot select it. */
export class EvmSwapRouterService {
  readonly #providerByQuoteId = new Map<string, "kyberswap" | "uniswap">();

  constructor(
    readonly kyber: KyberSwapQuoteService,
    readonly uniswap: UniswapQuoteService,
  ) {}

  async quote(input: {
    chainKey: EvmChainKey;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    slippageBps: number;
    swapper: string;
  }): Promise<EvmSwapQuote> {
    const chain = getEvmChain(input.chainKey);
    const quote = chain.quoteProvider === "uniswap"
      ? await this.uniswap.quote(input)
      : await this.kyber.quote(input);
    this.#providerByQuoteId.set(quote.quoteId, quote.provider);
    return quote;
  }

  async build(input: { quoteId: string; sender: string; recipient?: string; slippageBps: number }): Promise<EvmSwapBuild> {
    const provider = this.#providerByQuoteId.get(input.quoteId);
    if (provider === undefined) throw new Error("EVM quote is unavailable or expired; request a fresh quote");
    const build = provider === "uniswap"
      ? await this.uniswap.build(input)
      : await this.kyber.build(input);
    return "approvalSpender" in build
      ? build
      : { ...build, approvalSpender: build.routerAddress };
  }
}
