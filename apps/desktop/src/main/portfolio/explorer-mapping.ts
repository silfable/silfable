import type { EvmChainKey, UnifiedActivityEntry } from "@silfable/contracts";

import { getEvmChain } from "../integrations/evm-chains.js";

const SOLANA_EXPLORER = "https://explorer.solana.com";
const EVM_HASH = /^0x[0-9a-f]{64}$/iu;
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/u;

export function explorerBaseUrl(family: "solana" | "evm", chainKey: string): string {
  if (family === "solana") return SOLANA_EXPLORER;
  if (chainKey !== "robinhood") throw new Error("Desktop EVM explorer access is limited to Robinhood Chain.");
  return getEvmChain("robinhood").explorerUrl;
}

export function activityExplorerUrl(input: Pick<
  UnifiedActivityEntry,
  "family" | "chainKey" | "transactionId" | "venue"
>): string | null {
  if (!input.transactionId) return null;
  if (input.family === "solana" && SOLANA_SIGNATURE.test(input.transactionId)) {
    return `${SOLANA_EXPLORER}/tx/${input.transactionId}`;
  }
  if (input.family === "evm" && input.chainKey === "robinhood" && EVM_HASH.test(input.transactionId)) {
    return `${getEvmChain("robinhood").explorerUrl}/tx/${input.transactionId}`;
  }
  return null;
}

export function assertAllowedExplorerUrl(raw: string): URL {
  const url = new URL(raw);
  const allowedHosts = new Set([
    "explorer.solana.com",
    new URL(getEvmChain("robinhood").explorerUrl).hostname,
  ]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname) || !url.pathname.includes("/tx/")) {
    throw new Error("Explorer URL is not release-controlled.");
  }
  return url;
}
