import type { EvmChainKey } from "@silfable/contracts";

import { getEvmChain } from "./evm-chains.js";

const UNISWAP_BASE_URL = "https://trade-api.gateway.uniswap.org/v1";
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/u;
const HEX_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/u;
const RAW_AMOUNT_PATTERN = /^[1-9]\d*$/u;
export const UNISWAP_NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ROBINHOOD_UNIVERSAL_ROUTER = "0x8876789976decbfcbbbe364623c63652db8c0904" as const;
export const ROBINHOOD_UNIVERSAL_ROUTER_VERSION = "2.1.1" as const;
export const PERMIT2_ADDRESS = "0x000000000022d473030f116ddee9f6b43ac78ba3" as const;
export const UNISWAP_SWAP_PROXY_ADDRESS = "0x02e5be68d46dac0b524905bff209cf47ee6db2a9" as const;

type Fetcher = typeof fetch;

export type UniswapQuote = {
  provider: "uniswap";
  chainKey: EvmChainKey;
  chainId: number;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string;
  amountOut: string;
  minimumAmountOut: string;
  routerAddress: `0x${string}`;
  routeNames: string[];
  quoteId: string;
  createdAt: string;
  expiresAt: string;
};

export type UniswapBuild = {
  provider: "uniswap";
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
  approvalSpender: `0x${string}`;
  approvalTransaction?: {
    to: `0x${string}`;
    valueWei: bigint;
    calldata: `0x${string}`;
  };
  expiresAt: string;
};

type StoredQuote = { evidence: UniswapQuote; apiQuote: Record<string, unknown> };

/**
 * Official Uniswap Trading API adapter for Robinhood Chain. It deliberately
 * requests only Classic v2/v3/v4 routes and disables Permit2 so Silfable can
 * preserve its existing explicit approval -> fresh simulation -> swap flow.
 */
export class UniswapQuoteService {
  readonly #fetcher: Fetcher;
  readonly #apiKey: () => Promise<string | null>;
  readonly #quotes = new Map<string, StoredQuote>();

  constructor(input: { apiKey: () => Promise<string | null>; fetcher?: Fetcher }) {
    this.#apiKey = input.apiKey;
    this.#fetcher = input.fetcher ?? fetch;
  }

  async testAccess(): Promise<void> {
    const response = await this.#request("/supported_chains", { method: "GET" });
    if (!JSON.stringify(response).includes("4663")) {
      throw new Error("Uniswap Trading API did not report Robinhood Chain support");
    }
  }

  async quote(input: {
    chainKey: EvmChainKey;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    slippageBps: number;
    swapper: string;
  }): Promise<UniswapQuote> {
    const chain = getEvmChain(input.chainKey);
    if (chain.quoteProvider !== "uniswap" || chain.chainId !== 4_663) {
      throw new Error(`${chain.name} does not use the Uniswap adapter in this release`);
    }
    const tokenIn = normalizeToken(input.tokenIn);
    const tokenOut = normalizeToken(input.tokenOut);
    const swapper = requiredAddress(input.swapper, "Uniswap swapper");
    if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) throw new Error("Input and output token must be different");
    if (!RAW_AMOUNT_PATTERN.test(input.amountIn)) throw new Error("Input amount must be a positive raw integer");
    assertSlippage(input.slippageBps);

