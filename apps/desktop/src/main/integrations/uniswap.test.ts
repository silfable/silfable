import assert from "node:assert/strict";
import test from "node:test";

import {
  ROBINHOOD_UNIVERSAL_ROUTER,
  UNISWAP_NATIVE_TOKEN_ADDRESS,
  UniswapQuoteService,
} from "./uniswap.js";

const wallet = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";

function quoteResponse(tokenIn: string, tokenOut: string) {
  return {
    routing: "CLASSIC",
    permitData: null,
    quote: {
      input: { token: tokenIn, amount: "1000000" },
      output: { token: tokenOut, amount: "2000000", minimumAmount: "1990000" },
      route: [[{ type: "v4-pool" }]],
    },
  };
}

test("Uniswap Robinhood quote pins CLASSIC routing and direct-approval headers", async () => {
  const service = new UniswapQuoteService({
    apiKey: async () => "uniswap-test-key",
    fetcher: async (url, init) => {
      assert.match(String(url), /\/quote$/u);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-api-key"), "uniswap-test-key");
      assert.equal(headers.get("x-permit2-disabled"), "true");
      assert.equal(headers.get("x-universal-router-version"), "2.1.1");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.tokenInChainId, 4663);
      assert.deepEqual(body.protocols, ["V2", "V3", "V4"]);
      return new Response(JSON.stringify(quoteResponse(UNISWAP_NATIVE_TOKEN_ADDRESS, token)), { status: 200 });
    },
  });
  const quote = await service.quote({
    chainKey: "robinhood",
    tokenIn: UNISWAP_NATIVE_TOKEN_ADDRESS,
    tokenOut: token,
    amountIn: "1000000",
    slippageBps: 50,
    swapper: wallet,
  });
  assert.equal(quote.provider, "uniswap");
  assert.equal(quote.routerAddress, ROBINHOOD_UNIVERSAL_ROUTER);
  assert.equal(quote.minimumAmountOut, "1990000");
  assert.deepEqual(quote.routeNames, ["v4-pool"]);
});

test("Uniswap native-token build accepts only the pinned Universal Router", async () => {
  const service = new UniswapQuoteService({
    apiKey: async () => "uniswap-test-key",
    fetcher: async (url, init) => {
      if (String(url).endsWith("/quote")) {
        return new Response(JSON.stringify(quoteResponse(UNISWAP_NATIVE_TOKEN_ADDRESS, token)), { status: 200 });
      }
      assert.match(String(url), /\/swap$/u);
      return new Response(JSON.stringify({
        swap: { chainId: 4663, from: wallet, to: ROBINHOOD_UNIVERSAL_ROUTER, value: "1000000", data: "0x12345678" },
      }), { status: 200 });
    },
  });
  const quote = await service.quote({ chainKey: "robinhood", tokenIn: UNISWAP_NATIVE_TOKEN_ADDRESS, tokenOut: token, amountIn: "1000000", slippageBps: 50, swapper: wallet });
  const build = await service.build({ quoteId: quote.quoteId, sender: wallet, slippageBps: 50 });
  assert.equal(build.provider, "uniswap");
  assert.equal(build.valueWei, 1_000_000n);
  assert.equal(build.approvalTransaction, undefined);
});

test("Uniswap native-token build accepts hex value string from Uniswap API", async () => {
  const service = new UniswapQuoteService({
    apiKey: async () => "uniswap-test-key",
    fetcher: async (url) => {
      if (String(url).endsWith("/quote")) {
        return new Response(JSON.stringify(quoteResponse(UNISWAP_NATIVE_TOKEN_ADDRESS, token)), { status: 200 });
      }
      return new Response(JSON.stringify({
        swap: { chainId: 4663, from: wallet, to: ROBINHOOD_UNIVERSAL_ROUTER, value: "0x38d7ea4c68000", data: "0x12345678" },
      }), { status: 200 });
    },
  });
  const quote = await service.quote({ chainKey: "robinhood", tokenIn: UNISWAP_NATIVE_TOKEN_ADDRESS, tokenOut: token, amountIn: "1000000", slippageBps: 50, swapper: wallet });
  const build = await service.build({ quoteId: quote.quoteId, sender: wallet, slippageBps: 50 });
  assert.equal(build.valueWei, 1000000000000000n);
});

