// @ts-nocheck
import { createHash, randomUUID } from "node:crypto";
import { getAddress, type Address, type Hex } from "viem";

import {
  BRIDGE_SOLANA_CHAIN_ID,
  EvmBridgeContractSchema,
  EvmBridgePreflightSchema,
  EvmBridgeQuoteSchema,
  type EvmBridgeContract,
  type EvmBridgePreflight,
  type EvmBridgeQuote,
} from "@silfable/contracts";
import { resolveCrossChainBridgeRoute } from "./cross-chain-bridge-routes.js";
import { parseRelayEvmTransactionSteps, type RelayEvmTransactionStep } from "./relay-evm-steps.js";

const RELAY_API = "https://api.relay.link";
const RELAY_SOLANA_CHAIN_ID = 792_703_809;
const PREFLIGHT_TTL_MS = 90_000;

type Engine = {
  assertExpectedChain(): Promise<number>;
  getBalance(address: Address): Promise<{ wei: bigint }>;
  getErc20Balance(token: Address, owner: Address): Promise<bigint>;
  getBytecode(address: Address): Promise<Hex | undefined>;
  simulateTransaction(input: { from: Address; to: Address; valueWei: bigint; data?: Hex }): Promise<{
    gasLimit: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }>;
};

type RetainedPreflight = {
  contract: EvmBridgeContract;
  quote: EvmBridgeQuote;
  evidence: EvmBridgePreflight;
  transaction: RelayEvmTransactionStep;
};

/**
 * Relay V2 adapter for EVM-origin bridges. Provider calldata remains only in
 * volatile main-process memory and is bound to a short-lived digest. Approval
 * and deposit are deliberately returned as separate user actions.
 */
export class RelayEvmBridgeService {
  readonly #fetch: typeof fetch;
  readonly #apiUrl: string;
  readonly #prepared = new Map<string, RetainedPreflight>();

  constructor(fetchImpl: typeof fetch = fetch, apiUrl = RELAY_API) {
    this.#fetch = fetchImpl;
    this.#apiUrl = apiUrl.replace(/\/$/u, "");
  }

