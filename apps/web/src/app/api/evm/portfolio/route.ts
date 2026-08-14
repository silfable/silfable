import { NextRequest, NextResponse } from "next/server";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

const ADDRESS = /^0x[0-9a-f]{40}$/iu;
const BLOCKSCOUT = "https://robinhoodchain.blockscout.com/api/v2";

type BlockscoutBalance = {
  value?: unknown;
  token?: {
    address_hash?: unknown;
    decimals?: unknown;
    exchange_rate?: unknown;
    reputation?: unknown;
    symbol?: unknown;
    type?: unknown;
  };
};

export async function GET(request: NextRequest) {
  try {
    const walletAddress = new URL(request.url).searchParams.get("walletAddress");
    const auth = await requireWalletAuth(request, walletAddress);
    if (isAuthFailure(auth)) return auth;
    if (!walletAddress || !ADDRESS.test(walletAddress)) return NextResponse.json({ error: "A valid bound EVM wallet is required." }, { status: 400 });

    const response = await fetch(`${BLOCKSCOUT}/addresses/${walletAddress}/token-balances`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return NextResponse.json({ error: `Robinhood token index returned ${response.status}.` }, { status: 502 });
    const balances = await response.json() as BlockscoutBalance[];
    const tokens = Array.isArray(balances) ? balances.flatMap((entry) => {
      const token = entry.token;
      const address = typeof token?.address_hash === "string" ? token.address_hash.toLowerCase() : "";
      const decimals = typeof token?.decimals === "string" && /^\d{1,2}$/u.test(token.decimals) ? Number(token.decimals) : Number.NaN;
      const value = typeof entry.value === "string" && /^\d+$/u.test(entry.value) ? entry.value : "";
      const symbol = typeof token?.symbol === "string" && /^[\x20-\x7e]{1,32}$/u.test(token.symbol.trim()) ? token.symbol.trim() : "Token";
      const exchangeRate = typeof token?.exchange_rate === "string" && /^\d+(?:\.\d+)?$/u.test(token.exchange_rate) ? Number(token.exchange_rate) : null;
      if (!ADDRESS.test(address) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36 || !value || BigInt(value) === BigInt(0) || token?.type !== "ERC-20" || token.reputation === "scam") return [];
      return [{ address, symbol, decimals, rawBalance: value, exchangeRate }];
    }) : [];
    return NextResponse.json({ tokens });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Robinhood token balances are unavailable.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
