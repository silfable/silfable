import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { z } from "zod";

import { TOKEN_2022_PROGRAM_ID } from "@/lib/pump-launch-core";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";
import { selectSolanaRpc } from "@/lib/server-solana-rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  walletAddress: z.string().min(32).max(44),
  signature: z.string().min(64).max(96),
  mintAddress: z.string().min(32).max(44),
  customRpcUrl: z.string().optional(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const body = RequestSchema.parse(await request.json());
    const auth = await requireWalletAuth(request, body.walletAddress);
    if (isAuthFailure(auth)) return auth;
    const connection = new Connection(selectSolanaRpc(body.customRpcUrl), "confirmed");
    const [status, transaction, mint] = await Promise.all([
      connection.getSignatureStatus(body.signature, { searchTransactionHistory: true }),
      connection.getTransaction(body.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }),
      connection.getAccountInfo(new PublicKey(body.mintAddress), { commitment: "confirmed" }),
    ]);
    if (status.value?.err || transaction?.meta?.err) {
      return NextResponse.json({ status: "failed", mintVerified: false, error: "The token launch transaction failed on Solana." });
    }
    const mintVerified = Boolean(mint?.owner.equals(TOKEN_2022_PROGRAM_ID));
    if (!transaction || !mintVerified) return NextResponse.json({ status: "unknown", mintVerified: false });
    return NextResponse.json({
      status: "confirmed",
      mintVerified: true,
      slot: transaction.slot,
      networkFeeLamports: transaction.meta?.fee ?? null,
      explorerUrl: `https://solscan.io/tx/${body.signature}`,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Launch verification failed." }, { status: 400 });
  }
}
