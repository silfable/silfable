import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildUniswapV3SwapCalldata } from "./router.js";

describe("Robinhood Chain Uniswap V3 Router", () => {
  const verifiedRouterAddress = "0x4444444444444444444444444444444444444444" as const;

  it("encodes calldata only for an explicitly supplied verified deployment", () => {
    const res = buildUniswapV3SwapCalldata({
      verifiedRouterAddress,
      tokenIn: "0x1111111111111111111111111111111111111111",
      tokenOut: "0x2222222222222222222222222222222222222222",
      amountInWei: 1000000000000000000n, // 1 ETH
      minAmountOutWei: 990000000000000000n, // 1% max slippage
      recipient: "0x3333333333333333333333333333333333333333",
    });

    assert.equal(res.to, verifiedRouterAddress);
    assert.match(res.calldata, /^0x[0-9a-fA-F]+$/);
    assert.equal(res.valueWei, 0n);
  });

  it("fails closed without a non-zero verified deployment address", () => {
    assert.throws(() => buildUniswapV3SwapCalldata({
      verifiedRouterAddress: "0x0000000000000000000000000000000000000000",
      tokenIn: "0x1111111111111111111111111111111111111111",
      tokenOut: "0x2222222222222222222222222222222222222222",
      amountInWei: 1n,
      minAmountOutWei: 1n,
      recipient: "0x3333333333333333333333333333333333333333",
    }), /verified Robinhood Chain router/u);
  });

  it("rejects same-token, non-positive, unsupported-fee, and unsafe-deadline requests", () => {
    const request = {
      verifiedRouterAddress,
      tokenIn: "0x1111111111111111111111111111111111111111" as const,
      tokenOut: "0x2222222222222222222222222222222222222222" as const,
      amountInWei: 1n,
      minAmountOutWei: 1n,
      recipient: "0x3333333333333333333333333333333333333333" as const,
    };
    assert.throws(() => buildUniswapV3SwapCalldata({ ...request, tokenOut: request.tokenIn }), /must be different/u);
    assert.throws(() => buildUniswapV3SwapCalldata({ ...request, amountInWei: 0n }), /must be positive/u);
    assert.throws(() => buildUniswapV3SwapCalldata({ ...request, fee: 100 }), /not allowlisted/u);
    assert.throws(() => buildUniswapV3SwapCalldata({ ...request, deadlineMinutes: 1 }), /between 5 minutes/u);
  });
});
