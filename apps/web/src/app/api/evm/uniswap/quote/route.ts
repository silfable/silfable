import { NextRequest, NextResponse } from "next/server";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";
import { resolveRobinhoodToken } from "@/lib/robinhood-token";

const API_URL = "https://trade-api.gateway.uniswap.org/v1/quote";
const CHAIN_ID = 4_663;
const ADDRESS = /^0x[0-9a-f]{40}$/iu;
const RAW = /^[1-9]\d*$/u;

function decimalToRaw(amount: unknown, decimals: number): string | null {
  if (typeof amount !== "string" || !/^\d+(?:\.\d+)?$/u.test(amount)) return null;
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) return null;
  const raw = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+/u, "");
  return RAW.test(raw) ? raw : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function upstreamMessage(payload: unknown): string | null {
  const record = asRecord(payload);
  const nested = asRecord(record?.error);
  for (const value of [record?.detail, record?.message, nested?.detail, nested?.message]) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 240);
  }
  return null;
}

async function requestUniswapQuote(apiKey: string, body: Record<string, unknown>): Promise<{ response: Response; payload: unknown }> {
  const run = async () => {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { Accept: "application/json", "content-type": "application/json", "x-api-key": apiKey, "x-permit2-disabled": "true", "x-universal-router-version": "2.1.1" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const raw = await response.text();
    let payload: unknown = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw.slice(0, 240); }
    return { response, payload };
  };

  const first = await run();
  if (![404, 429, 502, 503, 504].includes(first.response.status)) return first;
  await new Promise((resolve) => setTimeout(resolve, 350));
  return run();
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json() as { walletAddress?: unknown; apiKey?: unknown; sellToken?: unknown; buyToken?: unknown; amount?: unknown; slippageBps?: unknown };
    const auth = await requireWalletAuth(request, input.walletAddress);
    if (isAuthFailure(auth)) return auth;
    if (typeof input.walletAddress !== "string" || !ADDRESS.test(input.walletAddress)) return NextResponse.json({ error: "A valid bound EVM wallet is required." }, { status: 400 });
    if (typeof input.apiKey !== "string" || input.apiKey.trim().length < 8) return NextResponse.json({ error: "Configure and verify a Uniswap Trading API key in Settings before preparing a Robinhood swap." }, { status: 400 });
    const [sellToken, buyToken] = await Promise.all([resolveRobinhoodToken(input.sellToken), resolveRobinhoodToken(input.buyToken)]);
    if (!sellToken || !buyToken) return NextResponse.json({ error: "Provide a valid Robinhood ERC-20 contract address. ETH and USDG are recognized automatically." }, { status: 400 });
    const tokenIn = sellToken.address;
    const tokenOut = buyToken.address;
    if (tokenIn === tokenOut) return NextResponse.json({ error: "The input and output token must differ." }, { status: 400 });
    const amountIn = decimalToRaw(input.amount, sellToken.decimals);
    if (!amountIn) return NextResponse.json({ error: "Swap amount must be a positive value with supported token precision." }, { status: 400 });
    const slippageBps = Math.max(1, Math.min(500, Number(input.slippageBps) || 100));
    const { response, payload: body } = await requestUniswapQuote(input.apiKey.trim(), { type: "EXACT_INPUT", amount: amountIn, tokenInChainId: CHAIN_ID, tokenOutChainId: CHAIN_ID, tokenIn, tokenOut, swapper: input.walletAddress, recipient: input.walletAddress, slippageTolerance: slippageBps / 100, routingPreference: "BEST_PRICE", protocols: ["V2", "V3", "V4"] });
    if (!response.ok) {
      const detail = upstreamMessage(body);
      if (response.status === 404) {
        return NextResponse.json({ error: `No live Uniswap route is currently available for ${sellToken.symbol} → ${buyToken.symbol}${detail ? ` (${detail})` : ""}. No transaction was prepared.` }, { status: 422 });
      }
      if (response.status === 429) return NextResponse.json({ error: "Uniswap temporarily rate-limited the quote request. Wait a moment, then retry; no transaction was prepared." }, { status: 503 });
      return NextResponse.json({ error: `Uniswap could not prepare this quote${detail ? `: ${detail}` : ` (HTTP ${response.status})`}. No transaction was prepared.` }, { status: 502 });
    }
    const result = asRecord(body);
    const quote = asRecord(result?.quote);
    const quoteInput = asRecord(quote?.input);
    const quoteOutput = asRecord(quote?.output);
    const routing = typeof result?.routing === "string" ? result.routing : "";
    const canonicalWrap = routing === "WRAP" && sellToken.native && tokenOut === "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
    const canonicalUnwrap = routing === "UNWRAP" && buyToken.native && tokenIn === "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
    if (!(routing === "CLASSIC" || canonicalWrap || canonicalUnwrap) || result?.permitData != null || quoteInput?.amount !== amountIn || String(quoteInput?.token).toLowerCase() !== tokenIn || String(quoteOutput?.token).toLowerCase() !== tokenOut || !RAW.test(String(quoteOutput?.amount ?? ""))) {
      return NextResponse.json({ error: "Uniswap returned a route that does not meet Silfable's Robinhood safety policy." }, { status: 502 });
    }
    if (!quoteOutput) return NextResponse.json({ error: "Uniswap did not return an output amount." }, { status: 502 });
    const outputAmount = String(quoteOutput.amount);
    const gasEstimateUsd = quote?.classicGasUseEstimateUSD;
    const estimatedNetworkFeeUsd = typeof gasEstimateUsd === "string" && /^\d+(?:\.\d+)?$/u.test(gasEstimateUsd)
      ? gasEstimateUsd
      : null;
    const minimumOutputAmount = canonicalWrap || canonicalUnwrap
      ? outputAmount
      : RAW.test(String(quoteOutput.minimumAmount ?? ""))
        ? String(quoteOutput.minimumAmount)
        : ((BigInt(outputAmount) * BigInt(10_000 - slippageBps)) / BigInt(10_000)).toString();
    return NextResponse.json({ quote, routing, amountIn, outputAmount, minimumOutputAmount, estimatedNetworkFeeUsd, slippageBps, tokenIn, tokenOut, sellToken, buyToken, expiresAt: Date.now() + 300_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare the Uniswap quote.";
    console.error("[EVM Uniswap quote]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
