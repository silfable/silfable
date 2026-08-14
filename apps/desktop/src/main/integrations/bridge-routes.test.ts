import assert from "node:assert/strict";
import test from "node:test";

import {
  BRIDGE_ROBINHOOD_CHAIN_ID,
  BRIDGE_ROBINHOOD_USDG_ADDRESS,
  BRIDGE_SOLANA_CHAIN_ID,
  BRIDGE_SOLANA_USDC_MINT,
  BridgeContractSchema,
  type BridgeContract,
} from "@silfable/contracts";
import { BRIDGE_ROUTES, bridgeProviderCandidates, resolveEnabledBridgeRoute } from "./bridge-routes.js";

test("registry exposes only release-controlled executable routes", () => {
  const contract = BridgeContractSchema.parse({
    id: "7f280762-97e7-4a88-b1ad-dd5e924dc096",
    provider: "relay",
    sourceChainId: BRIDGE_SOLANA_CHAIN_ID,
    destinationChainId: BRIDGE_ROBINHOOD_CHAIN_ID,
    sourceAsset: { address: BRIDGE_SOLANA_USDC_MINT, symbol: "USDC", decimals: 6 },
    destinationAsset: { address: BRIDGE_ROBINHOOD_USDG_ADDRESS, symbol: "USDG", decimals: 6 },
    sourceWallet: "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg",
    destinationRecipient: "0x462e05D112DE35a42a8F0EaB5e0F4A898C9D4913",
    amountIn: "5000000",
    minimumDestinationAmount: "4000000",
    maximumTotalFeeUsd: 3,
    createdAt: "2026-08-02T00:00:00.000Z",
    deadline: "2026-08-02T00:30:00.000Z",
    timeoutSeconds: 3600,
    refundPolicy: "provider-cancel-only",
  });
  assert.equal(BRIDGE_ROUTES.length, 1);
  assert.deepEqual(BRIDGE_ROUTES.map((route) => route.destination.chainId), [
    BRIDGE_ROBINHOOD_CHAIN_ID,
  ]);
  assert.deepEqual(BRIDGE_ROUTES[0]?.providers.map((provider) => provider.id), ["relay"]);
  assert.equal(resolveEnabledBridgeRoute(contract).id, "solana-usdc-robinhood-usdg");

  const robinhoodContract = BridgeContractSchema.parse({
    ...contract,
    provider: "auto",
    destinationChainId: BRIDGE_ROBINHOOD_CHAIN_ID,
    destinationAsset: { address: BRIDGE_ROBINHOOD_USDG_ADDRESS, symbol: "USDG", decimals: 6 },
  });
  assert.equal(resolveEnabledBridgeRoute(robinhoodContract).id, "solana-usdc-robinhood-usdg");
  assert.deepEqual(bridgeProviderCandidates(robinhoodContract), ["relay"]);

  assert.throws(() => resolveEnabledBridgeRoute({
    ...contract,
    destinationAsset: { address: "0x1111111111111111111111111111111111111111", symbol: "USDC", decimals: 6 },
  } as BridgeContract), /not enabled/u);
});
