import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BridgeClientService } from "./bridge-client.js";

describe("BridgeClientService", () => {
  it("fetches cross-chain bridge quote from Solana to Arbitrum", async () => {
    const client = new BridgeClientService("https://bridge.example", async () => Response.json({
      estimation: {
        id: "verified-quote-1",
        dstChainTokenOut: { amount: "9900000" },
        costsDetails: { totalFeeUsd: "0.25" },
      },
      tx: { to: "0x1111111111111111111111111111111111111111", data: "0x1234", value: "0" },
    }));
    const quote = await client.getQuote({
      srcChainId: 7565164, // Solana
      srcChainTokenIn: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC Solana
      amountIn: "10000000", // 10 USDC
      dstChainId: 42161, // Arbitrum
      dstChainTokenOut: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC Arbitrum
      dstChainTokenOutRecipient: "0x1111111111111111111111111111111111111111",
    });

    assert.equal(quote.srcChainId, 7565164);
    assert.equal(quote.dstChainId, 42161);
    assert.equal(quote.estimatedTimeSeconds, 0);
    assert.ok(BigInt(quote.estimatedAmountOut) > 0n);
    assert.ok(quote.estimatedFeeUsd > 0);
    assert.equal(quote.quoteId, "verified-quote-1");
  });

  it("fails closed instead of returning a mock quote when the venue is unavailable", async () => {
    const client = new BridgeClientService("https://bridge.example", async () => new Response("unavailable", { status: 503 }));
    await assert.rejects(() => client.getQuote({
      srcChainId: 7565164,
      srcChainTokenIn: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amountIn: "10000000",
      dstChainId: 42161,
      dstChainTokenOut: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      dstChainTokenOutRecipient: "0x1111111111111111111111111111111111111111",
    }), /Bridge quote request failed \(503\)/u);
  });

  it("throws error if source and destination chain IDs are identical", async () => {
    const client = new BridgeClientService();
    await assert.rejects(
      () => client.getQuote({
        srcChainId: 42161,
        srcChainTokenIn: "USDC",
        amountIn: "100",
        dstChainId: 42161,
        dstChainTokenOut: "USDC",
        dstChainTokenOutRecipient: "0x123",
      }),
      /Source and destination chains must be different/u,
    );
  });
});
