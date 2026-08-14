import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, SolanaAutomationStrategy } from "@prisma/client";
import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";
import { USDC_MINT, evaluateAutomation, rawToDecimal } from "@/lib/solana-automation-core";
import { selectSolanaRpc } from "@/lib/server-solana-rpc";
import { createOwnedSolanaAutomation } from "@/lib/solana-automation-service";

const ActionSchema = z.object({
  walletAddress: z.string(),
  strategyId: z.string().regex(/^[0-9a-f]{24}$/iu).optional(),
  proposalId: z.string().regex(/^[0-9a-f]{24}$/iu).optional(),
  action: z.enum(["pause", "resume", "cancel", "reject", "prepare", "complete"]),
  transactionSignature: z.string().min(32).max(128).optional(),
  customRpcUrl: z.string().url().max(2_048).optional(),
});

type StrategyWithProposals = Prisma.SolanaAutomationStrategyGetPayload<{ include: { proposals: true } }>;

function asView(strategy: StrategyWithProposals) {
  return {
    id: strategy.id,
    sessionId: strategy.sessionId,
    walletAddress: strategy.walletAddress,
    kind: strategy.kind,
    status: strategy.status,
    inputMint: strategy.inputMint,
    inputSymbol: strategy.inputSymbol,
    inputDecimals: strategy.inputDecimals,
    outputMint: strategy.outputMint,
    outputSymbol: strategy.outputSymbol,
    outputDecimals: strategy.outputDecimals,
    amountRaw: strategy.amountRaw,
    amount: rawToDecimal(strategy.amountRaw, strategy.inputDecimals),
    intervalSeconds: strategy.intervalSeconds,
    maximumExecutions: strategy.maximumExecutions,
    completedExecutions: strategy.completedExecutions,
    entryPriceUsd: strategy.entryPriceUsd,
    takeProfitPriceUsd: strategy.takeProfitPriceUsd,
    stopLossPriceUsd: strategy.stopLossPriceUsd,
    expiresAt: strategy.expiresAt.getTime(),
    nextWakeAt: strategy.nextWakeAt?.getTime() ?? null,
    lastError: strategy.lastError,
    createdAt: strategy.createdAt.getTime(),
    proposals: (strategy.proposals ?? []).map((proposal) => ({
      id: proposal.id,
      reason: proposal.reason,
      status: proposal.status,
      observedPriceUsd: proposal.observedPriceUsd,
      expiresAt: proposal.expiresAt.getTime(),
      createdAt: proposal.createdAt.getTime(),
    })),
  };
}

async function getQuote(inputMint: string, outputMint: string, amount: string, slippageBps: number, apiKey?: string) {
  const url = new URL("https://lite-api.jup.ag/swap/v1/quote");
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount);
  url.searchParams.set("slippageBps", String(Math.max(1, Math.min(500, slippageBps))));
  url.searchParams.set("restrictIntermediateTokens", "true");
  const response = await fetch(url, { headers: apiKey ? { "x-api-key": apiKey } : {}, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.outAmount !== "string") throw new Error(typeof body.error === "string" ? body.error : `Jupiter quote failed (${response.status})`);
  return body;
}

