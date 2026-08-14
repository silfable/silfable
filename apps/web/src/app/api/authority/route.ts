/* eslint-disable */
// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import { delegatedAuthorityStatus, parseDelegatedPolicy } from "@/lib/delegated-authority";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{24}$/iu.test(value);
}

export async function GET(request: NextRequest) {
  const identity = await requireWalletAuth(request);
  if (isAuthFailure(identity)) return identity;
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Delegated-authority storage is unavailable.", code: "AUTHORITY_STORAGE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const [authorities, safetyState] = await Promise.all([
    cloudDb.delegatedAuthority.findMany({
      where: { walletAddress: identity.walletAddress },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    cloudDb.walletSafetyState.findUnique({
      where: { userId: identity.userId },
    }),
  ]);
  const killSwitchEngaged = safetyState?.killSwitchEngaged ?? false;

  return NextResponse.json({
    walletAddress: identity.walletAddress,
    killSwitch: {
      engaged: killSwitchEngaged,
      engagedAt: safetyState?.engagedAt?.toISOString() ?? null,
      reason: safetyState?.reason ?? null,
    },
    authorities: authorities.map((authority) => {
      const policy = parseDelegatedPolicy(authority.policy, authority.startsAt);
      return {
        id: authority.id,
        status: delegatedAuthorityStatus({
          status: authority.status,
          expiresAt: authority.expiresAt,
          revokedAt: authority.revokedAt,
          killSwitchEngaged,
        }),
        authorityMode: authority.authorityMode,
        policyHash: authority.policyHash,
        capabilities: policy.capabilities,
        allowedMints: policy.allowedMints,
        limits: {
          maxAllocationLamports: policy.maxAllocationLamports,
          maxSingleProposalLamports: policy.maxSingleProposalLamports,
          maxNetworkFeeLamports: policy.maxNetworkFeeLamports,
          maxFeeBps: policy.maxFeeBps,
          maxSlippageBps: policy.maxSlippageBps,
          maxActionsPerHour: policy.maxActionsPerHour,
        },
        startsAt: authority.startsAt.toISOString(),
        expiresAt: authority.expiresAt.toISOString(),
        revokedAt: authority.revokedAt?.toISOString() ?? null,
        executionAllowed: false,
        signingAllowed: false,
        broadcastAllowed: false,
      };
    }),
  });
}

export async function DELETE(request: NextRequest) {
  const identity = await requireWalletAuth(request);
  if (isAuthFailure(identity)) return identity;
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Delegated-authority storage is unavailable.", code: "AUTHORITY_STORAGE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { authorityId?: unknown };
  if (body.authorityId !== undefined && !isObjectId(body.authorityId)) {
    return NextResponse.json(
      { error: "A valid authority identifier is required.", code: "INVALID_AUTHORITY_ID" },
      { status: 400 },
    );
  }
  const result = await cloudDb.delegatedAuthority.updateMany({
    where: {
      walletAddress: identity.walletAddress,
      status: "ACTIVE",
      ...(body.authorityId ? { id: body.authorityId } : {}),
    },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokeReason: "Revoked by the authenticated wallet.",
    },
  });

  return NextResponse.json({
    success: true,
    revokedCount: result.count,
    executionAttempted: false,
  });
}
