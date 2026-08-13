import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";

import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

export const runtime = "nodejs";

const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const RELAY_SOURCE_PROGRAM = "99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2";
const MAX_SERIALIZED_TRANSACTION_BYTES = 16_384;

function decodeTransaction(value: unknown): VersionedTransaction {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    throw new Error("Signed bridge transaction is invalid.");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.length > MAX_SERIALIZED_TRANSACTION_BYTES) {
    throw new Error("Signed bridge transaction has an invalid size.");
  }
  return VersionedTransaction.deserialize(bytes);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { walletAddress?: unknown; signedTransaction?: unknown };
    const auth = await requireWalletAuth(request, body.walletAddress);
    if (isAuthFailure(auth)) return auth;
    if (typeof body.walletAddress !== "string") throw new Error("Connected Solana wallet is required.");

    const walletAddress = new PublicKey(body.walletAddress).toBase58();
    const transaction = decodeTransaction(body.signedTransaction);
    const payer = transaction.message.staticAccountKeys[0]?.toBase58();
    if (payer !== walletAddress) throw new Error("Signed transaction payer does not match the connected wallet.");
    if (!transaction.signatures.every((signature) => signature.some((byte) => byte !== 0))) {
      throw new Error("Bridge transaction is missing a required wallet signature.");
    }
    if (!transaction.message.staticAccountKeys.some((key) => key.toBase58() === RELAY_SOURCE_PROGRAM)) {
      throw new Error("Signed transaction is not a pinned Relay bridge transaction.");
    }

    const connection = new Connection(SOLANA_RPC, "confirmed");
    const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 2 });
    try {
      const receipt = await connection.confirmTransaction(signature, "confirmed");
      if (receipt.value.err) {
        return NextResponse.json({ signature, confirmed: false, error: `Solana rejected the bridge source transaction: ${JSON.stringify(receipt.value.err)}` });
      }
      return NextResponse.json({ signature, confirmed: true });
    } catch (cause) {
      return NextResponse.json({
        signature,
        confirmed: false,
        error: cause instanceof Error ? cause.message : "Source transaction was submitted but confirmation is unavailable.",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bridge transaction could not be broadcast.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
