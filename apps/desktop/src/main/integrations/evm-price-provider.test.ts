import assert from "node:assert/strict";
import test from "node:test";

import { fetchEvmUsdPrices } from "./evm-price-provider.js";

const USDG_ROBINHOOD = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";

test("uses bounded Robinhood ETH spot pricing for supported assets", async () => {
  let requestedUrl = "";
  const result = await fetchEvmUsdPrices({
    chainKey: "robinhood",
    tokenAddresses: [USDG_ROBINHOOD],
  }, {
    now: () => new Date("2026-07-30T03:00:00.000Z"),
    fetchFn: async (input) => {
      requestedUrl = input.toString();
      return new Response(JSON.stringify({ ethereum: { usd: 1900.5 } }), { status: 200 });
    },
  });

  assert.equal(requestedUrl, "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
  assert.equal(result?.prices.get(USDG_ROBINHOOD), 1900.5);
  assert.equal(result?.fetchedAt, "2026-07-30T03:00:00.000Z");
});

test("uses ETH spot pricing for Robinhood Chain when onchain pricing is unavailable", async () => {
  let requestedUrl = "";
  const result = await fetchEvmUsdPrices({
    chainKey: "robinhood",
    tokenAddresses: [],
  }, {
    now: () => new Date("2026-08-03T00:00:00.000Z"),
    fetchFn: async (input) => {
      requestedUrl = input.toString();
      return new Response(JSON.stringify({ ethereum: { usd: 3500 } }), { status: 200 });
    },
  });
  assert.equal(requestedUrl, "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
  assert.equal(result?.source, "coingecko-spot");
  assert.equal(result?.prices.get("0x0bd7d308f8e1639fab988df18a8011f41eacad73"), 3500);
});

test("rejects malformed provider evidence instead of fabricating a price", async () => {
  const result = await fetchEvmUsdPrices({ chainKey: "robinhood", tokenAddresses: [] }, {
      fetchFn: async () => new Response(JSON.stringify({ ethereum: {} }), { status: 200 }),
    });
  assert.equal(result?.prices.get("0x0bd7d308f8e1639fab988df18a8011f41eacad73"), 0);
});
