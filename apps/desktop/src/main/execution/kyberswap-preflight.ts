import type { Address } from "viem";

import type { EvmChainId, EvmChainKey } from "@silfable/contracts";
import type { EvmSwapBuild } from "../integrations/evm-swap-router.js";
import type { KyberSwapBuild } from "../integrations/kyberswap.js";
import { buildExactApprovalCalldata } from "./erc20-approval.js";
import { assertKyberCalldata, inspectKyberRouter, isNativeEvmToken } from "./kyber-router-policy.js";
import { assertUniswapCalldata, inspectUniswapRouter } from "./uniswap-router-policy.js";

const PREFLIGHT_LIFETIME_MS = 90_000;

type EvmSimulationEngine = {
  assertExpectedChain(): Promise<number>;
  getBalance(address: Address): Promise<{ wei: bigint }>;
  getErc20Balance(token: Address, owner: Address): Promise<bigint>;
  getBytecode(address: Address): Promise<`0x${string}` | undefined>;
  getErc20Allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  simulateTransaction(input: {
    from: Address;
    to: `0x${string}`;
    valueWei: bigint;
    data?: `0x${string}`;
  }): Promise<{
    gasLimit: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }>;
};

export type KyberSwapPreflightEvidence = {
  id: string;
  provider: "kyberswap" | "uniswap";
  action: "approval" | "swap";
  chainKey: EvmChainKey;
  chainId: EvmChainId;
  walletAddress: `0x${string}`;
  routerAddress: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string;
  expectedAmountOut: string;
  minimumAmountOut: string;
  nativeValueWei: string;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  maximumNetworkFeeWei: string;
  nativeBalanceWei: string;
  inputTokenBalance: string;
  allowanceRequired: boolean;
  approvalSpender: `0x${string}`;
  currentAllowance: string;
  routerPolicyStatus: "blocked" | "allowlisted";
  routerPolicyReason: string;
  preparedAt: string;
  expiresAt: string;
};

export type StoredKyberPreflight = {
  evidence: KyberSwapPreflightEvidence;
  build: EvmSwapBuild;
  transaction: {
    to: `0x${string}`;
    valueWei: bigint;
    data: `0x${string}`;
  };
};

/**
 * Produces chain-bound, short-lived unsigned evidence for every supported
 * KyberSwap EVM chain. It has no signer or broadcast dependency.
 */
export class KyberSwapPreflightService {
  readonly #pending = new Map<string, StoredKyberPreflight>();

