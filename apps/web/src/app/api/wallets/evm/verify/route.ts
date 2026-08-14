import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { z } from "zod";
import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";
import { normalizeEvmAddress } from "@/lib/evm-wallet-auth-core";

const bodySchema = z.object({
  challengeId: z.string().regex(/^[0-9a-f]{24}$/iu),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/u),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/u).max(1_000),
  label: z.string().trim().min(1).max(40).optional(),
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
    const challenge = await cloudDb.linkedWalletChallenge.findFirst({
      where: { id: body.challengeId, userId: user.id, namespace: "evm", address },
    });
    if (!challenge || challenge.usedAt || challenge.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Wallet-link challenge is invalid, expired, or already used." }, { status: 401 });
    }
    const valid = await verifyMessage({ address, message: challenge.message, signature: body.signature as `0x${string}` });
    if (!valid) return NextResponse.json({ error: "EVM wallet signature is invalid." }, { status: 401 });
    const consumed = await cloudDb.linkedWalletChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return NextResponse.json({ error: "Wallet-link challenge was already consumed." }, { status: 409 });

    const assignedWallet = await cloudDb.linkedWallet.findFirst({ where: { userId: user.id, namespace: "evm" } });
    const assignedAddress = assignedWallet?.address ?? (user.primaryNamespace === "evm" ? user.walletAddress : null);
    if (assignedAddress && assignedAddress.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ error: "This account already has a Robinhood wallet. Only one EVM wallet is allowed per account." }, { status: 409 });
    }

    const existing = await cloudDb.linkedWallet.findUnique({
      where: { namespace_address: { namespace: "evm", address } },
    });
    if (existing && existing.userId !== user.id) {
      return NextResponse.json({ error: "This wallet is already linked to another Silfable account." }, { status: 409 });
    }
    const wallet = existing
      ? await cloudDb.linkedWallet.update({
          where: { id: existing.id },
          data: { label: body.label ?? undefined, verifiedAt: new Date() },
        })
      : await cloudDb.linkedWallet.create({
          data: { userId: user.id, namespace: "evm", address, label: body.label ?? "EVM wallet" },
        });
    return NextResponse.json({ wallet: { id: wallet.id, namespace: wallet.namespace, address: wallet.address, label: wallet.label, verifiedAt: wallet.verifiedAt.toISOString() } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify EVM wallet." }, { status: 400 });
  }
}
