import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { cloudDb, isDbConfigured } from "@/lib/cloud-db";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";
import { evmToken } from "@/lib/evm-automation-core";

const ActionSchema = z.object({ walletAddress: z.string().regex(/^0x[0-9a-f]{40}$/iu), strategyId: z.string().regex(/^[0-9a-f]{24}$/iu).optional(), proposalId: z.string().regex(/^[0-9a-f]{24}$/iu).optional(), action: z.enum(["pause", "resume", "cancel", "reject", "prepare", "complete"]), transactionHash: z.string().regex(/^0x[0-9a-f]{64}$/iu).optional() });
type Strategy = Prisma.EvmAutomationStrategyGetPayload<{ include: { proposals: true } }>;

function view(strategy: Strategy) {
  return { id: strategy.id, sessionId: strategy.sessionId, kind: strategy.kind, status: strategy.status, inputSymbol: strategy.inputToken, outputSymbol: strategy.outputToken, amount: strategy.amount, intervalSeconds: strategy.intervalSeconds, maximumExecutions: strategy.maximumExecutions, completedExecutions: strategy.completedExecutions, takeProfitPriceUsd: strategy.takeProfitPriceUsd, stopLossPriceUsd: strategy.stopLossPriceUsd, nextWakeAt: strategy.nextWakeAt?.getTime() ?? null, expiresAt: strategy.expiresAt.getTime(), lastError: strategy.lastError, proposals: strategy.proposals.map((proposal) => ({ id: proposal.id, reason: proposal.reason, status: proposal.status, observedPriceUsd: proposal.observedPriceUsd, expiresAt: proposal.expiresAt.getTime() })) };
}

