import { NextRequest, NextResponse } from "next/server";
import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import { buildWalletAuthMessage, createOpaqueToken, isAuthFailure, normalizeWalletAddress, requireWalletAuth, sha256, WALLET_CHALLENGE_TTL_MS } from "@/lib/wallet-auth";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "Wallet storage is unavailable." }, { status: 503 });
  const auth = await requireWalletAuth(request);
  if (isAuthFailure(auth)) return auth;
  try {
    const body = await request.json() as { address?: unknown };
    const address = normalizeWalletAddress(body.address);
    const user = await cloudDb.user.findUnique({ where: { id: auth.userId } });
    if (!user) return NextResponse.json({ error: "Authenticated user was not found." }, { status: 404 });
    const recentCount = await cloudDb.linkedWalletChallenge.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60_000) } } });
    if (recentCount >= 5) return NextResponse.json({ error: "Too many wallet-link requests. Try again in one minute." }, { status: 429 });
    const nonce = createOpaqueToken(24);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + WALLET_CHALLENGE_TTL_MS);
    const message = buildWalletAuthMessage({ domain: request.nextUrl.host, uri: request.nextUrl.origin, walletAddress: address, nonce, issuedAt, expiresAt, purpose: "link" });
    const challenge = await cloudDb.linkedWalletChallenge.create({
      data: { userId: user.id, namespace: "solana", address, chainId: 0, nonceHash: sha256(nonce), message, expiresAt, usedAt: null },
    });
    return NextResponse.json({ challengeId: challenge.id, address, message, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Solana wallet-link request." }, { status: 400 });
  }
}

