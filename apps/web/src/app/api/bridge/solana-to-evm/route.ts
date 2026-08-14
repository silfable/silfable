import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";
import { assertSolanaBridgeBalance } from "@/lib/solana-bridge-preflight";

export const runtime = "nodejs";

const RELAY_API = "https://api.relay.link";
const RELAY_SOLANA_CHAIN_ID = 792_703_809;
const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RELAY_SOURCE_PROGRAM = "99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2";
const DEFAULT_SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/u;
const DECIMAL_USDC = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u;
const RELAY_REQUEST_ID = /^0x[a-fA-F0-9]{64}$/u;

const DESTINATIONS = {
  base: { chainId: 8453, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", label: "Base" },
  arbitrum: { chainId: 42161, asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", label: "Arbitrum" },
  ethereum: { chainId: 1, asset: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC", label: "Ethereum" },
  optimism: { chainId: 10, asset: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", symbol: "USDC", label: "Optimism" },
  polygon: { chainId: 137, asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", symbol: "USDC", label: "Polygon" },
  avalanche: { chainId: 43114, asset: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", symbol: "USDC", label: "Avalanche" },
  robinhood: { chainId: 4663, asset: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", symbol: "USDG", label: "Robinhood Chain" },
} as const;

type DestinationKey = keyof typeof DESTINATIONS;
type RelayInstruction = {
  programId?: unknown;
  data?: unknown;
  keys?: unknown;
};

function parseAmountUsdc(value: unknown): string {
  if (typeof value !== "string" || !DECIMAL_USDC.test(value)) {
    throw new Error("Amount must be a positive USDC decimal with up to 6 decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const raw = BigInt(whole) * BigInt(1_000_000) + BigInt((fraction + "000000").slice(0, 6));
  if (raw < BigInt(10_000) || raw > BigInt(1_000_000_000)) {
    throw new Error("Bridge amount must be between 0.01 and 1,000 USDC.");
  }
  return raw.toString();
}

function relayInstruction(raw: unknown, index: number): TransactionInstruction {
  if (typeof raw !== "object" || raw === null) throw new Error(`Relay instruction ${index + 1} is invalid.`);
  const value = raw as RelayInstruction;
  if (typeof value.programId !== "string" || typeof value.data !== "string" || !Array.isArray(value.keys)) {
    throw new Error(`Relay instruction ${index + 1} is incomplete.`);
  }
  const encoded = value.data.replace(/^0x/u, "");
  if (!/^[a-fA-F0-9]*$/u.test(encoded) || encoded.length % 2 !== 0) {
    throw new Error(`Relay instruction ${index + 1} data is invalid.`);
  }
  return new TransactionInstruction({
    programId: new PublicKey(value.programId),
    data: Buffer.from(encoded, "hex"),
    keys: value.keys.map((rawKey, keyIndex) => {
      if (typeof rawKey !== "object" || rawKey === null) throw new Error(`Relay instruction ${index + 1} key ${keyIndex + 1} is invalid.`);
      const key = rawKey as { pubkey?: unknown; isSigner?: unknown; isWritable?: unknown };
      if (typeof key.pubkey !== "string" || typeof key.isSigner !== "boolean" || typeof key.isWritable !== "boolean") {
        throw new Error(`Relay instruction ${index + 1} key ${keyIndex + 1} is incomplete.`);
      }
      return { pubkey: new PublicKey(key.pubkey), isSigner: key.isSigner, isWritable: key.isWritable };
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      walletAddress?: unknown;
      destination?: unknown;
      destinationRecipient?: unknown;
      amountUsdc?: unknown;
    };
    const auth = await requireWalletAuth(request, body.walletAddress);
    if (isAuthFailure(auth)) return auth;
    if (typeof body.walletAddress !== "string") throw new Error("Connected Solana wallet is required.");
    const walletAddress = new PublicKey(body.walletAddress).toBase58();
    if (typeof body.destination !== "string" || !(body.destination in DESTINATIONS)) {
      throw new Error("The EVM destination is not enabled.");
    }
    if (typeof body.destinationRecipient !== "string" || !EVM_ADDRESS.test(body.destinationRecipient)) {
      throw new Error("A valid EVM recipient address is required.");
    }
    const destination = DESTINATIONS[body.destination as DestinationKey];
    const amount = parseAmountUsdc(body.amountUsdc);
    const connection = new Connection(DEFAULT_SOLANA_RPC, "confirmed");
    const balancePreflight = await assertSolanaBridgeBalance(connection, walletAddress, BigInt(amount));
    const relayHeaders: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    if (process.env.RELAY_API_KEY) relayHeaders["x-api-key"] = process.env.RELAY_API_KEY;
    const quoteResponse = await fetch(`${RELAY_API}/quote/v2`, {
      method: "POST",
      headers: relayHeaders,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        user: walletAddress,
        recipient: body.destinationRecipient,
        refundTo: walletAddress,
        originChainId: RELAY_SOLANA_CHAIN_ID,
        destinationChainId: destination.chainId,
        originCurrency: SOLANA_USDC_MINT,
        destinationCurrency: destination.asset,
        amount,
        tradeType: "EXACT_INPUT",
        depositFeePayer: walletAddress,
        includeComputeUnitLimit: true,
        useFallbacks: true,
      }),
    });
    const quote = await quoteResponse.json() as Record<string, unknown>;
    if (!quoteResponse.ok) {
      const relayMessage = typeof quote.message === "string" ? quote.message : typeof quote.error === "string" ? quote.error : null;
      throw new Error(relayMessage ?? `Relay quote request failed (${quoteResponse.status}).`);
    }
    const steps = quote.steps;
    if (!Array.isArray(steps)) throw new Error("Relay did not return transaction steps.");
    const step = steps.find((candidate) => typeof candidate === "object" && candidate !== null && Array.isArray((candidate as { items?: unknown }).items));
    const stepValue = step as { requestId?: unknown; items?: unknown[] } | undefined;
    const items = Array.isArray(stepValue?.items) ? stepValue.items : [];
    if (items.length !== 1) throw new Error("Relay returned an unsupported multi-transaction bridge route.");
    const item = items[0] as { data?: { instructions?: unknown; addressLookupTableAddresses?: unknown } };
    const rawInstructions = item?.data?.instructions;
    if (!Array.isArray(rawInstructions) || rawInstructions.length === 0 || rawInstructions.length > 24) {
      throw new Error("Relay returned an invalid Solana instruction set.");
    }
    const instructions = rawInstructions.map(relayInstruction);
    if (!instructions.some((instruction) => instruction.programId.toBase58() === RELAY_SOURCE_PROGRAM)) {
      throw new Error("Relay quote does not invoke the pinned Solana bridge program.");
    }
    const rawTables = item.data?.addressLookupTableAddresses;
    if (rawTables !== undefined && (!Array.isArray(rawTables) || rawTables.length > 8 || rawTables.some((entry) => typeof entry !== "string"))) {
      throw new Error("Relay returned invalid address lookup tables.");
    }
    const tables = await Promise.all((rawTables ?? []).map(async (address) => {
      const result = await connection.getAddressLookupTable(new PublicKey(address as string));
      if (result.value === null) throw new Error("A Relay address lookup table is unavailable.");
      return result.value;
    }));
    const latest = await connection.getLatestBlockhash("confirmed");
    const transaction = new VersionedTransaction(
      new TransactionMessage({ payerKey: new PublicKey(walletAddress), recentBlockhash: latest.blockhash, instructions }).compileToV0Message(tables),
    );
    const details = quote.details as { currencyOut?: { amount?: unknown; minimumAmount?: unknown }; timeEstimate?: unknown } | undefined;
    const requestIdCandidate = stepValue?.requestId ?? quote.requestId;
    if (typeof requestIdCandidate !== "string" || !RELAY_REQUEST_ID.test(requestIdCandidate)) {
      throw new Error("Relay did not return a trackable bridge request ID.");
    }
    return NextResponse.json({
      transaction: Buffer.from(transaction.serialize()).toString("base64"),
      requestId: requestIdCandidate,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      quoteExpiresAt: Date.now() + 60_000,
      destination: { key: body.destination, label: destination.label, symbol: destination.symbol },
      amountIn: amount,
      estimatedAmountOut: typeof details?.currencyOut?.amount === "string" ? details.currencyOut.amount : null,
      minimumAmountOut: typeof details?.currencyOut?.minimumAmount === "string" ? details.currencyOut.minimumAmount : null,
      estimatedSeconds: typeof details?.timeEstimate === "number" ? details.timeEstimate : null,
      balancePreflight,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bridge quote could not be prepared.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
