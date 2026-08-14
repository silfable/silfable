import assert from "node:assert/strict";
import test from "node:test";
import { resolveRobinhoodVerifiedAssets } from "./robinhood-assets.js";

const address = "0x1Cdad396DB64BDa184d5182A97Dd9B3C62100b7D";
test("Robinhood asset registry accepts only active chain 4663 official deployments", async () => {
  const result = await resolveRobinhoodVerifiedAssets([address], async () => new Response(JSON.stringify({ assets: [{ tokenSymbol: "P", tokenName: "Everpure", currentMultiplier: "1.0", status: "ASSET_STATUS_ACTIVE", deployments: [{ chainId: 4663, contractAddress: address }] }] }), { status: 200 }));
  assert.equal(result[0]?.symbol, "P");
});
test("Robinhood asset registry rejects inactive or unknown deployments", async () => {
  await assert.rejects(() => resolveRobinhoodVerifiedAssets([address], async () => new Response(JSON.stringify({ assets: [] }), { status: 200 })), /not an active official/u);
});
