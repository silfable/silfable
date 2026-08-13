import assert from "node:assert/strict";
import test from "node:test";

import { BRIDGE_ROBINHOOD_USDG_ADDRESS, BRIDGE_SOLANA_USDC_MINT } from "@silfable/contracts";
import {
  CROSS_CHAIN_BRIDGE_ROUTES,
  listCrossChainBridgeDestinations,
  resolveCrossChainBridgeRoute,
} from "./cross-chain-bridge-routes.js";

test("cross-chain registry contains only the controlled Solana and Robinhood route pair", () => {
  assert.ok(CROSS_CHAIN_BRIDGE_ROUTES.some((route) =>
    route.source.chainKey === "solana" && route.destination.chainKey === "robinhood" && route.sourceExecution === "solana-live",
  ));
  assert.ok(CROSS_CHAIN_BRIDGE_ROUTES.some((route) =>
    route.source.chainKey === "robinhood" && route.destination.chainKey === "solana" && route.sourceExecution === "evm-release-gated",
  ));
});

test("cross-chain registry resolves exact canonical stablecoin pairs only", () => {
  const route = resolveCrossChainBridgeRoute(
    4_663,
    BRIDGE_ROBINHOOD_USDG_ADDRESS,
    7_565_164,
    BRIDGE_SOLANA_USDC_MINT,
  );
  assert.equal(route.source.chainKey, "robinhood");
  assert.equal(route.destination.chainKey, "solana");
  assert.throws(() => resolveCrossChainBridgeRoute(4_663, BRIDGE_ROBINHOOD_USDG_ADDRESS, 1, BRIDGE_SOLANA_USDC_MINT));
});

test("route discovery is source-scoped", () => {
  const fromRobinhood = listCrossChainBridgeDestinations("robinhood");
  assert.equal(fromRobinhood.length, 1);
  assert.ok(fromRobinhood.every((route) => route.source.chainKey === "robinhood"));
});
