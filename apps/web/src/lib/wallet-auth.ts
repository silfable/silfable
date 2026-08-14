/* eslint-disable */
// @ts-nocheck
import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cloudDb, isDbConfigured, safeDbQuery } from "@/lib/cloud-db";
import {
  normalizeWalletAddress,
  sha256,
} from "@/lib/wallet-auth-crypto";
import { normalizeEvmAddress } from "@/lib/evm-wallet-auth-core";

export {
  buildWalletAuthMessage,
  createOpaqueToken,
  normalizeWalletAddress,
  sha256,
  verifyWalletSignature,
} from "@/lib/wallet-auth-crypto";

export const WALLET_AUTH_COOKIE = "silfable_wallet_session";
export const WALLET_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const WALLET_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type WalletAuthIdentity = {
  sessionId: string;
  userId: string;
  namespace: "solana" | "evm";
  walletAddress: string;
  accountWalletAddress: string;
  accountNamespace: "solana" | "evm";
  expiresAt: Date;
};

export async function readWalletAuth(request: NextRequest): Promise<WalletAuthIdentity | null> {
  if (!isDbConfigured()) return null;
  const token = request.cookies.get(WALLET_AUTH_COOKIE)?.value;
  if (!token || token.length < 32 || token.length > 256) return null;

  const session = await safeDbQuery(
    () =>
      cloudDb.walletAuthSession.findUnique({
        where: { tokenHash: sha256(token) },
      }),
    null,
  );
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;

  const user = session.userId
    ? await safeDbQuery(() => cloudDb.user.findUnique({ where: { id: session.userId! } }), null)
    : await safeDbQuery(() => cloudDb.user.findUnique({ where: { walletAddress: session.walletAddress } }), null);
  if (!user) return null;

  return {
    sessionId: session.id,
    userId: user.id,
    namespace: session.namespace === "evm" ? "evm" : "solana",
    walletAddress: session.walletAddress,
    accountWalletAddress: user.walletAddress,
    accountNamespace: user.primaryNamespace === "evm" ? "evm" : "solana",
    expiresAt: session.expiresAt,
  };
}

export async function requireWalletAuth(
  request: NextRequest,
  requestedWallet?: unknown,
): Promise<WalletAuthIdentity | NextResponse> {
  const identity = await readWalletAuth(request);
  if (!identity) {
    return NextResponse.json(
      { error: "Wallet authentication is required.", code: "WALLET_AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  if (requestedWallet !== undefined) {
    let normalized: string;
    try {
      normalized = typeof requestedWallet === "string" && /^0x[0-9a-f]{40}$/iu.test(requestedWallet)
        ? normalizeEvmAddress(requestedWallet)
        : normalizeWalletAddress(requestedWallet);
    } catch {
      return NextResponse.json(
        { error: "The requested wallet address is invalid.", code: "INVALID_WALLET" },
        { status: 400 },
      );
    }
    const isAuthenticatedWallet = normalized.toLowerCase() === identity.walletAddress.toLowerCase();
    const isAccountPrimary = normalized.toLowerCase() === identity.accountWalletAddress.toLowerCase();
    const linkedWallet = isAuthenticatedWallet || isAccountPrimary
      ? null
      : await safeDbQuery(() => cloudDb.linkedWallet.findFirst({
          where: { userId: identity.userId, address: normalized },
          select: { id: true },
        }), null);
    if (!isAuthenticatedWallet && !isAccountPrimary && !linkedWallet) {
      return NextResponse.json(
        { error: "The authenticated wallet does not own this request.", code: "WALLET_SCOPE_MISMATCH" },
        { status: 403 },
      );
    }
  }
  return identity;
}

export function isAuthFailure(
  value: WalletAuthIdentity | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

export function setWalletSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set({
    name: WALLET_AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function clearWalletSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: WALLET_AUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}
