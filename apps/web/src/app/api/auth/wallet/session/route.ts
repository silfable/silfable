import { NextRequest, NextResponse } from "next/server";
import {
  clearWalletSessionCookie,
  readWalletAuth,
  sha256,
  WALLET_AUTH_COOKIE,
} from "@/lib/wallet-auth";
import { cloudDb } from "@/lib/cloud-db";

export async function GET(request: NextRequest) {
  const identity = await readWalletAuth(request);
  if (!identity) {
    return NextResponse.json({ authenticated: false, authority: "none" });
  }
  return NextResponse.json({
    authenticated: true,
    userId: identity.userId,
    namespace: identity.namespace,
    walletAddress: identity.walletAddress,
    expiresAt: identity.expiresAt.toISOString(),
    authority: "restricted-browser-wallet",
  });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(WALLET_AUTH_COOKIE)?.value;
  if (token) {
    await cloudDb.walletAuthSession
      .updateMany({
        where: { tokenHash: sha256(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  const response = NextResponse.json({ authenticated: false, authority: "none" });
  clearWalletSessionCookie(response);
  return response;
}