test("Uniswap ERC-20 build preserves an exact direct approval to the pinned router", async () => {
  const output = "0x3333333333333333333333333333333333333333";
  const approvalData = `0x095ea7b3${"0".repeat(24)}${ROBINHOOD_UNIVERSAL_ROUTER.slice(2)}${BigInt(1_000_000).toString(16).padStart(64, "0")}`;
  const service = new UniswapQuoteService({
    apiKey: async () => "uniswap-test-key",
    fetcher: async (url) => {
      if (String(url).endsWith("/quote")) return new Response(JSON.stringify(quoteResponse(token, output)), { status: 200 });
      if (String(url).endsWith("/check_approval")) return new Response(JSON.stringify({
        cancel: null,
        approval: { chainId: 4663, from: wallet, to: token, value: "0", data: approvalData },
      }), { status: 200 });
      return new Response(JSON.stringify({
        swap: { chainId: 4663, from: wallet, to: ROBINHOOD_UNIVERSAL_ROUTER, value: "0", data: "0x12345678" },
      }), { status: 200 });
    },
  });
  const quote = await service.quote({ chainKey: "robinhood", tokenIn: token, tokenOut: output, amountIn: "1000000", slippageBps: 50, swapper: wallet });
  const build = await service.build({ quoteId: quote.quoteId, sender: wallet, slippageBps: 50 });
  assert.equal(build.approvalTransaction?.to, token);
  assert.equal(build.approvalTransaction?.calldata, approvalData);
  assert.equal(build.approvalSpender, ROBINHOOD_UNIVERSAL_ROUTER);
});

test("Uniswap ERC-20 build accepts max-uint256 approval hints from the Trading API", async () => {
  const output = "0x3333333333333333333333333333333333333333";
  const maxUint256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
  const approvalData = `0x095ea7b3${"0".repeat(24)}${ROBINHOOD_UNIVERSAL_ROUTER.slice(2)}${BigInt(maxUint256).toString(16).padStart(64, "0")}`;
  const service = new UniswapQuoteService({
    apiKey: async () => "uniswap-test-key",
    fetcher: async (url) => {
      if (String(url).endsWith("/quote")) return new Response(JSON.stringify(quoteResponse(token, output)), { status: 200 });
      if (String(url).endsWith("/check_approval")) return new Response(JSON.stringify({
        cancel: null,
        approval: { chainId: 4663, from: wallet, to: token, value: "0", data: approvalData },
      }), { status: 200 });
      return new Response(JSON.stringify({
        swap: { chainId: 4663, from: wallet, to: ROBINHOOD_UNIVERSAL_ROUTER, value: "0", data: "0x12345678" },
      }), { status: 200 });
    },
  });
  const quote = await service.quote({ chainKey: "robinhood", tokenIn: token, tokenOut: output, amountIn: "1000000", slippageBps: 50, swapper: wallet });
  const build = await service.build({ quoteId: quote.quoteId, sender: wallet, slippageBps: 50 });
  assert.equal(build.approvalSpender, ROBINHOOD_UNIVERSAL_ROUTER);
  assert.equal(build.approvalTransaction?.calldata, approvalData);
});

test("Uniswap adapter rejects UniswapX routes and wrong-chain provider usage", async () => {
  const service = new UniswapQuoteService({
    apiKey: async () => "uniswap-test-key",
    fetcher: async () => new Response(JSON.stringify({ ...quoteResponse(UNISWAP_NATIVE_TOKEN_ADDRESS, token), routing: "DUTCH_LIMIT" }), { status: 200 }),
  });
  await assert.rejects(
    () => service.quote({ chainKey: "robinhood", tokenIn: UNISWAP_NATIVE_TOKEN_ADDRESS, tokenOut: token, amountIn: "1000000", slippageBps: 50, swapper: wallet }),
    /only CLASSIC/u,
  );
  await assert.rejects(
    () => service.quote({ chainKey: "base", tokenIn: UNISWAP_NATIVE_TOKEN_ADDRESS, tokenOut: token, amountIn: "1000000", slippageBps: 50, swapper: wallet }),
    /Unsupported EVM chain: base/u,
  );
});
