import { NextRequest, NextResponse } from "next/server";
import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import { isAuthFailure, normalizeWalletAddress, requireWalletAuth, verifyWalletSignature } from "@/lib/wallet-auth";

function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{24}$/iu.test(value);
}

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "Wallet storage is unavailable." }, { status: 503 });
  const auth = await requireWalletAuth(request);
  if (isAuthFailure(auth)) return auth;
  try {
    const body = await request.json() as { challengeId?: unknown; address?: unknown; signature?: unknown; label?: unknown };
    if (!isObjectId(body.challengeId) || typeof body.signature !== "string") return NextResponse.json({ error: "Challenge and signature are required." }, { status: 400 });
    const address = normalizeWalletAddress(body.address);
    const challenge = await cloudDb.linkedWalletChallenge.findFirst({ where: { id: body.challengeId, userId: auth.userId, namespace: "solana", address } });
    if (!challenge || challenge.usedAt || challenge.expiresAt.getTime() <= Date.now()) return NextResponse.json({ error: "Wallet-link challenge is invalid, expired, or already used." }, { status: 401 });
    if (!verifyWalletSignature({ walletAddress: address, message: challenge.message, signature: body.signature })) return NextResponse.json({ error: "Solana wallet signature is invalid." }, { status: 401 });
    const consumed = await cloudDb.linkedWalletChallenge.updateMany({ where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) return NextResponse.json({ error: "Wallet-link challenge was already consumed." }, { status: 409 });
    const [assignedWallet, user] = await Promise.all([
      cloudDb.linkedWallet.findFirst({ where: { userId: auth.userId, namespace: "solana" } }),
      cloudDb.user.findUnique({ where: { id: auth.userId } }),
    ]);
    const assignedAddress = assignedWallet?.address ?? (user?.primaryNamespace !== "evm" ? user?.walletAddress : null);
    if (assignedAddress && assignedAddress !== address) return NextResponse.json({ error: "This account already has a Solana wallet. Only one Solana wallet is allowed per account." }, { status: 409 });
    const existing = await cloudDb.linkedWallet.findUnique({ where: { namespace_address: { namespace: "solana", address } } });
    if (existing && existing.userId !== auth.userId) return NextResponse.json({ error: "This wallet is already linked to another Silfable account." }, { status: 409 });
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 40) : "Solana wallet";
    const wallet = existing
      ? await cloudDb.linkedWallet.update({ where: { id: existing.id }, data: { label, verifiedAt: new Date() } })
      : await cloudDb.linkedWallet.create({ data: { userId: auth.userId, namespace: "solana", address, label } });
    return NextResponse.json({ wallet: { id: wallet.id, namespace: wallet.namespace, address: wallet.address, label: wallet.label, verifiedAt: wallet.verifiedAt.toISOString() } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify Solana wallet." }, { status: 400 });
  }
}