    const body = await this.#request("/quote", {
      method: "POST",
      body: {
        type: "EXACT_INPUT",
        amount: input.amountIn,
        tokenInChainId: chain.chainId,
        tokenOutChainId: chain.chainId,
        tokenIn,
        tokenOut,
        swapper,
        recipient: swapper,
        slippageTolerance: input.slippageBps / 100,
        routingPreference: "BEST_PRICE",
        protocols: ["V2", "V3", "V4"],
      },
    });
    if (body.routing !== "CLASSIC") {
      throw new Error(`Uniswap returned unsupported ${String(body.routing)} routing; only CLASSIC swaps are allowed`);
    }
    if (body.permitData !== null && body.permitData !== undefined) {
      throw new Error("Uniswap returned Permit2 data despite the direct-approval policy");
    }
    const apiQuote = asRecord(body.quote, "Uniswap quote");
    const quoteInput = asRecord(apiQuote.input, "Uniswap quote input");
    const quoteOutput = asRecord(apiQuote.output, "Uniswap quote output");
    const quotedInput = requiredRaw(quoteInput.amount, "Uniswap input amount");
    if (quotedInput !== input.amountIn) throw new Error("Uniswap returned a mismatched input amount");
    if (requiredAddress(quoteInput.token, "Uniswap input token").toLowerCase() !== tokenIn.toLowerCase()) {
      throw new Error("Uniswap returned a mismatched input token");
    }
    if (requiredAddress(quoteOutput.token, "Uniswap output token").toLowerCase() !== tokenOut.toLowerCase()) {
      throw new Error("Uniswap returned a mismatched output token");
    }
    const amountOut = requiredRaw(quoteOutput.amount, "Uniswap output amount");
    const minimumAmountOut = optionalRaw(quoteOutput.minimumAmount)
      ?? ((BigInt(amountOut) * BigInt(10_000 - input.slippageBps)) / 10_000n).toString();
    if (minimumAmountOut === "0") throw new Error("Uniswap minimum output is zero");
    const routerAddress = chain.universalRouterAddress;
    if (routerAddress === undefined || routerAddress.toLowerCase() !== ROBINHOOD_UNIVERSAL_ROUTER) {
      throw new Error("Robinhood Uniswap Universal Router policy is not pinned");
    }
    const now = new Date();
    const evidence: UniswapQuote = {
      provider: "uniswap",
      chainKey: chain.key,
      chainId: chain.chainId,
      tokenIn,
      tokenOut,
      amountIn: quotedInput,
      amountOut,
      minimumAmountOut,
      routerAddress,
      routeNames: extractRouteNames(apiQuote.route),
      quoteId: crypto.randomUUID(),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 300_000).toISOString(),
    };
    this.#prune(now.getTime());
    this.#quotes.set(evidence.quoteId, { evidence, apiQuote });
    return evidence;
  }

  async build(input: { quoteId: string; sender: string; recipient?: string; slippageBps: number }): Promise<UniswapBuild> {
    const stored = this.#quotes.get(input.quoteId);
    if (stored === undefined) throw new Error("Uniswap quote is unavailable or already consumed");
    const sender = requiredAddress(input.sender, "Uniswap sender");
    const recipient = requiredAddress(input.recipient ?? input.sender, "Uniswap recipient");
    assertSlippage(input.slippageBps);
    if (Date.parse(stored.evidence.expiresAt) <= Date.now()) {
      this.#quotes.delete(input.quoteId);
      throw new Error("Uniswap quote expired; request a fresh quote");
    }
    if (sender.toLowerCase() !== recipient.toLowerCase()) throw new Error("Uniswap recipient must match the locked session wallet");

    let approvalTransaction: UniswapBuild["approvalTransaction"];
    let approvalSpender = stored.evidence.routerAddress;
    if (stored.evidence.tokenIn !== UNISWAP_NATIVE_TOKEN_ADDRESS) {
      const approvalBody = await this.#request("/check_approval", {
        method: "POST",
        body: {
          walletAddress: sender,
          token: stored.evidence.tokenIn,
          amount: stored.evidence.amountIn,
          chainId: stored.evidence.chainId,
          urgency: "normal",
          includeGasInfo: true,
        },
      });
      if (approvalBody.cancel !== null && approvalBody.cancel !== undefined) {
        throw new Error("Uniswap requires an allowance reset; cancel the existing approval before retrying");
      }
      if (approvalBody.approval !== null && approvalBody.approval !== undefined) {
        approvalTransaction = parseTransaction(approvalBody.approval, stored.evidence.chainId, sender, stored.evidence.tokenIn);
        assertAllowlistedApprovalCalldata(approvalTransaction.calldata, stored.evidence.routerAddress);
        approvalSpender = `0x${approvalTransaction.calldata.slice(34, 74)}`.toLowerCase() as `0x${string}`;
      }
    }

    const swapBody = await this.#request("/swap", {
      method: "POST",
      body: {
        quote: stored.apiQuote,
        refreshGasPrice: true,
        simulateTransaction: false,
        safetyMode: "SAFE",
        urgency: "normal",
      },
    });
    const transaction = parseTransaction(swapBody.swap, stored.evidence.chainId, sender, [stored.evidence.routerAddress, UNISWAP_SWAP_PROXY_ADDRESS]);
    return {
      provider: "uniswap",
      quoteId: stored.evidence.quoteId,
      chainKey: stored.evidence.chainKey,
      chainId: stored.evidence.chainId,
      sender,
      recipient,
      routerAddress: stored.evidence.routerAddress,
      transactionTarget: transaction.to,
      tokenIn: stored.evidence.tokenIn,
      tokenOut: stored.evidence.tokenOut,
      calldata: transaction.calldata,
      valueWei: transaction.valueWei,
      amountIn: stored.evidence.amountIn,
      amountOut: stored.evidence.amountOut,
      minimumAmountOut: stored.evidence.minimumAmountOut,
      approvalSpender,
      ...(approvalTransaction === undefined ? {} : { approvalTransaction }),
      expiresAt: stored.evidence.expiresAt,
    };
  }

  async #request(path: string, input: { method: "GET" | "POST"; body?: Record<string, unknown> }): Promise<Record<string, unknown>> {
    const apiKey = (await this.#apiKey())?.trim();
    if (!apiKey) throw new Error("Configure the official Uniswap API key in Settings before using Robinhood Chain swaps");
    const response = await this.#fetcher(`${UNISWAP_BASE_URL}${path}`, {
      method: input.method,
      headers: {
        Accept: "application/json",
        "content-type": "application/json",
        "x-api-key": apiKey,
        "x-permit2-disabled": "true",
        "x-universal-router-version": ROBINHOOD_UNIVERSAL_ROUTER_VERSION,
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: AbortSignal.timeout(20_000),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(uniswapError(response.status, body));
    return asRecord(body, "Uniswap Trading API response");
  }

  #prune(now: number): void {
    for (const [id, quote] of this.#quotes) if (Date.parse(quote.evidence.expiresAt) <= now) this.#quotes.delete(id);
  }
}

