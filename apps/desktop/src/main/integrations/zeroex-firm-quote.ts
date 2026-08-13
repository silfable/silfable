import { isAddress, type Address, type Hex } from "viem";

const QUOTE_URL = "https://api.0x.org/swap/allowance-holder/quote";

type Fetch = typeof globalThis.fetch;
export type ZeroExFirmQuote = { allowanceTarget: Address; sellAmount: string; buyAmount: string; minBuyAmount: string; to: Address; value: bigint; data: Hex };

/** Gets a firm quote; raw calldata remains main-process only. */
export async function getRobinhoodFirmQuote(input: { apiKey: string; taker: Address; sellToken: Address; buyToken: Address; sellAmount: string; slippageBps: number; fetcher?: Fetch }): Promise<ZeroExFirmQuote> {
  const params = new URLSearchParams({ chainId: "4663", taker: input.taker, sellToken: input.sellToken, buyToken: input.buyToken, sellAmount: input.sellAmount, slippageBps: String(input.slippageBps) });
  let response: Response;
  try { response = await (input.fetcher ?? globalThis.fetch)(`${QUOTE_URL}?${params}`, { headers: { "0x-api-key": input.apiKey, "0x-version": "v2" }, signal: AbortSignal.timeout(10_000) }); }
  catch { throw new Error("0x firm quote is temporarily unavailable"); }
  if (!response.ok) throw new Error(`0x firm quote was rejected (${response.status})`);
  return parseFirmQuote(await response.json().catch(() => null));
}

function parseFirmQuote(value: unknown): ZeroExFirmQuote {
  if (typeof value !== "object" || value === null) throw new Error("0x returned an invalid firm quote");
  const quote = value as Record<string, unknown>;
  if (quote.liquidityAvailable !== true) throw new Error("0x did not confirm liquidity for this trade");
  const transaction = typeof quote.transaction === "object" && quote.transaction !== null ? quote.transaction as Record<string, unknown> : null;
  const issues = typeof quote.issues === "object" && quote.issues !== null ? quote.issues as Record<string, unknown> : null;
  const allowanceIssue = issues !== null && typeof issues.allowance === "object" && issues.allowance !== null
    ? issues.allowance as Record<string, unknown>
    : null;
  const issueSpender = allowanceIssue === null ? null : address(allowanceIssue.spender);
  const legacyAllowanceTarget = address(quote.allowanceTarget);
  if (issueSpender !== null && legacyAllowanceTarget !== null && issueSpender.toLowerCase() !== legacyAllowanceTarget.toLowerCase()) {
    throw new Error("0x returned conflicting allowance targets");
  }
  const allowanceTarget = issueSpender ?? legacyAllowanceTarget;
  if (issues?.balance !== undefined && issues.balance !== null) throw new Error("0x reports an insufficient sell-token balance");
  if (issues?.simulationIncomplete === true) throw new Error("0x could not complete transaction simulation");
  const to = transaction === null ? null : address(transaction.to);
  const data = transaction === null || typeof transaction.data !== "string" || !/^0x[0-9a-fA-F]*$/u.test(transaction.data) ? null : transaction.data as Hex;
  const valueWei = transaction === null ? null : positiveOrZero(transaction.value);
  const sellAmount = positive(quote.sellAmount); const buyAmount = positive(quote.buyAmount); const minBuyAmount = positive(quote.minBuyAmount);
  if (!allowanceTarget || !to || data === null || valueWei === null || !sellAmount || !buyAmount || !minBuyAmount) throw new Error("0x returned an incomplete firm quote");
  return { allowanceTarget, to, data, value: BigInt(valueWei), sellAmount, buyAmount, minBuyAmount };
}
function address(value: unknown): Address | null { return typeof value === "string" && isAddress(value) ? value : null; }
function positive(value: unknown): string | null { return typeof value === "string" && /^[1-9]\d*$/u.test(value) ? value : null; }
function positiveOrZero(value: unknown): string | null { return typeof value === "string" && /^\d+$/u.test(value) ? value : null; }
