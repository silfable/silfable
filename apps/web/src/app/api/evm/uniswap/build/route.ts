import { NextRequest, NextResponse } from "next/server";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

const API_BASE = "https://trade-api.gateway.uniswap.org/v1";
const CHAIN_ID = 4_663;
const ROUTER = "0x8876789976decbfcbbbe364623c63652db8c0904";
const SWAP_PROXY = "0x02e5be68d46dac0b524905bff209cf47ee6db2a9";
const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const NATIVE_ETH = "0x0000000000000000000000000000000000000000";
const ROBINHOOD_WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const ADDRESS = /^0x[0-9a-f]{40}$/iu;
const HEX = /^0x(?:[0-9a-f]{2})+$/iu;

type WalletTransaction = { from: string; to: string; data: string; value: string };

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value as Record<string, unknown>;
}

function parseValue(value: unknown): string {
  if (value == null) return "0x0";
  // Some providers return padded hex (for example 0x0001). Go-based RPCs
  // reject that representation in TransactionArgs, so canonicalize every
  // numeric input through BigInt before it reaches estimateGas or the wallet.
  if (typeof value === "string" && (/^\d+$/u.test(value) || /^0x[0-9a-f]+$/iu.test(value))) return `0x${BigInt(value).toString(16)}`;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return `0x${BigInt(value).toString(16)}`;
  throw new Error("Uniswap transaction value is invalid.");
}

function parseTransaction(value: unknown, walletAddress: string, allowedTargets: readonly string[]): WalletTransaction {
  const tx = asRecord(value, "Uniswap transaction");
  const to = typeof tx.to === "string" && ADDRESS.test(tx.to) ? tx.to : "";
  const from = typeof tx.from === "string" && ADDRESS.test(tx.from) ? tx.from : "";
  const data = typeof tx.data === "string" && HEX.test(tx.data) ? tx.data : "";
  if (!to || !from || !data) throw new Error("Uniswap returned an invalid transaction.");
  if (from.toLowerCase() !== walletAddress.toLowerCase()) throw new Error("Uniswap transaction sender does not match the bound wallet.");
  if (!allowedTargets.some((target) => target.toLowerCase() === to.toLowerCase())) throw new Error("Uniswap transaction target is not allowlisted for Robinhood Chain.");
  if (tx.chainId != null && Number(tx.chainId) !== CHAIN_ID) throw new Error("Uniswap transaction is not for Robinhood Chain.");
  return { from, to, data, value: parseValue(tx.value) };
}

function validateApproval(tx: WalletTransaction, tokenIn: string): void {
  if (tx.to.toLowerCase() !== tokenIn || !tx.data.toLowerCase().startsWith("0x095ea7b3") || tx.data.length !== 138) throw new Error("Uniswap approval is not an exact input-token ERC-20 approve transaction.");
  const spender = `0x${tx.data.slice(34, 74)}`.toLowerCase();
  if (![ROUTER, SWAP_PROXY, PERMIT2].includes(spender)) throw new Error("Uniswap approval spender is not allowlisted.");
}

function calldataAddress(data: string, wordOffset: number): string {
  const start = 10 + (wordOffset * 64);
  return `0x${data.slice(start + 24, start + 64)}`.toLowerCase();
}

function calldataUint(data: string, wordOffset: number): bigint {
  const start = 10 + (wordOffset * 64);
  return BigInt(`0x${data.slice(start, start + 64)}`);
}

function validateWrapTransaction(tx: WalletTransaction, routing: string, amountIn: string, walletAddress: string): void {
  if (tx.to.toLowerCase() !== ROBINHOOD_WETH) throw new Error("Wrap transaction does not target canonical Robinhood WETH.");
  if (routing === "WRAP") {
    const data = tx.data.toLowerCase();
    // deposit() has no ABI arguments. Uniswap may append routing metadata after
    // the canonical selector; it cannot alter a parameter because none exist.
    // Target, sender, chain, and exact msg.value are validated independently.
    const directDeposit = data.startsWith("0xd0e30db0");
    const depositToSessionWallet = data.startsWith("0xb760faf9") && data.length === 74 && calldataAddress(data, 0) === walletAddress.toLowerCase();
    if (!(directDeposit || depositToSessionWallet) || BigInt(tx.value) !== BigInt(amountIn)) {
      console.warn(`[EVM canonical wrap validation] selector ${data.slice(0, 10)}, calldata ${Math.max(0, (data.length - 2) / 2)} bytes, value matches ${BigInt(tx.value) === BigInt(amountIn)}`);
      throw new Error("Canonical WETH deposit calldata, recipient, or value is invalid.");
    }
    return;
  }
  if (routing === "UNWRAP") {
    const data = tx.data.toLowerCase();
    const directWithdrawal = data.startsWith("0x2e1a7d4d") && data.length === 74 && calldataUint(data, 0) === BigInt(amountIn);
    const withdrawalToSessionWallet = data.startsWith("0x205c2878") && data.length === 138 && calldataAddress(data, 0) === walletAddress.toLowerCase() && calldataUint(data, 1) === BigInt(amountIn);
    if (!(directWithdrawal || withdrawalToSessionWallet) || BigInt(tx.value) !== BigInt(0)) throw new Error("Canonical WETH withdrawal calldata, recipient, amount, or value is invalid.");
  }
}

