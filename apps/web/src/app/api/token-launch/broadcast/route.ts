import bs58 from "bs58";
import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { z } from "zod";

import { cloudDb } from "@/lib/cloud-db";
import { inspectPumpLaunchTransaction, TOKEN_2022_PROGRAM_ID } from "@/lib/pump-launch-core";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";
import { selectSolanaRpc } from "@/lib/server-solana-rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  sessionId: z.string().regex(/^[0-9a-f]{24}$/iu),
  walletAddress: z.string().min(32).max(44),
  mintAddress: z.string().min(32).max(44),
  signedTransaction: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/u).max(32_768),
  customRpcUrl: z.string().optional(),
}).strict();

export async function POST(request: NextRequest) {
  let localSignature: string | null = null;
  try {
    const body = RequestSchema.parse(await request.json());
    const auth = await requireWalletAuth(request, body.walletAddress);
    if (isAuthFailure(auth)) return auth;
    const walletAddress = new PublicKey(body.walletAddress).toBase58();
    const mintAddress = new PublicKey(body.mintAddress).toBase58();
    const session = await cloudDb.chatSession.findFirst({
      where: { id: body.sessionId, userId: auth.userId, workspace: "solana", sessionWalletAddress: walletAddress },
      select: { id: true },
    });
    if (!session) throw new Error("A Solana session bound to this creator wallet is required.");
    const bytes = Buffer.from(body.signedTransaction, "base64");
    if (bytes.length === 0 || bytes.length > 16_384) throw new Error("Signed launch transaction size is invalid.");
    const transaction = VersionedTransaction.deserialize(bytes);
    inspectPumpLaunchTransaction(transaction, walletAddress, mintAddress);
    if (!transaction.signatures.every((signature) => signature.some((byte) => byte !== 0))) {
      throw new Error("Token launch is missing the creator or mint signature.");
    }
    localSignature = bs58.encode(transaction.signatures[0]!);
    const connection = new Connection(selectSolanaRpc(body.customRpcUrl), "confirmed");
    const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 2 });
    if (signature !== localSignature) throw new Error("RPC signature does not match the locally derived transaction signature.");
    try {
      const receipt = await connection.confirmTransaction(signature, "confirmed");
      if (receipt.value.err) {
        return NextResponse.json({ signature, mintAddress, status: "failed", error: "Solana rejected the Pump.fun token launch transaction." });
      }
      const mint = await connection.getAccountInfo(new PublicKey(mintAddress), { commitment: "confirmed" });
      const mintVerified = Boolean(mint?.owner.equals(TOKEN_2022_PROGRAM_ID));
      return NextResponse.json({
        signature,
        mintAddress,
        status: mintVerified ? "confirmed" : "submitted",
        mintVerified,
        explorerUrl: `https://solscan.io/tx/${signature}`,
      });
    } catch (cause) {
      return NextResponse.json({
        signature,
        mintAddress,
        status: "unknown",
        mintVerified: false,
        error: cause instanceof Error ? cause.message : "Broadcast succeeded but confirmation is unavailable.",
        explorerUrl: `https://solscan.io/tx/${signature}`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token launch could not be broadcast.";
    return NextResponse.json({
      error: localSignature
        ? "Broadcast status is unknown. Verify the locally derived signature before preparing another launch."
        : message,
      signature: localSignature,
      status: localSignature ? "unknown" : "failed",
      explorerUrl: localSignature ? `https://solscan.io/tx/${localSignature}` : null,
    }, { status: localSignature ? 200 : 400 });
  }
}