function normalizeToken(value: string): `0x${string}` {
  const normalized = value.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    ? UNISWAP_NATIVE_TOKEN_ADDRESS
    : value;
  return requiredAddress(normalized, "Uniswap token");
}

function parseTransaction(value: unknown, chainId: number, sender: `0x${string}`, expectedTo: `0x${string}` | readonly `0x${string}`[]): { to: `0x${string}`; valueWei: bigint; calldata: `0x${string}` } {
  const tx = asRecord(value, "Uniswap transaction");
  const to = requiredAddress(tx.to, "Uniswap transaction target");
  const from = requiredAddress(tx.from, "Uniswap transaction sender");
  const expectedArray = Array.isArray(expectedTo) ? expectedTo : [expectedTo];
  if (!expectedArray.some(e => to.toLowerCase() === e.toLowerCase())) throw new Error(`Uniswap transaction target (${to}) is not allowlisted`);
  if (from.toLowerCase() !== sender.toLowerCase()) throw new Error("Uniswap transaction sender does not match the session wallet");
  if (tx.chainId !== undefined && tx.chainId !== null && Number(tx.chainId) !== chainId) {
    throw new Error("Uniswap transaction chain does not match the session chain");
  }
  const calldata = requiredHex(tx.data, "Uniswap transaction calldata");
  const valueWei = parseTxValue(tx.value);
  return { to, valueWei, calldata };
}

function parseTxValue(value: unknown): bigint {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/u.test(trimmed)) {
      return BigInt(trimmed);
    }
    if (/^0x[0-9a-fA-F]+$/u.test(trimmed)) {
      return BigInt(trimmed);
    }
  }
  if (value === undefined || value === null) {
    return 0n;
  }
  throw new Error("Uniswap transaction value is invalid");
}

function assertAllowlistedApprovalCalldata(calldata: `0x${string}`, router: `0x${string}`): void {
  if (!calldata.toLowerCase().startsWith("0x095ea7b3") || calldata.length !== 138) {
    throw new Error("Uniswap approval calldata is not an exact ERC-20 approve call");
  }
  const decodedSpender = `0x${calldata.slice(34, 74)}`.toLowerCase() as `0x${string}`;
  const allowlistedSpenders = [router.toLowerCase(), PERMIT2_ADDRESS.toLowerCase(), UNISWAP_SWAP_PROXY_ADDRESS.toLowerCase()];
  if (!allowlistedSpenders.includes(decodedSpender)) {
    throw new Error(`Uniswap approval spender (${decodedSpender}) is not the pinned Universal Router, Permit2, or Swap Proxy contract`);
  }
}

function extractRouteNames(value: unknown): string[] {
  if (!Array.isArray(value)) return ["Uniswap Classic"];
  const names = new Set<string>();
  for (const path of value) for (const pool of Array.isArray(path) ? path : []) {
    if (typeof pool === "object" && pool !== null && typeof (pool as Record<string, unknown>).type === "string") {
      names.add(String((pool as Record<string, unknown>).type).slice(0, 80));
    }
  }
  return names.size === 0 ? ["Uniswap Classic"] : [...names].slice(0, 20);
}

function assertSlippage(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 1_000) throw new Error("Slippage must be between 0 and 1000 bps");
}

function requiredAddress(value: unknown, label: string): `0x${string}` {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) throw new Error(`${label} must be an exact EVM address`);
  return value as `0x${string}`;
}

function requiredRaw(value: unknown, label: string): string {
  if (typeof value !== "string" || !RAW_AMOUNT_PATTERN.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function optionalRaw(value: unknown): string | undefined {
  return typeof value === "string" && RAW_AMOUNT_PATTERN.test(value) ? value : undefined;
}

function requiredHex(value: unknown, label: string): `0x${string}` {
  if (typeof value !== "string" || !HEX_PATTERN.test(value) || value === "0x") throw new Error(`${label} is invalid`);
  return value as `0x${string}`;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function uniswapError(status: number, body: unknown): string {
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const detail = typeof record.detail === "string" ? record.detail : typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : "request failed";
  return `Uniswap Trading API failed (${status}): ${detail.slice(0, 240)}`;
}
