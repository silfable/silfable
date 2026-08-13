import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";
import { RELAY_SOLANA_CHAIN_ID, ROBINHOOD_CHAIN_ID, SOLANA_USDC_MINT } from "@/lib/relay-evm-bridge-core";

export const runtime = "nodejs";

const RELAY_API = "https://api.relay.link";
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const REQUEST_ID = /^0x[a-fA-F0-9]{64}$/u;
const RAW_AMOUNT = /^\d+$/u;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { walletAddress?: unknown; requestId?: unknown; destinationRecipient?: unknown; minimumAmountOut?: unknown };
    const auth = await requireWalletAuth(request, body.walletAddress);
    if (isAuthFailure(auth)) return auth;
    if (typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) throw new Error("Relay request ID is invalid.");
    if (typeof body.destinationRecipient !== "string") throw new Error("Destination recipient is required.");
    const recipient = new PublicKey(body.destinationRecipient).toBase58();
    if (typeof body.minimumAmountOut !== "string" || !RAW_AMOUNT.test(body.minimumAmountOut)) throw new Error("Minimum destination amount is invalid.");
    const headers: Record<string, string> = { accept: "application/json" };
    if (process.env.RELAY_API_KEY) headers["x-api-key"] = process.env.RELAY_API_KEY;
    const response = await fetch(`${RELAY_API}/intents/status/v3?requestId=${encodeURIComponent(body.requestId)}`, { headers, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !payload) throw new Error(`Relay status request failed (${response.status}).`);
    if (Number(payload.originChainId) !== ROBINHOOD_CHAIN_ID || Number(payload.destinationChainId) !== RELAY_SOLANA_CHAIN_ID) throw new Error("Relay status does not match the Robinhood to Solana route.");
    const relayStatus = typeof payload.status === "string" ? payload.status.toLowerCase() : "unknown";
    if (relayStatus !== "success") {
      return NextResponse.json({ relayStatus, destinationConfirmed: false, destinationTxHash: null });
    }
    const hashes = Array.isArray(payload.txHashes) ? payload.txHashes.filter((value): value is string => typeof value === "string") : [];
    const connection = new Connection(SOLANA_RPC, "confirmed");
    for (const hash of hashes) {
      if (!/^[1-9A-HJ-NP-Za-km-z]{64,96}$/u.test(hash)) continue;
      const transaction = await connection.getParsedTransaction(hash, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }).catch(() => null);
      if (!transaction?.meta || transaction.meta.err) continue;
      const received = tokenBalance(transaction.meta.postTokenBalances, recipient) - tokenBalance(transaction.meta.preTokenBalances, recipient);
      if (received >= BigInt(body.minimumAmountOut)) {
        return NextResponse.json({ relayStatus, destinationConfirmed: true, destinationTxHash: hash, receivedAmount: received.toString() });
      }
    }
    return NextResponse.json({ relayStatus, destinationConfirmed: false, destinationTxHash: null, warning: "Relay reported success, but independent Solana USDC settlement verification is still pending." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bridge settlement could not be verified.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function tokenBalance(
  balances: readonly { mint: string; owner?: string; uiTokenAmount: { amount: string } }[] | null | undefined,
  owner: string,
): bigint {
  return (balances ?? []).reduce((total, balance) => {
    if (balance.mint !== SOLANA_USDC_MINT || balance.owner !== owner || !RAW_AMOUNT.test(balance.uiTokenAmount.amount)) return total;
    return total + BigInt(balance.uiTokenAmount.amount);
  }, BigInt(0));
}
