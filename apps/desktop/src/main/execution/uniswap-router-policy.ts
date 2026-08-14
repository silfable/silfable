import type { EvmChainKey } from "@silfable/contracts";
import { ROBINHOOD_UNIVERSAL_ROUTER, ROBINHOOD_UNIVERSAL_ROUTER_VERSION } from "../integrations/uniswap.js";

export function inspectUniswapRouter(input: { chainKey: EvmChainKey; routerAddress: string }): { status: "blocked" | "allowlisted"; reason: string } {
  if (input.chainKey !== "robinhood") {
    return { status: "blocked", reason: "The Uniswap adapter is allowlisted only for Robinhood Chain in this release" };
  }
  if (input.routerAddress.toLowerCase() !== ROBINHOOD_UNIVERSAL_ROUTER) {
    return { status: "blocked", reason: "The transaction target is not the pinned Robinhood Uniswap Universal Router" };
  }
  return {
    status: "allowlisted",
    reason: `Official Uniswap Universal Router ${ROBINHOOD_UNIVERSAL_ROUTER_VERSION} is pinned for Robinhood Chain`,
  };
}

export function assertUniswapCalldata(calldata: string): void {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/u.test(calldata) || calldata.length < 10) {
    throw new Error("Uniswap calldata is empty or malformed");
  }
}
