import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validatePumpSlippage } from "./slippage.js";

describe("Pump.fun Slippage Guard (Cloud Worker)", () => {
  it("allows trade within slippage tolerance", () => {
    const result = validatePumpSlippage({
      side: "buy",
      expectedOutputAmount: "10000",
      minimumOutputAmount: "9900", // 1% slippage (100 bps)
      slippageBps: 100,
    });

    assert.equal(result.valid, true);
    assert.equal(result.actualSlippageBps, 100);
  });

  it("blocks trade if slippage exceeds tolerance", () => {
    const result = validatePumpSlippage({
      side: "buy",
      expectedOutputAmount: "10000",
      minimumOutputAmount: "9500", // 5% slippage (500 bps)
      slippageBps: 100, // Only 1% allowed
    });

    assert.equal(result.valid, false);
    assert.equal(result.actualSlippageBps, 500);
    assert.ok(result.reason?.includes("exceeds maximum allowed slippage"));
  });
});
