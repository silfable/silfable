import assert from "node:assert/strict";
import test from "node:test";

import { fetchSolanaUsdPrices } from "./solana-price-provider.js";

const SOL = "So11111111111111111111111111111111111111112";

test("fetches Solana price evidence from the pinned GeckoTerminal origin", async () => {
  let requestedUrl = "";
  const result = await fetchSolanaUsdPrices([SOL, SOL], {
    now: () => new Date("2026-08-03T00:00:00.000Z"),
    fetchFn: async (input) => {
      requestedUrl = input.toString();
      return Response.json({ data: { attributes: { token_prices: { [SOL]: "165.25" } } } });
    },
  });

  assert.equal(requestedUrl, `https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price/${SOL}`);
  assert.equal(result?.prices.get(SOL), 165.25);
  assert.equal(result?.fetchedAt, "2026-08-03T00:00:00.000Z");
});

test("rejects malformed Solana price evidence", async () => {
  await assert.rejects(
    fetchSolanaUsdPrices([SOL], { fetchFn: async () => Response.json({ data: {} }) }),
    /missing token prices/u,
  );
});