  async prepare(rawContract: EvmBridgeContract, engine: Engine, now = new Date()): Promise<{ quote: EvmBridgeQuote; preflight: EvmBridgePreflight }> {
    this.clearExpired(now);
    const contract = EvmBridgeContractSchema.parse(rawContract);
    resolveCrossChainBridgeRoute(
      contract.sourceChainId,
      contract.sourceAssetAddress,
      contract.destination.chainId,
      contract.destination.assetAddress,
    );
    if (Date.parse(contract.deadline) <= now.getTime()) throw new Error("EVM bridge contract has expired");
    const remoteChain = await engine.assertExpectedChain();
    if (remoteChain !== contract.sourceChainId) throw new Error("EVM bridge source RPC does not match the contract chain");

    const response = await this.#fetch(`${this.#apiUrl}/quote/v2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user: contract.sourceWallet,
        recipient: contract.destination.recipient,
        refundTo: contract.sourceWallet,
        originChainId: contract.sourceChainId,
        destinationChainId: contract.destination.kind === "solana" ? RELAY_SOLANA_CHAIN_ID : contract.destination.chainId,
        originCurrency: contract.sourceAssetAddress,
        destinationCurrency: contract.destination.assetAddress,
        amount: contract.amountIn,
        tradeType: "EXACT_INPUT",
        explicitDeposit: true,
        usePermit: false,
        useFallbacks: true,
        slippageTolerance: String(contract.slippageBps),
      }),
    });
    if (!response.ok) throw new Error(`Relay bridge quote failed with HTTP ${response.status}`);
    const payload = asRecord(await response.json(), "Relay quote");
    const steps = parseRelayEvmTransactionSteps({ steps: payload.steps, expectedChainId: contract.sourceChainId });
    const bridgeTransaction = steps.find((step) => step.kind === "bridge");
    const approvalTransaction = steps.find((step) => step.kind === "approval");
    const transaction = approvalTransaction ?? bridgeTransaction;
    if (transaction === undefined) throw new Error("Relay bridge quote does not contain an executable source transaction");
    if (transaction.kind === "approval" && transaction.to.toLowerCase() !== contract.sourceAssetAddress.toLowerCase()) {
      throw new Error("Relay approval target is not the release-controlled source token");
    }
    if (approvalTransaction !== undefined) {
      if (bridgeTransaction === undefined) throw new Error("Relay approval is missing its matching bridge deposit step");
      validateExactApproval(approvalTransaction.data, bridgeTransaction.to, BigInt(contract.amountIn));
    }
    const code = await engine.getBytecode(transaction.to);
    if (code === undefined || code === "0x") throw new Error("Relay bridge transaction target has no deployed bytecode");

    const sourceTokenBalance = await engine.getErc20Balance(getAddress(contract.sourceAssetAddress), getAddress(contract.sourceWallet));
    if (sourceTokenBalance < BigInt(contract.amountIn)) throw new Error("EVM source wallet token balance does not cover the bridge amount");
    const native = await engine.getBalance(getAddress(contract.sourceWallet));
    const simulation = await engine.simulateTransaction({
      from: getAddress(contract.sourceWallet),
      to: transaction.to,
      valueWei: transaction.valueWei,
      data: transaction.data,
    });
    const maximumNetworkFee = simulation.gasLimit * simulation.maxFeePerGas;
    if (maximumNetworkFee > BigInt(contract.maximumNetworkFeeWei)) throw new Error("EVM bridge network fee exceeds the contract limit");
    if (native.wei < transaction.valueWei + maximumNetworkFee) throw new Error("EVM source wallet cannot cover bridge value and maximum network fee");

    const requestId = findRequestId(payload.steps);
    const estimatedDestinationAmount = readUnsigned(payload, [
      ["details", "currencyOut", "amount"],
      ["details", "destination", "outputCurrency", "amount"],
      ["details", "destinationCurrency", "amount"],
    ], "destination amount");
    const providerMinimum = readUnsignedOptional(payload, [
      ["details", "currencyOut", "minimumAmount"],
      ["details", "destination", "outputCurrency", "minimumAmount"],
    ]) ?? estimatedDestinationAmount;
    if (BigInt(estimatedDestinationAmount) < BigInt(contract.minimumDestinationAmount)) {
      throw new Error("Relay bridge output is below the contract minimum");
    }
    const totalFeeUsd = readTotalFeeUsd(payload);
    if (totalFeeUsd > contract.maximumTotalFeeUsd) throw new Error("Relay bridge provider fee exceeds the contract limit");
    const quoteCreatedAt = now.toISOString();
    const quoteExpiryMs = Math.min(Date.parse(contract.deadline), now.getTime() + PREFLIGHT_TTL_MS);
    const transactionDigest = digestTransaction(transaction);
    const quote = EvmBridgeQuoteSchema.parse({
      quoteId: randomUUID(), contractId: contract.id, requestId, provider: "relay",
      amountIn: contract.amountIn, estimatedDestinationAmount,
      minimumDestinationAmount: BigInt(providerMinimum) > BigInt(contract.minimumDestinationAmount) ? providerMinimum : contract.minimumDestinationAmount,
      totalFeeUsd, estimatedFulfillmentSeconds: readTimeEstimate(payload), action: transaction.kind === "approval" ? "approval" : "deposit",
      transactionTarget: transaction.to, transactionDigest, quoteCreatedAt,
      quoteExpiresAt: new Date(quoteExpiryMs).toISOString(),
    });
    const preflight = EvmBridgePreflightSchema.parse({
      id: randomUUID(), quoteId: quote.quoteId, contractId: contract.id, requestId,
      action: quote.action, chainKey: contract.sourceChainKey, chainId: contract.sourceChainId,
      walletAddress: contract.sourceWallet, transactionTarget: transaction.to, transactionDigest,
      gasLimit: simulation.gasLimit.toString(), maxFeePerGas: simulation.maxFeePerGas.toString(),
      maxPriorityFeePerGas: simulation.maxPriorityFeePerGas.toString(), maximumNetworkFeeWei: maximumNetworkFee.toString(),
      nativeBalanceWei: native.wei.toString(), sourceTokenBalance: sourceTokenBalance.toString(),
      preparedAt: quoteCreatedAt, expiresAt: new Date(quoteExpiryMs).toISOString(),
      transactionSigned: false, broadcastAttempted: false,
    });
    this.#prepared.set(preflight.id, { contract, quote, evidence: preflight, transaction });
    return { quote, preflight };
  }

  consume(input: { preflightId: string; action: "approval" | "deposit"; now?: Date }): RetainedPreflight {
    const now = input.now ?? new Date();
    const retained = this.#prepared.get(input.preflightId);
    if (retained === undefined) throw new Error("EVM bridge preflight is unavailable; request a fresh Relay quote");
    this.#prepared.delete(input.preflightId);
    if (Date.parse(retained.evidence.expiresAt) <= now.getTime()) throw new Error("EVM bridge preflight expired; request a fresh Relay quote");
    if (retained.evidence.action !== input.action) throw new Error("EVM bridge action does not match the reviewed preflight");
    if (digestTransaction(retained.transaction) !== retained.evidence.transactionDigest) throw new Error("EVM bridge transaction digest changed");
    return retained;
  }

  /** Main-process only lookup used to bind IPC session scope before consume. */
  peek(preflightId: string, now = new Date()): RetainedPreflight | null {
    this.clearExpired(now);
    return this.#prepared.get(preflightId) ?? null;
  }

  clearExpired(now = new Date()): void {
    for (const [id, prepared] of this.#prepared) {
      if (Date.parse(prepared.evidence.expiresAt) <= now.getTime()) this.#prepared.delete(id);
    }
  }

  clear(): void { this.#prepared.clear(); }
}

