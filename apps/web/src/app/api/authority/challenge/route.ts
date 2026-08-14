/* eslint-disable */
// @ts-nocheck
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import {
  buildDelegatedAuthorityMessage,
  DELEGATED_AUTHORITY_CHALLENGE_TTL_MS,
  hashDelegatedPolicy,
  parseDelegatedPolicy,
} from "@/lib/delegated-authority";
import {
  createOpaqueToken,
  isAuthFailure,
  requireWalletAuth,
  sha256,
} from "@/lib/wallet-auth";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Delegated-authority storage is unavailable.", code: "AUTHORITY_STORAGE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as { walletAddress?: unknown; policy?: unknown };
    const identity = await requireWalletAuth(request, body.walletAddress);
    if (isAuthFailure(identity)) return identity;

    const policy = parseDelegatedPolicy(body.policy);
    const recentCount = await cloudDb.delegatedAuthorityChallenge.count({
      where: {
        walletAddress: identity.walletAddress,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (recentCount >= 3) {
      return NextResponse.json(
        { error: "Too many authority requests. Try again in one minute.", code: "AUTHORITY_RATE_LIMITED" },
        { status: 429 },
      );
    }

    const nonce = createOpaqueToken(24);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + DELEGATED_AUTHORITY_CHALLENGE_TTL_MS);
    const message = buildDelegatedAuthorityMessage({
      domain: request.nextUrl.host,
      uri: request.nextUrl.origin,
      walletAddress: identity.walletAddress,
      nonce,
      policy,
      issuedAt,
      challengeExpiresAt: expiresAt,
    });
    const challenge = await cloudDb.delegatedAuthorityChallenge.create({
      data: {
        walletAddress: identity.walletAddress,
        nonceHash: sha256(nonce),
        policyHash: hashDelegatedPolicy(policy),
        policy: policy as Prisma.InputJsonValue,
        message,
        expiresAt,
      },
    });

    return NextResponse.json({
      challengeId: challenge.id,
      walletAddress: identity.walletAddress,
      message,
      policyHash: challenge.policyHash,
      expiresAt: expiresAt.toISOString(),
      authorityMode: "monitor-propose",
      executionAllowed: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create authority challenge.";
    return NextResponse.json({ error: message, code: "AUTHORITY_CHALLENGE_FAILED" }, { status: 400 });
  }
}