async function observeUsdPrice(strategy: SolanaAutomationStrategy, apiKey?: string): Promise<number | undefined> {
  if (strategy.inputMint === USDC_MINT) return 1;
  const oneTokenRaw = (10n ** BigInt(strategy.inputDecimals)).toString();
  const quote = await getQuote(strategy.inputMint, USDC_MINT, oneTokenRaw, 100, apiKey);
  const price = Number(quote.outAmount) / 1_000_000;
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

async function verifyConfirmedSignature(signature: string, walletAddress: string, customRpcUrl?: string): Promise<void> {
  const response = await fetch(selectSolanaRpc(customRpcUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [signature, { commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }] }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null) as { result?: { meta?: { err?: unknown }; transaction?: { message?: { accountKeys?: Array<string | { pubkey?: string }> } } }; error?: { message?: string } } | null;
  if (!response.ok || body?.error) throw new Error(body?.error?.message || "The Solana confirmation could not be verified.");
  if (!body?.result || body.result.meta?.err) throw new Error("The transaction is not confirmed successfully on Solana.");
  const accounts = body.result.transaction?.message?.accountKeys ?? [];
  const belongsToWallet = accounts.some((account) => (typeof account === "string" ? account : account.pubkey) === walletAddress);
  if (!belongsToWallet) throw new Error("The confirmed transaction is not bound to this automation wallet.");
}

async function evaluateOwnedStrategies(userId: string, apiKey?: string) {
  const now = new Date();
  const staleProposals = await cloudDb.solanaAutomationProposal.findMany({
    where: { userId, status: { in: ["AWAITING_APPROVAL", "PREPARED"] }, expiresAt: { lte: now } },
    include: { strategy: true },
  });
  for (const proposal of staleProposals) {
    await cloudDb.$transaction([
      cloudDb.solanaAutomationProposal.update({ where: { id: proposal.id }, data: { status: "EXPIRED" } }),
      cloudDb.solanaAutomationStrategy.update({
        where: { id: proposal.strategyId },
        data: {
          status: proposal.strategy.expiresAt <= now ? "EXPIRED" : "ACTIVE",
          nextWakeAt: proposal.strategy.kind === "DCA" ? new Date(now.getTime() + (proposal.strategy.intervalSeconds ?? 60) * 1000) : now,
        },
      }),
    ]);
  }
  const strategies = await cloudDb.solanaAutomationStrategy.findMany({
    where: { userId, status: "ACTIVE" },
    include: { proposals: { where: { status: "AWAITING_APPROVAL" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  for (const strategy of strategies) {
    let observedPrice: number | undefined;
    let evaluationError: string | null = null;
    if (strategy.kind === "EXIT") {
      try { observedPrice = await observeUsdPrice(strategy, apiKey); }
      catch (error) { evaluationError = error instanceof Error ? error.message.slice(0, 240) : "Price observation failed"; }
    }
    const result = evaluateAutomation({
      kind: strategy.kind === "DCA" ? "DCA" : "EXIT",
      status: strategy.status,
      expiresAt: strategy.expiresAt,
      nextWakeAt: strategy.nextWakeAt,
      completedExecutions: strategy.completedExecutions,
      maximumExecutions: strategy.maximumExecutions,
      takeProfitPriceUsd: strategy.takeProfitPriceUsd,
      stopLossPriceUsd: strategy.stopLossPriceUsd,
    }, now, observedPrice);
    if (result === "EXPIRED") {
      await cloudDb.solanaAutomationStrategy.update({ where: { id: strategy.id }, data: { status: "EXPIRED", lastEvaluatedAt: now, lastError: evaluationError } });
      continue;
    }
    if (!result || strategy.proposals.length > 0) {
      await cloudDb.solanaAutomationStrategy.update({ where: { id: strategy.id }, data: { lastEvaluatedAt: now, lastError: evaluationError } });
      continue;
    }
    const bucket = result === "DCA_DUE" ? strategy.nextWakeAt?.getTime() ?? now.getTime() : `${result}:${observedPrice}`;
    await cloudDb.solanaAutomationProposal.create({ data: {
      strategyId: strategy.id, userId, sessionId: strategy.sessionId, reason: result,
      inputMint: strategy.inputMint, outputMint: strategy.outputMint, amountRaw: strategy.amountRaw,
      observedPriceUsd: observedPrice, idempotencyKey: `${strategy.id}:${bucket}`,
      expiresAt: new Date(now.getTime() + 30 * 60_000),
    }}).catch(() => null);
    await cloudDb.solanaAutomationStrategy.update({ where: { id: strategy.id }, data: { status: "AWAITING_APPROVAL", lastEvaluatedAt: now, lastError: evaluationError } });
  }
}

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  const walletAddress = new URL(request.url).searchParams.get("walletAddress");
  const auth = await requireWalletAuth(request, walletAddress);
  if (isAuthFailure(auth)) return auth;
  await evaluateOwnedStrategies(auth.userId, request.headers.get("x-jupiter-api-key") || undefined);
  const strategies = await cloudDb.solanaAutomationStrategy.findMany({ where: { userId: auth.userId }, include: { proposals: { orderBy: { createdAt: "desc" }, take: 3 } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ strategies: strategies.map(asView), monitorMode: "browser_poll_propose" });
}

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  const body = await request.json();
  const requestedWallet = body && typeof body === "object" && "common" in body && body.common && typeof body.common === "object" ? (body.common as { walletAddress?: unknown }).walletAddress : undefined;
  const auth = await requireWalletAuth(request, requestedWallet);
  if (isAuthFailure(auth)) return auth;
  const created = await createOwnedSolanaAutomation({ userId: auth.userId, request: body });
  if (!created.ok) return NextResponse.json({ error: created.issues }, { status: 400 });
  return NextResponse.json({ strategy: asView(created.strategy) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  const parsed = ActionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const auth = await requireWalletAuth(request, parsed.data.walletAddress);
  if (isAuthFailure(auth)) return auth;
  const { action, strategyId, proposalId } = parsed.data;
  if (["pause", "resume", "cancel"].includes(action)) {
    if (!strategyId) return NextResponse.json({ error: "strategyId is required." }, { status: 400 });
    const owned = await cloudDb.solanaAutomationStrategy.findFirst({ where: { id: strategyId, userId: auth.userId } });
    if (!owned) return NextResponse.json({ error: "Strategy not found." }, { status: 404 });
    const allowed = action === "pause" ? ["ACTIVE"] : action === "resume" ? ["PAUSED"] : ["ACTIVE", "PAUSED", "AWAITING_APPROVAL"];
    if (!allowed.includes(owned.status)) return NextResponse.json({ error: `Cannot ${action} a ${owned.status.toLowerCase()} strategy.` }, { status: 409 });
    const status = action === "pause" ? "PAUSED" : action === "resume" ? "ACTIVE" : "CANCELLED";
    await cloudDb.solanaAutomationStrategy.update({ where: { id: owned.id }, data: { status, nextWakeAt: action === "resume" && owned.kind === "DCA" ? new Date(Date.now() + (owned.intervalSeconds ?? 60) * 1000) : owned.nextWakeAt } });
    return NextResponse.json({ success: true });
  }
  if (!proposalId) return NextResponse.json({ error: "proposalId is required." }, { status: 400 });
  const proposal = await cloudDb.solanaAutomationProposal.findFirst({ where: { id: proposalId, userId: auth.userId }, include: { strategy: true } });
  if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  if (action === "reject") {
    await cloudDb.$transaction([
      cloudDb.solanaAutomationProposal.update({ where: { id: proposal.id }, data: { status: "REJECTED" } }),
      cloudDb.solanaAutomationStrategy.update({ where: { id: proposal.strategyId }, data: { status: "ACTIVE", nextWakeAt: proposal.strategy.kind === "DCA" ? new Date(Date.now() + (proposal.strategy.intervalSeconds ?? 60) * 1000) : proposal.strategy.nextWakeAt } }),
    ]);
    return NextResponse.json({ success: true });
  }
  if (action === "prepare") {
    if (!(["AWAITING_APPROVAL", "PREPARED"].includes(proposal.status)) || proposal.expiresAt.getTime() <= Date.now()) return NextResponse.json({ error: "This proposal is no longer available. Refresh the automation." }, { status: 409 });
    const quote = await getQuote(proposal.inputMint, proposal.outputMint, proposal.amountRaw, Number(request.headers.get("x-slippage-bps") || 100), request.headers.get("x-jupiter-api-key") || undefined);
    await cloudDb.solanaAutomationProposal.update({ where: { id: proposal.id }, data: { status: "PREPARED", quoteJson: JSON.stringify(quote) } });
    return NextResponse.json({ proposal: {
      id: `automation_${proposal.id}`, type: "jupiter_swap", mint: proposal.inputMint,
      solAmount: rawToDecimal(proposal.amountRaw, proposal.strategy.inputDecimals), estimatedTokens: String(quote.outAmount),
      inputAmount: proposal.amountRaw, outputAmount: String(quote.outAmount), minimumOutputAmount: String(quote.otherAmountThreshold ?? ""),
      inputMint: proposal.inputMint, outputMint: proposal.outputMint, inputSymbol: proposal.strategy.inputSymbol,
      inputDecimals: proposal.strategy.inputDecimals, outputSymbol: proposal.strategy.outputSymbol, outputDecimals: proposal.strategy.outputDecimals,
      quoteResponse: quote, status: "ready_for_user_signature", mode: "automation_monitor_propose", venue: "Jupiter Swap API",
      automationProposalId: proposal.id, automationReason: proposal.reason,
      explanation: "Automation triggered this proposal. The browser wallet must still approve and broadcast it.",
      checks: [{ code: "monitor_only", status: "pass", message: "The automation cannot sign or broadcast by itself." }, { code: "session_bound", status: "pass", message: `Bound Solana wallet: ${proposal.strategy.walletAddress}` }],
    }});
  }
  if (action === "complete") {
    if (proposal.status !== "PREPARED" || !parsed.data.transactionSignature) return NextResponse.json({ error: "A prepared proposal and confirmed signature are required." }, { status: 409 });
    await verifyConfirmedSignature(parsed.data.transactionSignature, proposal.strategy.walletAddress, parsed.data.customRpcUrl);
    const nextCount = proposal.strategy.completedExecutions + 1;
    const done = proposal.strategy.kind === "EXIT" || nextCount >= (proposal.strategy.maximumExecutions ?? 1);
    await cloudDb.$transaction([
      cloudDb.solanaAutomationProposal.update({ where: { id: proposal.id }, data: { status: "COMPLETED" } }),
      cloudDb.solanaAutomationStrategy.update({ where: { id: proposal.strategyId }, data: { status: done ? "COMPLETED" : "ACTIVE", completedExecutions: nextCount, nextWakeAt: done ? null : new Date(Date.now() + (proposal.strategy.intervalSeconds ?? 60) * 1000) } }),
    ]);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
