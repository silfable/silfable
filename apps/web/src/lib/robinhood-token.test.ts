import test from "node:test";
import assert from "node:assert/strict";
import { parseBlockscoutTokenCandidates, resolveRobinhoodTokenReference, ROBINHOOD_WETH } from "./robinhood-token";

test("resolves WETH from the verified Robinhood registry without discovery", async () => {
  const result = await resolveRobinhoodTokenReference("weth");
  assert.equal(result.status, "resolved");
  if (result.status === "resolved") assert.equal(result.token.address, ROBINHOOD_WETH);
});

test("keeps only exact non-scam ERC-20 symbol matches from Blockscout", () => {
  const candidates = parseBlockscoutTokenCandidates({ items: [
    { address: "0x1111111111111111111111111111111111111111", symbol: "USDC", decimals: "6", type: "ERC-20", reputation: "ok" },
    { address: "0x2222222222222222222222222222222222222222", symbol: "USDC.e", decimals: "6", type: "ERC-20", reputation: "ok" },
    { address: "0x3333333333333333333333333333333333333333", symbol: "USDC", decimals: "6", type: "ERC-20", reputation: "scam" },
  ] }, "usdc");

  assert.deepEqual(candidates.map((token) => token.address), ["0x1111111111111111111111111111111111111111"]);
});
