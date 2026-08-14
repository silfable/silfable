import assert from "node:assert/strict";
import test from "node:test";

import { getRobinhoodIndicativePrice } from "./zeroex-price.js";

const taker = "0x1111111111111111111111111111111111111111" as const;
const sellToken = "0x2222222222222222222222222222222222222222";
const buyToken = "0x3333333333333333333333333333333333333333";

test("0x Robinhood price only returns bounded read-only quote fields", async () => {
  const quote = await getRobinhoodIndicativePrice({
    apiKey: "test-api-key", taker, sellToken, buyToken, sellAmount: "100", slippageBps: 100,
    fetcher: async (url) => {
      assert.match(String(url), /chainId=4663/u);
      assert.match(String(url), /allowance-holder\/price/u);
      return new Response(JSON.stringify({ sellAmount: "100", buyAmount: "99", minBuyAmount: "98", blockNumber: "12", liquidityAvailable: true, fees: { zeroExFee: { amount: "1", token: buyToken } } }), { status: 200 });
    },
  });
  assert.deepEqual(quote, { sellToken, buyToken, sellAmount: "100", buyAmount: "99", minBuyAmount: "98", blockNumber: "12", zeroExFeeAmount: "1", zeroExFeeToken: buyToken, liquidityAvailable: true });
});

test("0x Robinhood price rejects unsafe input and incomplete responses", async () => {
  await assert.rejects(() => getRobinhoodIndicativePrice({ apiKey: "test-api-key", taker, sellToken, buyToken: sellToken, sellAmount: "100", slippageBps: 100 }), /must be different/u);
  await assert.rejects(() => getRobinhoodIndicativePrice({ apiKey: "test-api-key", taker, sellToken, buyToken, sellAmount: "0", slippageBps: 100 }), /sell amount/u);
  await assert.rejects(() => getRobinhoodIndicativePrice({ apiKey: "test-api-key", taker, sellToken, buyToken, sellAmount: "100", slippageBps: 100, fetcher: async () => new Response("{}", { status: 200 }) }), /incomplete/u);
});