async function uniswap(path: string, apiKey: string, body: Record<string, unknown>) {
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { Accept: "application/json", "content-type": "application/json", "x-api-key": apiKey, "x-permit2-disabled": "true", "x-universal-router-version": "2.1.1" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Uniswap ${path} failed with status ${response.status}.`);
  return asRecord(payload, "Uniswap response");
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json() as { walletAddress?: unknown; apiKey?: unknown; quote?: unknown; routing?: unknown; tokenIn?: unknown; tokenOut?: unknown; amountIn?: unknown };
    const auth = await requireWalletAuth(request, input.walletAddress);
    if (isAuthFailure(auth)) return auth;
    if (typeof input.walletAddress !== "string" || !ADDRESS.test(input.walletAddress)) return NextResponse.json({ error: "A valid bound EVM wallet is required." }, { status: 400 });
    if (typeof input.apiKey !== "string" || input.apiKey.trim().length < 8) return NextResponse.json({ error: "Configure the Uniswap Trading API key in Settings." }, { status: 400 });
    const quote = asRecord(input.quote, "Uniswap quote");
    const tokenIn = typeof input.tokenIn === "string" ? input.tokenIn.toLowerCase() : "";
    const tokenOut = typeof input.tokenOut === "string" ? input.tokenOut.toLowerCase() : "";
    const amountIn = typeof input.amountIn === "string" && /^\d+$/u.test(input.amountIn) ? input.amountIn : "";
    const routing = input.routing === "WRAP" || input.routing === "UNWRAP" || input.routing === "CLASSIC" ? input.routing : "";
    if (!amountIn || !ADDRESS.test(tokenIn) || !ADDRESS.test(tokenOut) || tokenIn === tokenOut) return NextResponse.json({ error: "The quote input is invalid." }, { status: 400 });
    const canonicalWrap = routing === "WRAP" && tokenIn === NATIVE_ETH && tokenOut === ROBINHOOD_WETH;
    const canonicalUnwrap = routing === "UNWRAP" && tokenIn === ROBINHOOD_WETH && tokenOut === NATIVE_ETH;
    if (!(routing === "CLASSIC" || canonicalWrap || canonicalUnwrap)) return NextResponse.json({ error: "The quote routing is not permitted for this Robinhood token pair." }, { status: 400 });
    const quoteInput = asRecord(quote.input, "Uniswap quote input");
    const quoteOutput = asRecord(quote.output, "Uniswap quote output");
    if (String(quoteInput.token).toLowerCase() !== tokenIn || quoteInput.amount !== amountIn || String(quoteOutput.token).toLowerCase() !== tokenOut || typeof quoteOutput.amount !== "string" || !/^\d+$/u.test(quoteOutput.amount)) {
      return NextResponse.json({ error: "The quote does not match the requested Robinhood token pair." }, { status: 400 });
    }

    if (tokenIn !== NATIVE_ETH && routing === "CLASSIC") {
      const approvalCheck = await uniswap("/check_approval", input.apiKey.trim(), { walletAddress: input.walletAddress, token: tokenIn, amount: amountIn, chainId: CHAIN_ID, urgency: "normal", includeGasInfo: true });
      if (approvalCheck.cancel != null) return NextResponse.json({ error: "An existing token allowance must be reset in your wallet before swapping." }, { status: 409 });
      if (approvalCheck.approval != null) {
        const approval = parseTransaction(approvalCheck.approval, input.walletAddress, [tokenIn]);
        validateApproval(approval, tokenIn);
        return NextResponse.json({ approvalRequired: true, approval });
      }
    }
    const swap = await uniswap("/swap", input.apiKey.trim(), { quote, refreshGasPrice: true, simulateTransaction: true, safetyMode: "SAFE", urgency: "normal" });
    const wrapRoute = routing === "WRAP" || routing === "UNWRAP";
    const transaction = parseTransaction(swap.swap, input.walletAddress, wrapRoute ? [ROBINHOOD_WETH] : [ROUTER, SWAP_PROXY]);
    if (wrapRoute) validateWrapTransaction(transaction, routing, amountIn, input.walletAddress);
    return NextResponse.json({ approvalRequired: false, transaction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build the Uniswap transaction.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
