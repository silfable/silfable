import { randomUUID } from "node:crypto";

import { BRIDGE_ROBINHOOD_USDG_ADDRESS } from "@silfable/contracts";
import { UNISWAP_NATIVE_TOKEN_ADDRESS } from "../integrations/uniswap.js";
import type { RuntimeDatabase } from "../storage/database.js";

const SETTING_PREFIX = "full_access_evm_asset_authorizations:";
const REVIEW_LIFETIME_MS = 10 * 60_000;

export type VerifiedEvmAsset = {
  address: string;
  symbol: string;
  decimals: number;
  verifiedAt: string;
};

type PendingReview = VerifiedEvmAsset & {
  id: string;
  sessionId: string;
  expiresAt: string;
};

type EvmAssetVerifier = {
  getBytecode(address: `0x${string}`): Promise<`0x${string}` | undefined>;
  getErc20Metadata(address: `0x${string}`): Promise<{ symbol: string; decimals: number }>;
};

/**
 * Stores the non-secret, session-bound ERC-20 allowlist for Full Access.
 * A contract is only persisted after an exact local review confirmation.
 * The renderer and AI never get a capability to mutate this list directly.
 */
export class FullAccessEvmAssetAuthorizationService {
  readonly #database: RuntimeDatabase;
  readonly #engineFor: () => Promise<EvmAssetVerifier>;
  readonly #pending = new Map<string, PendingReview>();

  constructor(database: RuntimeDatabase, engineFor: () => Promise<EvmAssetVerifier>) {
    this.#database = database;
    this.#engineFor = engineFor;
  }

  async requestReview(sessionId: string, address: string): Promise<PendingReview> {
    const normalized = normalizeAddress(address);
    if (isBuiltIn(normalized)) throw new Error("FULL_ACCESS_BUILT_IN_ASSET");
    const engine = await this.#engineFor();
    const bytecode = await engine.getBytecode(normalized as `0x${string}`);
    if (bytecode === undefined || bytecode === "0x") throw new Error("The supplied address has no deployed token contract on Robinhood Chain");
    const metadata = await engine.getErc20Metadata(normalized as `0x${string}`);
    if (!Number.isInteger(metadata.decimals) || metadata.decimals < 0 || metadata.decimals > 18) {
      throw new Error("The token contract returned invalid decimals");
    }
    const symbol = metadata.symbol.trim();
    if (symbol.length < 1 || symbol.length > 32) throw new Error("The token contract returned an invalid symbol");
    const review: PendingReview = {
      id: randomUUID(), sessionId, address: normalized, symbol, decimals: metadata.decimals,
      verifiedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + REVIEW_LIFETIME_MS).toISOString(),
    };
    this.#pending.set(review.id, review);
    return review;
  }

  confirm(sessionId: string, reviewId: string): VerifiedEvmAsset {
    const pending = this.#pending.get(reviewId);
    this.#pending.delete(reviewId);
    if (!pending || pending.sessionId !== sessionId || Date.parse(pending.expiresAt) <= Date.now()) {
      throw new Error("The EVM asset review is unavailable or expired; request a new review");
    }
    const current = this.list(sessionId);
    const asset: VerifiedEvmAsset = { address: pending.address, symbol: pending.symbol, decimals: pending.decimals, verifiedAt: pending.verifiedAt };
    const next = [...current.filter((item) => item.address !== asset.address), asset];
    this.#database.setSetting(`${SETTING_PREFIX}${sessionId}`, JSON.stringify(next));
    return asset;
  }

  list(sessionId: string): VerifiedEvmAsset[] {
    const raw = this.#database.getSetting(`${SETTING_PREFIX}${sessionId}`);
    if (typeof raw !== "string") return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((value): VerifiedEvmAsset[] => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        try {
          const address = normalizeAddress(String(item.address));
          const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
          const decimals = item.decimals;
          const verifiedAt = typeof item.verifiedAt === "string" ? item.verifiedAt : "";
          if (!symbol || symbol.length > 32 || !Number.isInteger(decimals) || (decimals as number) < 0 || (decimals as number) > 18 || !Number.isFinite(Date.parse(verifiedAt))) return [];
          return [{ address, symbol, decimals: decimals as number, verifiedAt }];
        } catch { return []; }
      });
    } catch { return []; }
  }

  find(sessionId: string, address: string): VerifiedEvmAsset | null {
    const normalized = normalizeAddress(address);
    if (normalized === UNISWAP_NATIVE_TOKEN_ADDRESS.toLowerCase()) return { address: normalized, symbol: "ETH", decimals: 18, verifiedAt: "release-pinned" };
    if (normalized === BRIDGE_ROBINHOOD_USDG_ADDRESS.toLowerCase()) return { address: normalized, symbol: "USDG", decimals: 6, verifiedAt: "release-pinned" };
    return this.list(sessionId).find((asset) => asset.address === normalized) ?? null;
  }

  assertPairAuthorized(sessionId: string, tokenIn: string, tokenOut: string): void {
    const missing = [tokenIn, tokenOut].filter((token) => this.find(sessionId, token) === null);
    if (missing.length > 0) throw new Error("Full Access token is not authorized for this session. Request an asset review in chat and confirm it before preparing an autonomous swap.");
  }
}

function normalizeAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/u.test(normalized)) throw new Error("A valid 0x token contract address is required");
  return normalized;
}

function isBuiltIn(address: string): boolean {
  return address === UNISWAP_NATIVE_TOKEN_ADDRESS.toLowerCase() || address === BRIDGE_ROBINHOOD_USDG_ADDRESS.toLowerCase();
}
