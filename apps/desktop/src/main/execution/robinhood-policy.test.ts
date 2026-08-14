import assert from "node:assert/strict";
import test from "node:test";
import { assertRobinhoodPilotQuotePolicy } from "./robinhood-policy.js";

test("Robinhood pilot policy permits only the bounded symbol and slippage scope", () => {
  assert.doesNotThrow(() => assertRobinhoodPilotQuotePolicy({ sellSymbol: "AAPL", buySymbol: "TSLA", slippageBps: 100 }));
  assert.throws(() => assertRobinhoodPilotQuotePolicy({ sellSymbol: "AAPL", buySymbol: "P", slippageBps: 100 }), /limited to/u);
  assert.throws(() => assertRobinhoodPilotQuotePolicy({ sellSymbol: "AAPL", buySymbol: "TSLA", slippageBps: 101 }), /cannot exceed/u);
});
