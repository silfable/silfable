import assert from "node:assert/strict";
import test from "node:test";
import { getRobinhoodFirmQuote } from "./zeroex-firm-quote.js";
const a = "0x1111111111111111111111111111111111111111" as const;
test("firm 0x quote keeps calldata in the service result", async () => {
  const quote = await getRobinhoodFirmQuote({ apiKey: "test-key", taker: a, sellToken: a, buyToken: "0x2222222222222222222222222222222222222222", sellAmount: "100", slippageBps: 100, fetcher: async () => new Response(JSON.stringify({ liquidityAvailable: true, allowanceTarget: a, sellAmount: "100", buyAmount: "99", minBuyAmount: "98", transaction: { to: a, data: "0x1234", value: "0" } }), { status: 200 }) });
  assert.equal(quote.allowanceTarget, a); assert.equal(quote.data, "0x1234");
});
test("firm 0x quote rejects incomplete transaction data", async () => {
  await assert.rejects(() => getRobinhoodFirmQuote({ apiKey: "test-key", taker: a, sellToken: a, buyToken: "0x2222222222222222222222222222222222222222", sellAmount: "100", slippageBps: 100, fetcher: async () => new Response("{}", { status: 200 }) }), /liquidity|incomplete/u);
});
