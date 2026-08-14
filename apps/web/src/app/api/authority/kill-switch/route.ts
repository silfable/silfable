import { NextRequest, NextResponse } from "next/server";
import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

export async function POST(request: NextRequest) {
  const identity = await requireWalletAuth(request);
  if (isAuthFailure(identity)) return identity;
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Safety-state storage is unavailable.", code: "AUTHORITY_STORAGE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 240)
      : "Emergency stop engaged by the authenticated wallet.";
  const now = new Date();
  const user = await cloudDb.user.findUnique({ where: { id: identity.userId } });
  if (!user) return NextResponse.json({ error: "Authenticated user was not found." }, { status: 404 });

  await Promise.all([
    cloudDb.walletSafetyState.upsert({
      where: { userId: identity.userId },
      create: {
        userId: user.id,
        walletAddress: identity.walletAddress,
        killSwitchEngaged: true,
        reason,
        engagedAt: now,
      },
      update: {
        killSwitchEngaged: true,
        reason,
        engagedAt: now,
      },
    }),
    cloudDb.delegatedAuthority.updateMany({
      where: { userId: identity.userId, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: now,
        revokeReason: "Emergency wallet kill switch engaged.",
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    killSwitchEngaged: true,
    engagedAt: now.toISOString(),
    executionAttempted: false,
    recovery:
      "Disengagement is intentionally unavailable until a separate signed recovery challenge is implemented.",
  });
}
