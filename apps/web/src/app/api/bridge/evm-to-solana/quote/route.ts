import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";
import {
  parseRelayEvmQuote,
  RELAY_SOLANA_CHAIN_ID,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_USDG_ADDRESS,
  SOLANA_USDC_MINT,
} from "@/lib/relay-evm-bridge-core";

export const runtime = "nodejs";

const RELAY_API = "https://api.relay.link";
const ADDRESS = /^0x[0-9a-f]{40}$/iu;
const DECIMAL_USDG = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u;

function parseAmount(value: unknown): { decimal: string; raw: string; maximumTotalFeeUsd: number } {
  if (typeof value !== "string" || !DECIMAL_USDG.test(value)) throw new Error("Amount must be a positive USDG decimal with up to 6 decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const raw = BigInt(whole) * BigInt(1_000_000) + BigInt((fraction + "000000").slice(0, 6));
  if (raw < BigInt(10_000) || raw > BigInt(1_000_000_000)) throw new Error("Bridge amount must be between 0.01 and 1,000 USDG.");
  const decimal = Number(value);
  return { decimal: value, raw: raw.toString(), maximumTotalFeeUsd: Math.min(5, Math.max(0.05, decimal * 0.1)) };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      walletAddress?: unknown;
      destinationRecipient?: unknown;
      amountUsdg?: unknown;
      maxSlippageBps?: unknown;
    };
    const auth = await requireWalletAuth(request, body.walletAddress);
    if (isAuthFailure(auth)) return auth;
    if (typeof body.walletAddress !== "string" || !ADDRESS.test(body.walletAddress)) throw new Error("A valid bound Robinhood wallet is required.");
    if (typeof body.destinationRecipient !== "string") throw new Error("A Solana recipient is required.");
    const destinationRecipient = new PublicKey(body.destinationRecipient).toBase58();
    const amount = parseAmount(body.amountUsdg);
    const maxSlippageBps = Math.max(1, Math.min(500, Number(body.maxSlippageBps ?? 100) || 100));
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    if (process.env.RELAY_API_KEY) headers["x-api-key"] = process.env.RELAY_API_KEY;
    const response = await fetch(`${RELAY_API}/quote/v2`, {
      method: "POST",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        user: body.walletAddress,
        recipient: destinationRecipient,
        refundTo: body.walletAddress,
        originChainId: ROBINHOOD_CHAIN_ID,
        destinationChainId: RELAY_SOLANA_CHAIN_ID,
        originCurrency: ROBINHOOD_USDG_ADDRESS,
        destinationCurrency: SOLANA_USDC_MINT,
        amount: amount.raw,
        tradeType: "EXACT_INPUT",
        explicitDeposit: true,
        usePermit: false,
        useFallbacks: true,
        slippageTolerance: String(maxSlippageBps),
      }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const provider = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
      const providerMessage = typeof provider?.message === "string" ? provider.message : typeof provider?.error === "string" ? provider.error : null;
      throw new Error(providerMessage ?? `Relay quote request failed (${response.status}).`);
    }
    const quote = parseRelayEvmQuote({ payload, walletAddress: body.walletAddress, amountIn: amount.raw, maximumTotalFeeUsd: amount.maximumTotalFeeUsd });
    return NextResponse.json({
      ...quote,
      amountIn: amount.raw,
      amountDecimal: amount.decimal,
      destinationRecipient,
      quoteExpiresAt: Date.now() + 90_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Robinhood to Solana bridge quote could not be prepared.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
