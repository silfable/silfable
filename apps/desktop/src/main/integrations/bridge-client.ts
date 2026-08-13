export type ChainId = 7565164 | 1 | 42161 | 8453; // Solana (7565164 in deBridge), Ethereum (1), Arbitrum (42161), Base (8453)

export type BridgeQuoteRequest = {
  srcChainId: ChainId;
  srcChainTokenIn: string;
  amountIn: string;
  dstChainId: ChainId;
  dstChainTokenOut: string;
  dstChainTokenOutRecipient: string;
};

export type BridgeQuoteResponse = {
  quoteId: string;
  srcChainId: ChainId;
  dstChainId: ChainId;
  amountIn: string;
  estimatedAmountOut: string;
  estimatedFeeUsd: number;
  estimatedTimeSeconds: number;
  bridgeRoute: string;
  txPayload?: {
    to: string;
    data: string;
    value: string;
  };
};

export class BridgeClientService {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #circuit: ProviderCircuitBreaker;

  constructor(
    baseUrl: string = "https://deswap.debridge.finance/v1.0",
    fetcher: typeof fetch = globalThis.fetch,
    circuit: ProviderCircuitBreaker = new ProviderCircuitBreaker({ name: "Bridge quote provider" }),
  ) {
    this.#baseUrl = baseUrl;
    this.#fetch = fetcher;
    this.#circuit = circuit;
  }

  async getQuote(req: BridgeQuoteRequest): Promise<BridgeQuoteResponse> {
    if (req.srcChainId === req.dstChainId) {
      throw new Error("Source and destination chains must be different for cross-chain bridge.");
    }
    if (BigInt(req.amountIn) <= 0n) {
      throw new Error("Amount in must be greater than zero.");
    }

    const searchParams = new URLSearchParams({
      srcChainId: req.srcChainId.toString(),
      srcChainTokenIn: req.srcChainTokenIn,
      srcChainAmount: req.amountIn,
      dstChainId: req.dstChainId.toString(),
      dstChainTokenOut: req.dstChainTokenOut,
      dstChainTokenOutRecipient: req.dstChainTokenOutRecipient,
    });

    try {
      this.#circuit.assertAvailable();
      const response = await this.#fetch(`${this.#baseUrl}/dln/order/create-tx?${searchParams.toString()}`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        throw new Error(`Bridge quote request failed (${response.status})`);
      }
      const data = await response.json() as { estimation?: { id?: unknown; dstChainTokenOut?: { amount?: unknown }; costsDetails?: { totalFeeUsd?: unknown } }; tx?: { to?: unknown; data?: unknown; value?: unknown } };
      if (typeof data.estimation?.dstChainTokenOut?.amount !== "string" || !/^\d+$/u.test(data.estimation.dstChainTokenOut.amount)) {
        throw new Error("Bridge quote response is missing a verified output amount");
      }
      const result: BridgeQuoteResponse = {
        quoteId: typeof data.estimation?.id === "string" ? data.estimation.id : crypto.randomUUID(),
        srcChainId: req.srcChainId,
        dstChainId: req.dstChainId,
        amountIn: req.amountIn,
        estimatedAmountOut: data.estimation.dstChainTokenOut.amount,
        estimatedFeeUsd: Number(data.estimation?.costsDetails?.totalFeeUsd ?? 0),
        estimatedTimeSeconds: 0,
        bridgeRoute: "deBridge DLN",
      };
      if (typeof data.tx?.to === "string" && typeof data.tx.data === "string" && typeof data.tx.value === "string") {
        result.txPayload = { to: data.tx.to, data: data.tx.data, value: data.tx.value };
      }
      this.#circuit.recordSuccess();
      return result;
    } catch (error) {
      this.#circuit.recordFailure();
      throw new Error(error instanceof Error ? error.message : "Bridge quote request failed");
    }
  }
}
import { ProviderCircuitBreaker } from "./provider-circuit-breaker.js";