function digestTransaction(transaction: RelayEvmTransactionStep): `sha256:${string}` {
  const value = `${transaction.chainId}:${transaction.kind}:${transaction.to.toLowerCase()}:${transaction.valueWei}:${transaction.data.toLowerCase()}`;
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function getPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) current = asRecord(current, "Relay quote field")[segment];
  return current;
}

function readUnsigned(value: unknown, paths: readonly (readonly string[])[], label: string): string {
  const found = readUnsignedOptional(value, paths);
  if (found === null) throw new Error(`Relay quote is missing ${label}`);
  return found;
}

function readUnsignedOptional(value: unknown, paths: readonly (readonly string[])[]): string | null {
  for (const path of paths) {
    try {
      const found = getPath(value, path);
      if ((typeof found === "string" || typeof found === "number") && /^\d+$/u.test(String(found))) return String(found);
    } catch { /* try the next documented response shape */ }
  }
  return null;
}

function findRequestId(steps: unknown): string {
  if (!Array.isArray(steps)) throw new Error("Relay quote is missing steps");
  for (const raw of steps) {
    const step = asRecord(raw, "Relay step");
    if (typeof step.requestId === "string" && /^0x[a-fA-F0-9]{64}$/u.test(step.requestId)) return step.requestId;
    if (!Array.isArray(step.items)) continue;
    for (const rawItem of step.items) {
      const item = asRecord(rawItem, "Relay step item");
      const check = typeof item.check === "object" && item.check !== null ? item.check as Record<string, unknown> : null;
      const endpoint = check?.endpoint;
      if (typeof endpoint === "string") {
        const match = endpoint.match(/[?&]requestId=(0x[a-fA-F0-9]{64})/u);
        if (match?.[1] !== undefined) return match[1];
      }
    }
  }
  throw new Error("Relay quote is missing a request ID");
}

function readTotalFeeUsd(payload: Record<string, unknown>): number {
  // Relay exposes the complete user impact separately from the expanded fee
  // aliases. Prefer it so gas/relayerGas and relayer/relayerService are never
  // counted twice merely because both compatibility fields are present.
  try {
    const impact = Number(getPath(payload, ["details", "totalImpact", "usd"]));
    if (Number.isFinite(impact) && impact >= 0) return impact;
  } catch { /* fall back to canonical fee components */ }
  const fees = asRecord(payload.fees, "Relay fees");
  let total = 0;
  let found = false;
  for (const key of ["gas", "relayer", "app", "currencyGasTopup"] as const) {
    const value = fees[key];
    if (typeof value !== "object" || value === null) continue;
    const fee = value as Record<string, unknown>;
    const raw = fee.amountUsd ?? fee.usd;
    if (typeof raw === "string" || typeof raw === "number") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) { total += parsed; found = true; }
    }
  }
  if (!found) throw new Error("Relay quote is missing a verifiable USD fee breakdown");
  return total;
}

function validateExactApproval(data: Hex, expectedSpender: Address, maximumAmount: bigint): void {
  // approve(address,uint256) selector + two ABI words.
  if (!/^0x095ea7b3[0-9a-fA-F]{128}$/u.test(data)) {
    throw new Error("Relay approval calldata is not an exact ERC-20 approve call");
  }
  const spender = getAddress(`0x${data.slice(34, 74)}`);
  const amount = BigInt(`0x${data.slice(74, 138)}`);
  if (spender.toLowerCase() !== expectedSpender.toLowerCase()) {
    throw new Error("Relay approval spender does not match the reviewed bridge deposit target");
  }
  if (amount <= 0n || amount > maximumAmount) {
    throw new Error("Relay approval amount exceeds the exact bridge contract amount");
  }
}

function readTimeEstimate(payload: Record<string, unknown>): number {
  try {
    const raw = getPath(payload, ["details", "timeEstimate"]);
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, 86_400) : 0;
  } catch { return 0; }
}
