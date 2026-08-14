import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

const DEFAULT_MAINNET_RPC =
  process.env.SOLANA_RPC_URL
  || process.env.NEXT_PUBLIC_SOLANA_RPC_URL
  || "https://api.mainnet-beta.solana.com";
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const ALLOWED_RPC_HOST_SUFFIXES = [
  ".helius-rpc.com",
  ".quiknode.pro",
  ".alchemy.com",
  ".triton.one",
  ".ankr.com",
];

function validateCustomRpcUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The RPC URL is invalid.");
  }
  if (url.protocol !== "https:") throw new Error("The RPC URL must use HTTPS.");
  if (url.username || url.password || url.port) throw new Error("The RPC URL cannot include credentials or a custom port.");
  if (url.hostname === "mainnet-helius-rpc.com") {
    throw new Error("Invalid Helius hostname. Use mainnet.helius-rpc.com, not mainnet-helius-rpc.com.");
  }
  const hostname = url.hostname.toLowerCase();
  if (!ALLOWED_RPC_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("This RPC provider is not supported by the Silfable web proxy.");
  }
  return url.toString();
}

async function readBalance(endpoint: string, address: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "silfable-portfolio",
      method: "getBalance",
      params: [address, { commitment: "confirmed" }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`RPC merespons HTTP ${response.status}.`);
  const body = await response.json() as {
    result?: { context?: { slot?: unknown }; value?: unknown };
    error?: { message?: unknown };
  };
  if (body.error) {
    throw new Error(typeof body.error.message === "string" ? body.error.message : "The RPC rejected the balance request.");
  }
  const lamports = body.result?.value;
  const slot = body.result?.context?.slot;
  if (typeof lamports !== "number" || !Number.isSafeInteger(lamports) || lamports < 0) {
    throw new Error("The RPC returned an invalid balance.");
  }
  return { lamports, slot: typeof slot === "number" ? slot : null };
}

async function quoteAssetValueUsd(mint: string, rawAmount: string): Promise<number> {
  if (!/^\d+$/u.test(rawAmount) || BigInt(rawAmount) === BigInt(0)) return 0;
  if (mint === USDC_MINT) return Number(BigInt(rawAmount)) / 1_000_000;
  const url = new URL("https://lite-api.jup.ag/swap/v1/quote");
  url.searchParams.set("inputMint", mint);
  url.searchParams.set("outputMint", USDC_MINT);
  url.searchParams.set("amount", rawAmount);
  url.searchParams.set("slippageBps", "100");
  url.searchParams.set("restrictIntermediateTokens", "true");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  const quote = await response.json().catch(() => null) as { outAmount?: unknown } | null;
  return response.ok && typeof quote?.outAmount === "string" && /^\d+$/u.test(quote.outAmount)
    ? Number(BigInt(quote.outAmount)) / 1_000_000
    : 0;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { address?: unknown; customRpcUrl?: unknown };
    const auth = await requireWalletAuth(request, body.address);
    if (isAuthFailure(auth)) return auth;
    if (typeof body.address !== "string") throw new Error("A wallet address is required.");
    const address = new PublicKey(body.address).toBase58();
    const customRpcUrl = validateCustomRpcUrl(body.customRpcUrl);
    const solResult = await readBalance(customRpcUrl ?? DEFAULT_MAINNET_RPC, address);
    
    // Fetch SPL Tokens
    const tokensResponse = await fetch(customRpcUrl ?? DEFAULT_MAINNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "silfable-portfolio-spl",
        method: "getTokenAccountsByOwner",
        params: [
          address,
          { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
          { encoding: "jsonParsed", commitment: "confirmed" }
        ]
      }),
      cache: "no-store",
    }).catch(() => null);

    const tokensBody = tokensResponse ? await tokensResponse.json().catch(() => null) : null;
    
    const assets: Array<{ mint: string; symbol: string; amount: number; rawAmount: string; valueUsd: number }> = [];
    assets.push({ mint: WRAPPED_SOL_MINT, symbol: "SOL", amount: solResult.lamports / 1e9, rawAmount: String(solResult.lamports), valueUsd: 0 });

    if (tokensBody?.result?.value) {
      for (const item of tokensBody.result.value) {
        const info = item.account?.data?.parsed?.info;
        if (!info) continue;
        const amount = info.tokenAmount?.uiAmount;
        if (amount > 0) {
          // Identify USDC for better display
          const isUsdc = info.mint === USDC_MINT;
          assets.push({
            mint: info.mint,
            symbol: isUsdc ? "USDC" : "SPL",
            amount,
            rawAmount: String(info.tokenAmount?.amount ?? "0"),
            valueUsd: 0
          });
        }
      }
    }

    const values = await Promise.all(assets.map((asset) => quoteAssetValueUsd(asset.mint, asset.rawAmount).catch(() => 0)));
    let totalUsd = 0;
    assets.forEach((asset, index) => {
      asset.valueUsd = values[index] ?? 0;
      totalUsd += asset.valueUsd;
    });

    return NextResponse.json({
      address,
      lamports: solResult.lamports,
      sol: solResult.lamports / 1_000_000_000,
      assets: assets.map((asset) => ({ mint: asset.mint, symbol: asset.symbol, amount: asset.amount, valueUsd: asset.valueUsd })),
      totalUsd,
      slot: solResult.slot,
      source: customRpcUrl ? "custom" : "default",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load the Mainnet balance.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
