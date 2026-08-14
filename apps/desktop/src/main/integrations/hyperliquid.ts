export type HyperliquidEnvironment = "mainnet" | "testnet";

export type HyperliquidOrderType = "market" | "limit" | "stop_loss" | "take_profit";

export type HyperliquidOrderRequest = {
  coin: string; // e.g. "BTC", "ETH", "SOL"
  isBuy: boolean; // true = Long, false = Short
  limitPrice: number;
  size: number;
  orderType: HyperliquidOrderType;
  reduceOnly?: boolean;
};

export type HyperliquidOrderResponse = {
  status: "ok" | "err";
  response?: {
    type: "order";
    data: {
      statuses: Array<{
        resting?: { oid: number };
        filled?: { totalSz: string; avgPx: string; oid: number };
        error?: string;
      }>;
    };
  };
  error?: string;
};

export class HyperliquidClientService {
  readonly #baseUrl: string;
  readonly #env: HyperliquidEnvironment;
  readonly #fetch: typeof fetch;
  readonly #metadataCircuit: ProviderCircuitBreaker;

  constructor(
    env: HyperliquidEnvironment = "mainnet",
    fetcher: typeof fetch = globalThis.fetch,
    metadataCircuit: ProviderCircuitBreaker = new ProviderCircuitBreaker({ name: "Hyperliquid metadata provider" }),
  ) {
    this.#env = env;
    this.#fetch = fetcher;
    this.#metadataCircuit = metadataCircuit;
    this.#baseUrl =
      env === "mainnet"
        ? "https://api.hyperliquid.xyz"
        : "https://api.hyperliquid-testnet.xyz";
  }

  getEnvironment(): HyperliquidEnvironment {
    return this.#env;
  }

  async getMetaData(): Promise<{ universe: Array<{ name: string; szDecimals: number; maxLeverage: number }> }> {
    try {
      this.#metadataCircuit.assertAvailable();
      const res = await this.#fetch(`${this.#baseUrl}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "meta" }),
      });
      if (!res.ok) throw new Error(`Hyperliquid metadata request failed (${res.status})`);
      const body = await res.json() as { universe?: unknown };
      if (!Array.isArray(body.universe)) throw new Error("Hyperliquid metadata response is invalid");
      const universe = body.universe.flatMap((item): Array<{ name: string; szDecimals: number; maxLeverage: number }> => {
        if (typeof item !== "object" || item === null) return [];
        const value = item as { name?: unknown; szDecimals?: unknown; maxLeverage?: unknown };
        if (
          typeof value.name !== "string" ||
          typeof value.szDecimals !== "number" ||
          !Number.isInteger(value.szDecimals) ||
          typeof value.maxLeverage !== "number" ||
          !Number.isFinite(value.maxLeverage)
        ) return [];
        return [{ name: value.name, szDecimals: value.szDecimals, maxLeverage: value.maxLeverage }];
      });
      if (universe.length === 0) throw new Error("Hyperliquid metadata contains no valid markets");
      this.#metadataCircuit.recordSuccess();
      return { universe };
    } catch (error) {
      this.#metadataCircuit.recordFailure();
      throw new Error(error instanceof Error ? error.message : "Hyperliquid metadata request failed");
    }
  }

  async placeOrder(
    agentAddress: string,
    signature: string,
    order: HyperliquidOrderRequest
  ): Promise<HyperliquidOrderResponse> {
    if (order.size <= 0) {
      return { status: "err", error: "Order size must be greater than zero." };
    }
    if (order.limitPrice <= 0) {
      return { status: "err", error: "Limit price must be greater than zero." };
    }

    void agentAddress;
    void signature;
    // Hyperliquid requires a venue-specific action signature with canonical
    // asset IDs, nonce, expiry, and agent-wallet approval. This generic
    // adapter has none of that evidence and must never fabricate an order.
    throw new Error("Hyperliquid live order execution is not configured. Prepare and review a venue-signed order through the dedicated integration.");
  }
}
import { ProviderCircuitBreaker } from "./provider-circuit-breaker.js";
