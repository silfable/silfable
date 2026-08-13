import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HyperliquidClientService } from "./hyperliquid.js";

describe("HyperliquidClientService", () => {
  it("fetches and validates perpetual market metadata", async () => {
    const client = new HyperliquidClientService("mainnet", async () => Response.json({
      universe: [{ name: "SOL", szDecimals: 2, maxLeverage: 20 }],
    }));
    const meta = await client.getMetaData();
    assert.ok(meta.universe.length > 0);
    assert.equal(meta.universe.some((item) => item.name === "SOL"), true);
  });

  it("fails closed instead of fabricating a perpetual order", async () => {
    const client = new HyperliquidClientService("mainnet");
    await assert.rejects(() => client.placeOrder(
      "0x1111111111111111111111111111111111111111",
      "0xmock_signature",
      {
        coin: "SOL",
        isBuy: true,
        limitPrice: 150.5,
        size: 1.0,
        orderType: "market",
      }
    ), /live order execution is not configured/u);
  });

  it("rejects order with invalid size or limit price", async () => {
    const client = new HyperliquidClientService("mainnet");
    const res = await client.placeOrder("0x111", "0xsig", {
      coin: "SOL",
      isBuy: true,
      limitPrice: 0,
      size: 0,
      orderType: "market",
    });

    assert.equal(res.status, "err");
    assert.match(res.error ?? "", /Order size must be greater than zero/u);
  });
});
