import type { EvmChainKey } from "@silfable/contracts";

import { getEvmChain } from "./evm-chains.js";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/u;
const RAW_AMOUNT_PATTERN = /^[1-9]\d*$/u;
const KYBER_BASE_URL = "https://aggregator-api.kyberswap.com";

type Fetcher = typeof fetch;

export type KyberSwapQuote = {
  provider: "kyberswap";
  chainKey: EvmChainKey;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  minimumAmountOut: string;
  routerAddress: `0x${string}`;
  routeNames: string[];
  quoteId: string;
  createdAt: string;
  expiresAt: string;
};

/**
 * A provider-built transaction plan. The calldata remains main-process only;
 * consumers receive this object solely through the preflight service.
 */
export type KyberSwapBuild = {
  provider: "kyberswap";
  quoteId: string;
  chainKey: EvmChainKey;
  chainId: number;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  routerAddress: `0x${string}`;
  transactionTarget: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  calldata: `0x${string}`;
  valueWei: bigint;
  amountIn: string;
  amountOut: string;
  minimumAmountOut: string;
  expiresAt: string;
};

type StoredRoute = {
  quote: KyberSwapQuote;
  routeSummary: Record<string, unknown>;
};

export class KyberSwapQuoteService {
  readonly #fetcher: Fetcher;
  readonly #routes = new Map<string, StoredRoute>();

  constructor(fetcher: Fetcher = fetch) {
    this.#fetcher = fetcher;
  }

  async quote(input: {
    chainKey: EvmChainKey;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    slippageBps: number;
  }): Promise<KyberSwapQuote> {
    const chain = getEvmChain(input.chainKey);
    if (chain.quoteProvider !== "kyberswap") throw new Error(`${chain.name} does not use KyberSwap in this release`);
    if (chain.kyberSlug === null) throw new Error(`${chain.name} does not have a KyberSwap route`);
    assertAddress(input.tokenIn, "input token");
    assertAddress(input.tokenOut, "output token");
    if (input.tokenIn.toLowerCase() === input.tokenOut.toLowerCase()) throw new Error("Input and output token must be different");
    if (!RAW_AMOUNT_PATTERN.test(input.amountIn)) throw new Error("Input amount must be a positive raw integer");
    if (!Number.isInteger(input.slippageBps) || input.slippageBps < 0 || input.slippageBps > 1_000) throw new Error("Slippage must be between 0 and 1000 bps");

    const url = new URL(`${KYBER_BASE_URL}/${chain.kyberSlug}/api/v1/routes`);
    url.searchParams.set("tokenIn", input.tokenIn);
    url.searchParams.set("tokenOut", input.tokenOut);
    url.searchParams.set("amountIn", input.amountIn);
    const response = await this.#fetcher(url, {
      headers: { Accept: "application/json", "x-client-id": "Silfable" },
      signal: AbortSignal.timeout(20_000),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(kyberError(response.status, body));
    const envelope = asRecord(body);
    const data = asRecord(envelope.data);
    const routeSummary = asRecord(data.routeSummary);
    const routerAddress = requiredAddress(data.routerAddress, "KyberSwap router");
    const amountIn = requiredRaw(routeSummary.amountIn, "KyberSwap input amount");
    const amountOut = requiredRaw(routeSummary.amountOut, "KyberSwap output amount");
    if (amountIn !== input.amountIn) throw new Error("KyberSwap returned a mismatched input amount");

    const quoteId = crypto.randomUUID();
    const createdAt = new Date();
    const minimumAmountOut = ((BigInt(amountOut) * BigInt(10_000 - input.slippageBps)) / 10_000n).toString();
    if (minimumAmountOut === "0") throw new Error("KyberSwap minimum output is zero");
    const quote: KyberSwapQuote = {
      provider: "kyberswap",
      chainKey: chain.key,
      chainId: chain.chainId,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn,
      amountOut,
      minimumAmountOut,
      routerAddress,
      routeNames: extractRouteNames(routeSummary),
      quoteId,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + 60_000).toISOString(),
    };
    this.#prune(createdAt.getTime());
    this.#routes.set(quoteId, { quote, routeSummary });
    return quote;
  }

  /**
   * Returns the exact provider route only to trusted main-process callers.
   * Renderer and AI responses receive bounded quote evidence, never this object.
   */
  consumeRoute(quoteId: string): StoredRoute {
    const stored = this.#routes.get(quoteId);
    this.#routes.delete(quoteId);
    if (stored === undefined) throw new Error("KyberSwap quote is unavailable or already consumed");
    if (Date.parse(stored.quote.expiresAt) <= Date.now()) throw new Error("KyberSwap quote expired; request a fresh quote");
    return stored;
  }

  /**
   * Builds the exact quote into Kyber calldata. This endpoint is deliberately
   * separate from quoting: a quote never grants a transaction payload and a
   * build never authorizes signing or broadcast.
   */
  async build(input: {
    quoteId: string;
    sender: string;
    recipient?: string;
    slippageBps: number;
  }): Promise<KyberSwapBuild> {
    assertAddress(input.sender, "sender");
    const recipient = input.recipient ?? input.sender;
    assertAddress(recipient, "recipient");
    if (!Number.isInteger(input.slippageBps) || input.slippageBps < 0 || input.slippageBps > 1_000) {
      throw new Error("Slippage must be between 0 and 1000 bps");
    }

    const stored = this.#routes.get(input.quoteId);
    if (stored === undefined) throw new Error("KyberSwap quote is unavailable or already consumed");
    if (Date.parse(stored.quote.expiresAt) <= Date.now()) {
      this.#routes.delete(input.quoteId);
      throw new Error("KyberSwap quote expired; request a fresh quote");
    }
    const chain = getEvmChain(stored.quote.chainKey);
    if (chain.kyberSlug === null) throw new Error(`${chain.name} does not have a KyberSwap route`);
    const response = await this.#fetcher(`${KYBER_BASE_URL}/${chain.kyberSlug}/api/v1/route/build`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "content-type": "application/json",
        "x-client-id": "Silfable",
      },
      body: JSON.stringify({
        routeSummary: stored.routeSummary,
        sender: input.sender,
        recipient,
        // Kyber V1 accepts percentage points, whereas Silfable stores bps.
        slippageTolerance: input.slippageBps / 100,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(kyberError(response.status, body));
    const envelope = asRecord(body);
    const data = asRecord(envelope.data);
    const routerAddress = requiredAddress(data.routerAddress, "KyberSwap build router");
    if (routerAddress.toLowerCase() !== stored.quote.routerAddress.toLowerCase()) {
      throw new Error("KyberSwap build returned a router different from the quoted router");
    }
    const calldata = requiredHex(data.data, "KyberSwap build calldata");
    const amountIn = requiredRaw(data.amountIn ?? stored.quote.amountIn, "KyberSwap build input amount");
    if (amountIn !== stored.quote.amountIn) throw new Error("KyberSwap build returned a mismatched input amount");
    const valueWei = optionalRaw(data.transactionValue ?? data.value, "KyberSwap build value");

    // A build can only be used once. Keeping it in memory until this point
    // allows a transient provider failure to be retried from the same quote.
    this.#routes.delete(input.quoteId);
    return {
      provider: "kyberswap",
      quoteId: stored.quote.quoteId,
      chainKey: stored.quote.chainKey,
      chainId: stored.quote.chainId,
      sender: input.sender,
      recipient,
      routerAddress,
      transactionTarget: routerAddress,
      tokenIn: stored.quote.tokenIn as `0x${string}`,
      tokenOut: stored.quote.tokenOut as `0x${string}`,
      calldata,
      valueWei: BigInt(valueWei ?? "0"),
      amountIn,
      amountOut: stored.quote.amountOut,
      minimumAmountOut: stored.quote.minimumAmountOut,
      expiresAt: stored.quote.expiresAt,
    };
  }

  #prune(now: number): void {
    for (const [id, route] of this.#routes) {
      if (Date.parse(route.quote.expiresAt) <= now) this.#routes.delete(id);
    }
  }
}