async function quote(input: { walletAddress: string; apiKey: string; sellToken: "ETH" | "USDG"; buyToken: "ETH" | "USDG"; amount: string; slippageBps: number }) {
  // Server routes cannot safely recurse through localhost in production. The quote endpoint's
  // validated provider contract is reproduced here with the same released pair restriction.
  const inToken = evmToken(input.sellToken); const outToken = evmToken(input.buyToken);
  const [whole, fraction = ""] = input.amount.split(".");
  const amountIn = `${whole}${fraction.padEnd(inToken.decimals, "0")}`.replace(/^0+/u, "") || "0";
  const provider = await fetch("https://trade-api.gateway.uniswap.org/v1/quote", { method: "POST", headers: { Accept: "application/json", "content-type": "application/json", "x-api-key": input.apiKey, "x-permit2-disabled": "true", "x-universal-router-version": "2.1.1" }, body: JSON.stringify({ type: "EXACT_INPUT", amount: amountIn, tokenInChainId: 4663, tokenOutChainId: 4663, tokenIn: inToken.address, tokenOut: outToken.address, swapper: input.walletAddress, recipient: input.walletAddress, slippageTolerance: Math.max(1, Math.min(500, input.slippageBps)) / 100, routingPreference: "BEST_PRICE", protocols: ["V2", "V3", "V4"] }), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const result = await provider.json().catch(() => null) as Record<string, unknown> | null;
  const q = result?.quote as Record<string, unknown> | undefined;
  const out = q?.output as Record<string, unknown> | undefined;
  if (!provider.ok || result?.routing !== "CLASSIC" || !q || !out || typeof out.amount !== "string") throw new Error(`Uniswap quote failed${provider.ok ? " safety validation" : ` (${provider.status})`}.`);
  const minimum = typeof out.minimumAmount === "string"
    ? out.minimumAmount
    : ((BigInt(out.amount) * BigInt(10_000 - Math.max(1, Math.min(500, input.slippageBps)))) / 10_000n).toString();
  return { quote: q, amountIn, outputAmount: out.amount, minimumOutputAmount: minimum, expiresAt: Date.now() + 300_000 };
}

async function evaluate(userId: string, apiKey?: string) {
  const now = new Date();
  const strategies = await cloudDb.evmAutomationStrategy.findMany({ where: { userId, status: "ACTIVE" }, include: { proposals: { where: { status: "AWAITING_APPROVAL" }, take: 1 } } });
  for (const strategy of strategies) {
    if (strategy.expiresAt <= now) { await cloudDb.evmAutomationStrategy.update({ where: { id: strategy.id }, data: { status: "EXPIRED" } }); continue; }
    let reason: string | null = null; let observedPriceUsd: number | undefined;
    if (strategy.kind === "DCA") { if ((strategy.maximumExecutions ?? 0) <= strategy.completedExecutions) { await cloudDb.evmAutomationStrategy.update({ where: { id: strategy.id }, data: { status: "COMPLETED", nextWakeAt: null } }); continue; } if (strategy.nextWakeAt && strategy.nextWakeAt <= now) reason = "DCA_DUE"; }
    else if (apiKey) {
      try { const priceQuote = await quote({ walletAddress: strategy.walletAddress, apiKey, sellToken: "ETH", buyToken: "USDG", amount: "1", slippageBps: 100 }); observedPriceUsd = Number(priceQuote.outputAmount) / 1e6; if (strategy.stopLossPriceUsd != null && observedPriceUsd <= strategy.stopLossPriceUsd) reason = "STOP_LOSS"; if (!reason && strategy.takeProfitPriceUsd != null && observedPriceUsd >= strategy.takeProfitPriceUsd) reason = "TAKE_PROFIT"; } catch (error) { await cloudDb.evmAutomationStrategy.update({ where: { id: strategy.id }, data: { lastError: error instanceof Error ? error.message.slice(0, 240) : "Price observation failed" } }); }
    }
    if (!reason || strategy.proposals.length) continue;
    await cloudDb.evmAutomationProposal.create({ data: { strategyId: strategy.id, userId, sessionId: strategy.sessionId, reason, observedPriceUsd, idempotencyKey: `${strategy.id}:${strategy.nextWakeAt?.getTime() ?? now.getTime()}`, expiresAt: new Date(now.getTime() + 30 * 60_000) } }).catch(() => null);
    await cloudDb.evmAutomationStrategy.update({ where: { id: strategy.id }, data: { status: "AWAITING_APPROVAL", lastEvaluatedAt: now } });
  }
}

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  const walletAddress = new URL(request.url).searchParams.get("walletAddress"); const auth = await requireWalletAuth(request, walletAddress); if (isAuthFailure(auth)) return auth;
  await evaluate(auth.userId, request.headers.get("x-uniswap-api-key") || undefined);
  const strategies = await cloudDb.evmAutomationStrategy.findMany({ where: { userId: auth.userId, walletAddress: walletAddress?.toLowerCase() }, include: { proposals: { orderBy: { createdAt: "desc" }, take: 3 } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ strategies: strategies.map(view), monitorMode: "browser_poll_propose" });
}

export async function PATCH(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  const parsed = ActionSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const auth = await requireWalletAuth(request, parsed.data.walletAddress); if (isAuthFailure(auth)) return auth;
  const { action, strategyId, proposalId, walletAddress } = parsed.data;
  if (["pause", "resume", "cancel"].includes(action)) { const strategy = strategyId ? await cloudDb.evmAutomationStrategy.findFirst({ where: { id: strategyId, userId: auth.userId } }) : null; if (!strategy) return NextResponse.json({ error: "Strategy not found." }, { status: 404 }); const status = action === "pause" ? "PAUSED" : action === "resume" ? "ACTIVE" : "CANCELLED"; await cloudDb.evmAutomationStrategy.update({ where: { id: strategy.id }, data: { status, nextWakeAt: action === "resume" && strategy.kind === "DCA" ? new Date(Date.now() + (strategy.intervalSeconds ?? 60) * 1000) : strategy.nextWakeAt } }); return NextResponse.json({ success: true }); }
  const proposal = proposalId ? await cloudDb.evmAutomationProposal.findFirst({ where: { id: proposalId, userId: auth.userId }, include: { strategy: true } }) : null; if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  if (action === "reject") { await cloudDb.$transaction([cloudDb.evmAutomationProposal.update({ where: { id: proposal.id }, data: { status: "REJECTED" } }), cloudDb.evmAutomationStrategy.update({ where: { id: proposal.strategyId }, data: { status: "ACTIVE", nextWakeAt: proposal.strategy.kind === "DCA" ? new Date(Date.now() + (proposal.strategy.intervalSeconds ?? 60) * 1000) : proposal.strategy.nextWakeAt } })]); return NextResponse.json({ success: true }); }
  if (action === "prepare") { const apiKey = request.headers.get("x-uniswap-api-key"); if (!apiKey) return NextResponse.json({ error: "Configure a verified Uniswap API key first." }, { status: 400 }); if (proposal.status !== "AWAITING_APPROVAL" || proposal.expiresAt <= new Date()) return NextResponse.json({ error: "Proposal is no longer available." }, { status: 409 }); const prepared = await quote({ walletAddress, apiKey, sellToken: proposal.strategy.inputToken as "ETH" | "USDG", buyToken: proposal.strategy.outputToken as "ETH" | "USDG", amount: proposal.strategy.amount, slippageBps: Number(request.headers.get("x-slippage-bps") || 100) }); await cloudDb.evmAutomationProposal.update({ where: { id: proposal.id }, data: { status: "PREPARED", quoteJson: JSON.stringify(prepared.quote) } }); return NextResponse.json({ proposal: { id: `evm_automation_${proposal.id}`, type: "evm_swap", mint: proposal.strategy.inputToken, solAmount: "0", sellToken: proposal.strategy.inputToken, buyToken: proposal.strategy.outputToken, sellAmount: proposal.strategy.amount, inputAmount: prepared.amountIn, buyAmount: prepared.outputAmount, minimumBuyAmount: prepared.minimumOutputAmount, quoteResponse: prepared.quote, quoteExpiresAt: prepared.expiresAt, status: "ready_for_user_signature", mode: "automation_monitor_propose", venue: "Uniswap Classic · Robinhood", explanation: "Automation triggered this review. MetaMask/Rabby must still approve every transaction.", automationProposalId: proposal.id, automationReason: proposal.reason, checks: [{ code: "monitor_only", status: "pass", message: "Automation cannot sign or broadcast." }, { code: "wallet_bound", status: "pass", message: `Bound EVM wallet: ${proposal.strategy.walletAddress}` }] } }); }
  if (action === "complete") { if (proposal.status !== "PREPARED" || !parsed.data.transactionHash) return NextResponse.json({ error: "Prepared proposal and confirmed transaction hash are required." }, { status: 409 }); const count = proposal.strategy.completedExecutions + 1; const done = proposal.strategy.kind === "EXIT" || count >= (proposal.strategy.maximumExecutions ?? 1); await cloudDb.$transaction([cloudDb.evmAutomationProposal.update({ where: { id: proposal.id }, data: { status: "COMPLETED" } }), cloudDb.evmAutomationStrategy.update({ where: { id: proposal.strategyId }, data: { status: done ? "COMPLETED" : "ACTIVE", completedExecutions: count, nextWakeAt: done ? null : new Date(Date.now() + (proposal.strategy.intervalSeconds ?? 60) * 1000) } })]); return NextResponse.json({ success: true }); }
  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
