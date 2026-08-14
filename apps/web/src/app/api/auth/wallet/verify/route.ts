import { NextRequest, NextResponse } from "next/server";
import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import {
  createOpaqueToken,
  normalizeWalletAddress,
  setWalletSessionCookie,
  sha256,
  verifyWalletSignature,
  WALLET_SESSION_TTL_MS,
} from "@/lib/wallet-auth";
import { normalizeEvmAddress } from "@/lib/evm-wallet-auth-core";
import { verifyMessage } from "viem";

function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{24}$/iu.test(value);
}

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Wallet authentication storage is unavailable.", code: "AUTH_STORAGE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as {
      challengeId?: unknown;
      walletAddress?: unknown;
      signature?: unknown;
    };
    if (!isObjectId(body.challengeId) || typeof body.signature !== "string") {
      return NextResponse.json(
        { error: "Challenge and signature are required.", code: "INVALID_AUTH_PAYLOAD" },
        { status: 400 },
      );
    }
    const challenge = await cloudDb.walletAuthChallenge.findUnique({
      where: { id: body.challengeId },
    });
    const namespace = challenge?.namespace === "evm" ? "evm" : "solana";
    const walletAddress = namespace === "evm"
      ? normalizeEvmAddress(String(body.walletAddress ?? ""))
      : normalizeWalletAddress(body.walletAddress);
    if (
      !challenge ||
      challenge.walletAddress !== walletAddress ||
      challenge.usedAt ||
      challenge.expiresAt.getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "The authentication challenge is invalid, expired, or already used.", code: "AUTH_CHALLENGE_INVALID" },
        { status: 401 },
      );
    }
    const signatureValid = namespace === "evm"
      ? await verifyMessage({ address: walletAddress as `0x${string}`, message: challenge.message, signature: body.signature as `0x${string}` }).catch(() => false)
      : verifyWalletSignature({ walletAddress, message: challenge.message, signature: body.signature });
    if (!signatureValid) {
      return NextResponse.json(
        { error: "The wallet signature is invalid.", code: "INVALID_WALLET_SIGNATURE" },
        { status: 401 },
      );
    }

    const consumed = await cloudDb.walletAuthChallenge.updateMany({
      where: {
        id: challenge.id,
        // Older challenge documents may not contain `usedAt` at all. MongoDB
        // does not treat a missing field as null, so accept both shapes while
        // retaining the atomic one-time-consumption guard.
        OR: [
          { usedAt: null },
          { usedAt: { isSet: false } },
        ],
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      return NextResponse.json(
        { error: "The authentication challenge was already consumed.", code: "AUTH_REPLAY_BLOCKED" },
        { status: 409 },
      );
    }

    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + WALLET_SESSION_TTL_MS);
    const linkedWallet = await cloudDb.linkedWallet.findUnique({
      where: { namespace_address: { namespace, address: walletAddress } },
      include: { user: true },
    });
    let user = linkedWallet?.user ?? await cloudDb.user.findUnique({ where: { walletAddress } });
    if (!user) {
      user = await cloudDb.user.create({ data: { walletAddress, primaryNamespace: namespace } });
    }
    if (!linkedWallet) {
      await cloudDb.linkedWallet.create({
        data: {
          userId: user.id,
          namespace,
          address: walletAddress,
          label: namespace === "evm" ? "Primary EVM" : "Primary Solana",
        },
      }).catch(async () => {
        const owner = await cloudDb.linkedWallet.findUnique({ where: { namespace_address: { namespace, address: walletAddress } } });
        if (!owner || owner.userId !== user!.id) throw new Error("This wallet belongs to another Silfable account.");
      });
    }

    const session = await cloudDb.walletAuthSession.create({
      data: {
        userId: user.id,
        walletAddress,
        namespace,
        tokenHash: sha256(token),
        expiresAt,
      },
    });
    const response = NextResponse.json({
      authenticated: true,
      userId: user.id,
      namespace,
      walletAddress,
      sessionId: session.id,
      expiresAt: expiresAt.toISOString(),
      authority: "restricted-browser-wallet",
    });
    setWalletSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wallet authentication failed.";
    return NextResponse.json({ error: message, code: "WALLET_AUTH_FAILED" }, { status: 400 });
  }
}
