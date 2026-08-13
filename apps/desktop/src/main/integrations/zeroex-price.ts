import { isAddress, type Address } from "viem";

const PRICE_URL = "https://api.0x.org/swap/allowance-holder/price";
const ROBINHOOD_CHAIN_ID = "4663";

type Fetch = typeof globalThis.fetch;

export type ZeroExIndicativePrice = {
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string | null;
  blockNumber: string | null;
  zeroExFeeAmount: string | null;
  zeroExFeeToken: Address | null;
  liquidityAvailable: boolean;
};

/** Calls only 0x's read-only price endpoint; this function never requests calldata. */
export async function getRobinhoodIndicativePrice(input: {
  apiKey: string;
  taker: Address;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  slippageBps: number;
  fetcher?: Fetch;
}): Promise<ZeroExIndicativePrice> {
  if (!isAddress(input.taker) || !isAddress(input.sellToken) || !isAddress(input.buyToken)) throw new Error("Robinhood quote requires valid EVM token and wallet addresses");
  if (input.sellToken.toLowerCase() === input.buyToken.toLowerCase()) throw new Error("Robinhood quote tokens must be different");
  if (!/^[1-9]\d*$/u.test(input.sellAmount)) throw new Error("Robinhood quote sell amount is invalid");
  if (!Number.isInteger(input.slippageBps) || input.slippageBps < 0 || input.slippageBps > 1_000) throw new Error("Robinhood quote slippage is invalid");
  const params = new URLSearchParams({ chainId: ROBINHOOD_CHAIN_ID, taker: input.taker, sellToken: input.sellToken, buyToken: input.buyToken, sellAmount: input.sellAmount, slippageBps: String(input.slippageBps) });
  let response: Response;
  try {
    response = await (input.fetcher ?? globalThis.fetch)(`${PRICE_URL}?${params}`, {
      headers: { "0x-api-key": input.apiKey, "0x-version": "v2" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("0x indicative price is temporarily unavailable");
  }
  if (!response.ok) throw new Error(`0x indicative price was rejected (${response.status})`);
  return parsePrice(await response.json().catch(() => null), input);
}

function parsePrice(value: unknown, input: Pick<Parameters<typeof getRobinhoodIndicativePrice>[0], "sellToken" | "buyToken" | "sellAmount">): ZeroExIndicativePrice {
  if (typeof value !== "object" || value === null) throw new Error("0x returned an invalid indicative price");
  const quote = value as Record<string, unknown>;
  const buyAmount = positiveString(quote.buyAmount);
  const sellAmount = positiveString(quote.sellAmount) ?? input.sellAmount;
  if (buyAmount === null || sellAmount === null) throw new Error("0x returned an incomplete indicative price");
  const fees = typeof quote.fees === "object" && quote.fees !== null ? quote.fees as Record<string, unknown> : {};
  const zeroExFee = typeof fees.zeroExFee === "object" && fees.zeroExFee !== null ? fees.zeroExFee as Record<string, unknown> : null;
  const zeroExFeeToken = typeof zeroExFee?.token === "string" && isAddress(zeroExFee.token) ? zeroExFee.token : null;
  return {
    sellToken: input.sellToken as Address,
    buyToken: input.buyToken as Address,
    sellAmount,
    buyAmount,
    minBuyAmount: positiveString(quote.minBuyAmount),
    blockNumber: positiveString(quote.blockNumber),
    zeroExFeeAmount: positiveString(zeroExFee?.amount),
    zeroExFeeToken,
    liquidityAvailable: quote.liquidityAvailable === true,
  };
}

function positiveString(value: unknown): string | null {
  return typeof value === "string" && /^[1-9]\d*$/u.test(value) ? value : null;
}
