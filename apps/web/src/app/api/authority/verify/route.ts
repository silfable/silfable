/* eslint-disable */
// @ts-nocheck
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import { hashDelegatedPolicy, parseDelegatedPolicy } from "@/lib/delegated-authority";
import {
  isAuthFailure,
  requireWalletAuth,
  verifyWalletSignature,
} from "@/lib/wallet-auth";

function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{24}$/iu.test(value);
}

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Delegated-authority storage is unavailable.", code: "AUTHORITY_STORAGE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as {
      walletAddress?: unknown;
      challengeId?: unknown;
      signature?: unknown;
    };
    const identity = await requireWalletAuth(request, body.walletAddress);
    if (isAuthFailure(identity)) return identity;
    if (!isObjectId(body.challengeId) || typeof body.signature !== "string") {
      return NextResponse.json(
        { error: "Authority challenge and wallet signature are required.", code: "INVALID_AUTHORITY_PAYLOAD" },
        { status: 400 },
      );
    }

    const challenge = await cloudDb.delegatedAuthorityChallenge.findUnique({
      where: { id: body.challengeId },
    });
    if (
      !challenge ||
      challenge.walletAddress !== identity.walletAddress ||
      challenge.usedAt ||
      challenge.expiresAt.getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "The authority challenge is invalid, expired, or already used.", code: "AUTHORITY_CHALLENGE_INVALID" },
        { status: 401 },
      );
    }
    if (!verifyWalletSignature({
      walletAddress: identity.walletAddress,
      message: challenge.message,
      signature: body.signature,
    })) {
      return NextResponse.json(
        { error: "The authority signature is invalid.", code: "INVALID_AUTHORITY_SIGNATURE" },
        { status: 401 },
      );
    }

    const policy = parseDelegatedPolicy(challenge.policy);
    if (hashDelegatedPolicy(policy) !== challenge.policyHash) {
      return NextResponse.json(
        { error: "The stored policy no longer matches its signed digest.", code: "AUTHORITY_POLICY_MISMATCH" },
        { status: 409 },
      );
    }
    const safetyState = await cloudDb.walletSafetyState.findUnique({
      where: { userId: identity.userId },
    });
    if (safetyState?.killSwitchEngaged) {
      return NextResponse.json(
        {
          error: "The wallet kill switch is engaged. A separate signed recovery flow is required.",
          code: "KILL_SWITCH_ENGAGED",
        },
        { status: 423 },
      );
    }

    const consumed = await cloudDb.delegatedAuthorityChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      return NextResponse.json(
        { error: "The authority challenge was already consumed.", code: "AUTHORITY_REPLAY_BLOCKED" },
        { status: 409 },
      );
    }

    const user = await cloudDb.user.findUnique({ where: { id: identity.userId } });
    if (!user) return NextResponse.json({ error: "Authenticated user was not found." }, { status: 404 });
    await cloudDb.delegatedAuthority.updateMany({
      where: { walletAddress: identity.walletAddress, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokeReason: "Replaced by a newly signed monitor-only policy.",
      },
    });
    const authority = await cloudDb.delegatedAuthority.create({
      data: {
        userId: user.id,
        walletAddress: identity.walletAddress,
        status: "ACTIVE",
        authorityMode: policy.authorityMode,
        policyHash: challenge.policyHash,
        policy: policy as Prisma.InputJsonValue,
        startsAt: new Date(policy.startsAt),
        expiresAt: new Date(policy.expiresAt),
      },
    });

    return NextResponse.json({
      success: true,
      authority: {
        id: authority.id,
        status: "active",
        authorityMode: authority.authorityMode,
        policyHash: authority.policyHash,
        startsAt: authority.startsAt.toISOString(),
        expiresAt: authority.expiresAt.toISOString(),
        executionAllowed: false,
        signingAllowed: false,
        broadcastAllowed: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not activate authority.";
    return NextResponse.json({ error: message, code: "AUTHORITY_ACTIVATION_FAILED" }, { status: 400 });
  }
}
