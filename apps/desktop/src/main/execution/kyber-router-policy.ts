import type { Address, Hex } from "viem";

export const KYBER_META_AGGREGATION_ROUTER: Address = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
export const EVM_NATIVE_TOKEN_SENTINEL: Address = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const EVM_NATIVE_ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

export type KyberRouterPolicy = {
  status: "blocked" | "allowlisted";
  reason: string;
};

export function inspectKyberRouter(router: Address): KyberRouterPolicy {
  return router.toLowerCase() === KYBER_META_AGGREGATION_ROUTER.toLowerCase()
    ? { status: "allowlisted", reason: "KyberSwap MetaAggregationRouterV2 matches the code-pinned release address." }
    : { status: "blocked", reason: "KyberSwap returned a router that is not present in the code-pinned multi-chain allowlist." };
}

export function assertKyberRouter(router: Address): void {
  const policy = inspectKyberRouter(router);
  if (policy.status !== "allowlisted") throw new Error(policy.reason);
}

/**
 * The provider calldata remains opaque until Kyber's complete router ABI is
 * decoded. This guard still fails closed on empty/malformed calldata and pins
 * the only executable destination. Token, amount, recipient, value and
 * allowance are independently bound by the build and preflight evidence.
 */
export function assertKyberCalldata(data: Hex): void {
  if (!/^0x[0-9a-fA-F]{8,}$/u.test(data) || data.length % 2 !== 0) {
    throw new Error("KyberSwap calldata is empty or malformed");
  }
}

export function isNativeEvmToken(address: Address): boolean {
  const normalized = address.toLowerCase();
  return normalized === EVM_NATIVE_TOKEN_SENTINEL.toLowerCase()
    || normalized === EVM_NATIVE_ZERO_ADDRESS;
}
