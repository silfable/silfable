import { NextRequest, NextResponse } from "next/server";
import { cloudDb, isDbConfigured, safeDbQuery } from "@/lib/cloud-db";
import {
  buildWalletAuthMessage,
  createOpaqueToken,
  normalizeWalletAddress,
  sha256,
  WALLET_CHALLENGE_TTL_MS,
} from "@/lib/wallet-auth";
import { buildEvmWalletLinkMessage, normalizeEvmAddress } from "@/lib/evm-wallet-auth-core";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Wallet authentication storage is unavailable.", code: "AUTH_STORAGE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as { walletAddress?: unknown; namespace?: unknown; chainId?: unknown };
    const namespace = body.namespace === "evm" ? "evm" : "solana";
    const walletAddress = namespace === "evm"
      ? normalizeEvmAddress(String(body.walletAddress ?? ""))
      : normalizeWalletAddress(body.walletAddress);
    const chainId = namespace === "evm" && Number.isSafeInteger(body.chainId) && Number(body.chainId) > 0
      ? Number(body.chainId)
      : undefined;
    if (namespace === "evm" && !chainId) throw new Error("A valid EVM chain ID is required.");
    const recentCount = await safeDbQuery(
      () =>
        cloudDb.walletAuthChallenge.count({
          where: {
            walletAddress,
            createdAt: { gte: new Date(Date.now() - 60_000) },
          },
        }),
      0,
    );
    if (recentCount >= 5) {
      return NextResponse.json(
        { error: "Too many authentication requests. Try again in one minute.", code: "AUTH_RATE_LIMITED" },
        { status: 429 },
      );
    }

    const nonce = createOpaqueToken(24);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + WALLET_CHALLENGE_TTL_MS);
    const domain = request.nextUrl.host;
    const uri = request.nextUrl.origin;
    const message = namespace === "evm"
      ? buildEvmWalletLinkMessage({ domain, uri, address: walletAddress as `0x${string}`, chainId: chainId!, nonce, issuedAt, expiresAt, purpose: "login" })
      : buildWalletAuthMessage({ domain, uri, walletAddress, nonce, issuedAt, expiresAt });
    const challenge = await cloudDb.walletAuthChallenge.create({
      data: {
        walletAddress,
        namespace,
        chainId,
        nonceHash: sha256(nonce),
        message,
        expiresAt,
        // MongoDB distinguishes a missing optional field from an explicit null.
        // Persist null so the atomic consume filter can match new challenges.
        usedAt: null,
      },
    });

    return NextResponse.json({
      challengeId: challenge.id,
      walletAddress,
      namespace,
      chainId,
      message,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create wallet challenge.";
    return NextResponse.json({ error: message, code: "AUTH_CHALLENGE_FAILED" }, { status: 400 });
  }
}
