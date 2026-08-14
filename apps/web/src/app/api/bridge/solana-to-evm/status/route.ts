import { NextRequest, NextResponse } from "next/server";

import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

export const runtime = "nodejs";

const RELAY_STATUS_API = "https://api.relay.link/intents/status/v3";
const RELAY_REQUEST_ID = /^0x[a-fA-F0-9]{64}$/u;
const TX_HASH = /^0x[a-fA-F0-9]{64}$/u;
const STATUSES = new Set(["waiting", "depositing", "pending", "submitted", "success", "delayed", "refund", "failure"]);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireWalletAuth(request);
    if (isAuthFailure(auth)) return auth;
    const requestId = request.nextUrl.searchParams.get("requestId");
    if (!requestId || !RELAY_REQUEST_ID.test(requestId)) {
      return NextResponse.json({ error: "A valid Relay request ID is required." }, { status: 400 });
    }

    const headers: Record<string, string> = { accept: "application/json" };
    if (process.env.RELAY_API_KEY) headers["x-api-key"] = process.env.RELAY_API_KEY;
    const response = await fetch(`${RELAY_STATUS_API}?requestId=${encodeURIComponent(requestId)}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const raw = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const message = typeof raw.message === "string" ? raw.message : `Relay status request failed (${response.status}).`;
      return NextResponse.json({ error: message }, { status: response.status });
    }
    if (typeof raw.status !== "string" || !STATUSES.has(raw.status)) {
      return NextResponse.json({ error: "Relay returned an unknown bridge status." }, { status: 502 });
    }
    const sourceTxHashes = Array.isArray(raw.inTxHashes) ? raw.inTxHashes.filter((value): value is string => typeof value === "string") : [];
    const destinationTxHashes = Array.isArray(raw.txHashes) ? raw.txHashes.filter((value): value is string => typeof value === "string" && TX_HASH.test(value)) : [];
    return NextResponse.json({
      status: raw.status,
      details: typeof raw.details === "string" ? raw.details : null,
      sourceTxHashes,
      destinationTxHashes,
      destinationExplorerUrl: destinationTxHashes[0]
        ? `https://8crv4vmq6tiu1yqr.blockscout.com/tx/${destinationTxHashes[0]}`
        : null,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bridge status could not be checked." }, { status: 502 });
  }
}
