import { NextRequest, NextResponse } from "next/server";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

const JUPITER_SWAP_ENDPOINTS = [
  "https://lite-api.jup.ag/swap/v1/swap",
  "https://api.jup.ag/swap/v1/swap",
] as const;

async function requestSwapTransaction(payload: Record<string, unknown>, headers: HeadersInit) {
  let lastTransportError: unknown;

  for (const endpoint of JUPITER_SWAP_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;

      // A request reached Jupiter successfully. Return its validation error as-is
      // instead of masking it as a transport failure or retrying a bad payload.
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return { response, data };
      }
      lastTransportError = new Error(`Jupiter transaction service returned ${response.status}.`);
    } catch (error) {
      lastTransportError = error;
    }
  }

  const detail = lastTransportError instanceof Error && lastTransportError.name === "TimeoutError"
    ? "The Jupiter transaction service timed out."
    : "The Jupiter transaction service could not be reached.";
  throw new Error(`${detail} Please retry in a moment; no transaction was created.`);
}

export async function POST(req: NextRequest) {
  try {
    const { quoteResponse, userPublicKey, jupiterApiKey } = (await req.json()) as {
      quoteResponse?: unknown;
      userPublicKey?: string;
      jupiterApiKey?: string;
    };

    if (!quoteResponse || typeof userPublicKey !== "string" || userPublicKey.length < 32) {
      return NextResponse.json(
        { error: "Missing quote response or wallet public key. No transaction was created." },
        { status: 400 },
      );
    }
    const auth = await requireWalletAuth(req, userPublicKey);
    if (isAuthFailure(auth)) return auth;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}),
    };

    const { response, data } = await requestSwapTransaction({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }, headers);
    if (!response.ok || typeof data.swapTransaction !== "string") {
      return NextResponse.json(
        {
          error:
            typeof data.error === "string"
              ? data.error
              : `Jupiter swap transaction request failed with status ${response.status}.`,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      swapTransaction: data.swapTransaction,
      lastValidBlockHeight: data.lastValidBlockHeight ?? null,
      prioritizationFeeLamports: data.prioritizationFeeLamports ?? null,
      computeUnitLimit: data.computeUnitLimit ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Jupiter swap failed safely: ${message}` }, { status: 500 });
  }
}