  async prepare(input: {
    quotes: { build(input: { quoteId: string; sender: string; recipient?: string; slippageBps: number }): Promise<EvmSwapBuild | KyberSwapBuild> };
    engine: EvmSimulationEngine;
    quoteId: string;
    wallet: `0x${string}`;
    slippageBps: number;
  }): Promise<KyberSwapPreflightEvidence> {
    const rawBuild = await input.quotes.build({
      quoteId: input.quoteId,
      sender: input.wallet,
      recipient: input.wallet,
      slippageBps: input.slippageBps,
    });
    const build: EvmSwapBuild = "approvalSpender" in rawBuild
      ? rawBuild
      : { ...rawBuild, approvalSpender: rawBuild.routerAddress };
    const chainId = await input.engine.assertExpectedChain();
    if (chainId !== build.chainId) throw new Error(`EVM RPC chain mismatch: expected ${build.chainId}, received ${chainId}`);
    const routerPolicy = build.provider === "uniswap"
      ? inspectUniswapRouter({ chainKey: build.chainKey, routerAddress: build.routerAddress })
      : inspectKyberRouter(build.routerAddress);
    if (routerPolicy.status !== "allowlisted") throw new Error(routerPolicy.reason);
    if (build.provider === "uniswap") assertUniswapCalldata(build.calldata);
    else assertKyberCalldata(build.calldata);
    const bytecode = await input.engine.getBytecode(build.routerAddress);
    if (bytecode === undefined || bytecode === "0x") throw new Error(`${build.provider === "uniswap" ? "Uniswap" : "KyberSwap"} router has no deployed bytecode on the selected chain`);
    const currentAllowance = isNativeEvmToken(build.tokenIn)
      ? BigInt(build.amountIn)
      : await input.engine.getErc20Allowance(build.tokenIn, input.wallet, build.approvalSpender);
    const allowanceRequired = !isNativeEvmToken(build.tokenIn) && currentAllowance < BigInt(build.amountIn);
    const transaction = allowanceRequired
      ? {
          to: build.tokenIn,
          valueWei: 0n,
          data: buildExactApprovalCalldata({
            tokenAddress: build.tokenIn,
            spenderAddress: build.approvalSpender,
            exactAmount: BigInt(build.amountIn),
          }),
        }
      : {
          to: build.transactionTarget,
          valueWei: build.valueWei,
          data: build.calldata,
        };
    const estimate = await input.engine.simulateTransaction({
      from: input.wallet,
      ...transaction,
    });
    const amountIn = BigInt(build.amountIn);
    const maximumNetworkFee = estimate.gasLimit * estimate.maxFeePerGas;
    const nativeBalance = (await input.engine.getBalance(input.wallet)).wei;
    const inputTokenBalance = isNativeEvmToken(build.tokenIn)
      ? nativeBalance
      : await input.engine.getErc20Balance(build.tokenIn, input.wallet);
    if (inputTokenBalance < amountIn) {
      throw new Error("EVM wallet balance cannot cover the reviewed input amount");
    }
    const requiredNativeBalance = transaction.valueWei + maximumNetworkFee;
    if (nativeBalance < requiredNativeBalance) {
      throw new Error("EVM wallet native balance cannot cover the reviewed value and maximum network fee");
    }
    const preparedAt = new Date();
    const evidence: KyberSwapPreflightEvidence = {
      id: crypto.randomUUID(),
      provider: build.provider,
      action: allowanceRequired ? "approval" : "swap",
      chainKey: build.chainKey,
      chainId: build.chainId as EvmChainId,
      walletAddress: input.wallet,
      routerAddress: build.routerAddress,
      tokenIn: build.tokenIn,
      tokenOut: build.tokenOut,
      amountIn: build.amountIn,
      expectedAmountOut: build.amountOut,
      minimumAmountOut: build.minimumAmountOut,
      nativeValueWei: build.valueWei.toString(),
      gasLimit: estimate.gasLimit.toString(),
      maxFeePerGas: estimate.maxFeePerGas.toString(),
      maxPriorityFeePerGas: estimate.maxPriorityFeePerGas.toString(),
      maximumNetworkFeeWei: maximumNetworkFee.toString(),
      nativeBalanceWei: nativeBalance.toString(),
      inputTokenBalance: inputTokenBalance.toString(),
      allowanceRequired,
      approvalSpender: build.approvalSpender,
      currentAllowance: currentAllowance.toString(),
      routerPolicyStatus: routerPolicy.status,
      routerPolicyReason: routerPolicy.reason,
      preparedAt: preparedAt.toISOString(),
      expiresAt: new Date(preparedAt.getTime() + PREFLIGHT_LIFETIME_MS).toISOString(),
    };
    this.#prune(preparedAt.getTime());
    this.#pending.set(evidence.id, { evidence, build, transaction });
    return evidence;
  }

  /** Read retained evidence without consuming it so the main-process Full
   * Access boundary can enforce a session asset allowlist before signing. */
  peek(id: string, now = new Date()): StoredKyberPreflight | null {
    this.#prune(now.getTime());
    return this.#pending.get(id) ?? null;
  }

  /**
   * Trusted execution code may take a preflight only once, after a future
   * router-allowlist, signer, and approval gate are released.
   */
  consume(input: {
    id: string;
    chainKey: EvmChainKey;
    walletAddress: `0x${string}`;
    action: "approval" | "swap";
  }): StoredKyberPreflight {
    const item = this.#pending.get(input.id);
    this.#pending.delete(input.id);
    if (item === undefined) throw new Error("EVM swap preflight is unavailable or already consumed");
    if (Date.parse(item.evidence.expiresAt) <= Date.now()) throw new Error("EVM swap preflight expired; run a new simulation");
    if (item.evidence.chainKey !== input.chainKey) throw new Error("EVM swap preflight chain scope does not match");
    if (item.evidence.walletAddress.toLowerCase() !== input.walletAddress.toLowerCase()) {
      throw new Error("EVM swap preflight wallet scope does not match");
    }
    if (item.evidence.action !== input.action) throw new Error("EVM swap preflight action does not match");
    return item;
  }

  #prune(now: number): void {
    for (const [id, item] of this.#pending) {
      if (Date.parse(item.evidence.expiresAt) <= now) this.#pending.delete(id);
    }
  }
}
