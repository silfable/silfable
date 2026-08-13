import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { z } from "zod";

import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";
import { selectSolanaRpc } from "@/lib/server-solana-rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  walletAddress: z.string().min(32).max(44),
  signature: z.string().min(64).max(96),
  customRpcUrl: z.string().optional(),
}).strict();

// HTTP-only verification deliberately avoids Connection.confirmTransaction(),
// whose WebSocket subscription can fail independently of a valid broadcast.
export async function POST(request: NextRequest) {
  try {
    const body = RequestSchema.parse(await request.json());
    const auth = await requireWalletAuth(request, body.walletAddress);
    if (isAuthFailure(auth)) return auth;

    const connection = new Connection(selectSolanaRpc(body.customRpcUrl), "confirmed");
    const status = await connection.getSignatureStatus(body.signature, { searchTransactionHistory: true });
    if (status.value?.err) {
      return NextResponse.json({ status: "failed", error: "Solana rejected this transaction.", err: status.value.err });
    }
    const confirmation = status.value?.confirmationStatus;
    if (confirmation === "confirmed" || confirmation === "finalized") {
      return NextResponse.json({ status: "confirmed", slot: status.value?.slot ?? null, confirmationStatus: confirmation });
    }
    return NextResponse.json({ status: "pending" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Solana transaction verification failed." }, { status: 400 });
  }
}
