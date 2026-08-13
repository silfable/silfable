import assert from "node:assert/strict";
import test from "node:test";
import { resolveRobinhoodSwapIntent } from "./evm-swap-intent";

test("resolves a USDG to ETH Robinhood swap expressed in Indonesian", () => {
  assert.deepEqual(resolveRobinhoodSwapIntent("Saya ingin swap $0.5 dari usdg ke eth"), {
    requested: true,
    amount: "0.5",
    sellToken: "USDG",
    buyToken: "ETH",
    needsContractAddress: false,
  });
});

test("requests a contract address for an unknown Robinhood token symbol", () => {
  assert.equal(resolveRobinhoodSwapIntent("swap 1 ETH to SOMECOIN").needsContractAddress, true);
});

test("accepts an ERC-20 address as a Robinhood swap token", () => {
  const address = "0x1111111111111111111111111111111111111111";
  assert.deepEqual(resolveRobinhoodSwapIntent(`swap 1 ETH to ${address}`), { requested: true, amount: "1", sellToken: "ETH", buyToken: address, needsContractAddress: false });
});

test("does not create a Robinhood quote from an unrelated chat message", () => {
  assert.equal(resolveRobinhoodSwapIntent("Tolong jelaskan saldo saya").requested, false);
});