function extractRouteNames(routeSummary: Record<string, unknown>): string[] {
  const names = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    for (const key of ["exchange", "exchangeName", "poolType"]) {
      if (typeof record[key] === "string" && record[key]!.length > 0) names.add(String(record[key]).slice(0, 80));
    }
    if (record.route !== undefined) visit(record.route);
    if (record.routeSummary !== undefined) visit(record.routeSummary);
  };
  visit(routeSummary.route);
  return [...names].slice(0, 20);
}

function assertAddress(value: string, label: string): asserts value is `0x${string}` {
  if (!ADDRESS_PATTERN.test(value)) throw new Error(`${label} must be an exact EVM address`);
}

function requiredAddress(value: unknown, label: string): `0x${string}` {
  if (typeof value !== "string") throw new Error(`${label} is missing`);
  assertAddress(value, label);
  return value;
}

function requiredRaw(value: unknown, label: string): string {
  if (typeof value !== "string" || !RAW_AMOUNT_PATTERN.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function optionalRaw(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !/^\d+$/u.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function requiredHex(value: unknown, label: string): `0x${string}` {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/u.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as `0x${string}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("KyberSwap returned an invalid response");
  return value as Record<string, unknown>;
}

function kyberError(status: number, body: unknown): string {
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const message = typeof record.message === "string"
    ? record.message
    : typeof record.error === "string"
      ? record.error
      : "request failed";
  return `KyberSwap quote failed (${status}): ${message.slice(0, 240)}`;
}
