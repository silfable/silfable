import { NextRequest, NextResponse } from "next/server";

import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

export const runtime = "nodejs";

type OpenRouterCatalogEntry = { id?: unknown; name?: unknown; context_length?: unknown };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { walletAddress?: unknown; apiKey?: unknown };
    const auth = await requireWalletAuth(request, body.walletAddress);
    if (isAuthFailure(auth)) return auth;
    if (typeof body.apiKey !== "string" || body.apiKey.trim().length < 12 || body.apiKey.length > 512) {
      throw new Error("Enter a valid OpenRouter API key first.");
    }
    const response = await fetch("https://openrouter.ai/api/v1/models?output_modalities=text", {
      headers: { Authorization: `Bearer ${body.apiKey.trim()}`, "X-Title": "Silfable Web" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const responseBody = await response.json() as { data?: unknown; error?: { message?: unknown } };
    if (!response.ok || !Array.isArray(responseBody.data)) {
      const detail = typeof responseBody.error?.message === "string" ? responseBody.error.message : `status ${response.status}`;
      throw new Error(`OpenRouter model catalog could not be loaded (${detail}).`);
    }
    const models = responseBody.data.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const model = entry as OpenRouterCatalogEntry;
      if (typeof model.id !== "string" || !model.id || typeof model.name !== "string" || !model.name) return [];
      return [{ id: model.id.slice(0, 192), name: model.name.slice(0, 192), contextLength: typeof model.context_length === "number" ? model.context_length : null }];
    }).sort((left, right) => left.name.localeCompare(right.name)).slice(0, 500);
    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenRouter model catalog could not be loaded.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
