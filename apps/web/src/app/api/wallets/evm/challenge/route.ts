import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import { createOpaqueToken, isAuthFailure, requireWalletAuth, sha256, WALLET_CHALLENGE_TTL_MS } from "@/lib/wallet-auth";
import { buildEvmWalletLinkMessage, normalizeEvmAddress } from "@/lib/evm-wallet-auth-core";

const bodySchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/u),
  chainId: z.number().int().positive().max(2_147_483_647),
}).strict();

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "Wallet storage is unavailable." }, { status: 503 });
  const auth = await requireWalletAuth(request);
  if (isAuthFailure(auth)) return auth;
  try {
    const body = bodySchema.parse(await request.json());
    const address = normalizeEvmAddress(body.address);
    const user = await cloudDb.user.findUnique({ where: { id: auth.userId } });
    if (!user) return NextResponse.json({ error: "Authenticated user was not found." }, { status: 404 });

    const recentCount = await cloudDb.linkedWalletChallenge.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60_000) } },
    });
    if (recentCount >= 5) return NextResponse.json({ error: "Too many wallet-link requests. Try again in one minute." }, { status: 429 });

    const nonce = createOpaqueToken(24);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + WALLET_CHALLENGE_TTL_MS);
    const message = buildEvmWalletLinkMessage({ domain: request.nextUrl.host, uri: request.nextUrl.origin, address, chainId: body.chainId, nonce, issuedAt, expiresAt });
    const challenge = await cloudDb.linkedWalletChallenge.create({
      data: { userId: user.id, namespace: "evm", address, chainId: body.chainId, nonceHash: sha256(nonce), message, expiresAt, usedAt: null },
    });
    return NextResponse.json({ challengeId: challenge.id, address, chainId: body.chainId, message, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid EVM wallet-link request." }, { status: 400 });
  }
}
