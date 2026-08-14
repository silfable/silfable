import assert from "node:assert/strict";
import test from "node:test";

import { getEvmChain, listEvmChains } from "./evm-chains.js";
import { KyberSwapQuoteService } from "./kyberswap.js";

const tokenIn = "0x1111111111111111111111111111111111111111";
const tokenOut = "0x2222222222222222222222222222222222222222";

test("EVM registry exposes Robinhood as the sole desktop execution chain", () => {
  assert.equal(getEvmChain("robinhood").chainId, 4_663);
  assert.equal(getEvmChain("robinhood").quoteProvider, "uniswap");
  assert.equal(getEvmChain("robinhood").explorerUrl, "https://robinhoodchain.blockscout.com");
  assert.equal(listEvmChains().length, 1);
  assert.throws(() => getEvmChain("base"), /Unsupported EVM chain/u);
});

test("KyberSwap is blocked for Robinhood because the release uses Uniswap", async () => {
  const service = new KyberSwapQuoteService(async () => {
    throw new Error("network must not be called");
  });
  await assert.rejects(
    () => service.quote({ chainKey: "robinhood", tokenIn, tokenOut, amountIn: "1000000", slippageBps: 50 }),
    /does not use KyberSwap/u,
  );
});
