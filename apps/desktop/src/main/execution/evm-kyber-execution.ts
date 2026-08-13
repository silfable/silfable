import { randomUUID } from "node:crypto";
import type { Address, Hex } from "viem";

import type { EvmChainKey } from "@silfable/contracts";
import type { EvmSignerService } from "../wallet/evm-signer.js";
import type { EmergencyStopService } from "../security/emergency-stop.js";
import type { MasterPasswordService } from "../security/master-password.js";
import type { KyberSwapPreflightService } from "./kyberswap-preflight.js";

export type EvmExecutionReceipt = {
  id: string;
  chainKey: EvmChainKey;
  chainId: number;
  transactionHash: Hex;
  wallet: Address;
  kind: "approval" | "swap";
  status: "confirmed" | "reverted" | "unknown";
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  expectedAmountOut: string;
  minimumAmountOut: string;
  networkFeeWei: string;
  broadcastAt: string;
  reconciledAt: string;
};

type ExecutionEngine = {
  assertExpectedChain(): Promise<number>;
  getBalance(address: Address): Promise<{ wei: bigint }>;
  getErc20Balance(token: Address, owner: Address): Promise<bigint>;
  simulateTransaction(input: {
    from: Address;
    to: Address;
    valueWei: bigint;
    data?: Hex;
  }): Promise<{
    gasLimit: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }>;
  getPendingNonce(address: Address): Promise<number>;
  sendRawTransaction(rawTx: Hex): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<{ status: "success" | "reverted" }>;
};

type ReceiptSaver = {
  save(receipt: EvmExecutionReceipt): Promise<void>;
};

export type EvmKyberExecutionRequest = {
  preflightId: string;
  chainKey: EvmChainKey;
  walletAddress: Address;
  action: "approval" | "swap";
  masterPassword: string;
  confirmation: "APPROVE EVM MAINNET" | "EXECUTE EVM MAINNET SWAP";
};

type RuntimeExecutionInput = {
  preflightId: string;
  chainKey: EvmChainKey;
  walletAddress: Address;
  action: "approval" | "swap";
  engine: ExecutionEngine;
  withSigner: <T>(operation: (signer: EvmSignerService) => Promise<T>) => Promise<T>;
};

/**
 * Executes the exact transaction retained by a short-lived Kyber preflight.
 * Approval and swap are separate one-attempt operations. An approval can never
 * silently continue into a swap; a fresh quote and preflight are required.
 */
export class EvmKyberExecutionService {
  readonly #passwords: MasterPasswordService;
  readonly #emergencyStop: EmergencyStopService;
  readonly #preflights: KyberSwapPreflightService;
  readonly #receipts: ReceiptSaver;

  constructor(
    passwords: MasterPasswordService,
    emergencyStop: EmergencyStopService,
    preflights: KyberSwapPreflightService,
    receipts: ReceiptSaver,
  ) {
    this.#passwords = passwords;
    this.#emergencyStop = emergencyStop;
    this.#preflights = preflights;
    this.#receipts = receipts;
  }

  async execute(input: EvmKyberExecutionRequest & {
    engine: ExecutionEngine;
    withSigner: <T>(operation: (signer: EvmSignerService) => Promise<T>) => Promise<T>;
  }): Promise<EvmExecutionReceipt> {
    const expectedConfirmation = input.action === "approval"
      ? "APPROVE EVM MAINNET"
      : "EXECUTE EVM MAINNET SWAP";
    if (input.confirmation !== expectedConfirmation) throw new Error("Exact EVM Mainnet confirmation is required");
    this.#emergencyStop.assertExecutionAllowed();
    if (!(await this.#passwords.verify(input.masterPassword))) throw new Error("Master password is incorrect");
    return await this.#executePrepared(input);
  }

  /**
   * Trusted desktop-only path for an enrolled local Full Access session. The
   * IPC handler must bind it to a Robinhood session and assert the in-memory
   * signing session first; this method deliberately never accepts a password
   * or a renderer-controlled approval bypass flag.
   */
  async executeFullAccess(input: RuntimeExecutionInput): Promise<EvmExecutionReceipt> {
    this.#emergencyStop.assertExecutionAllowed();
    return await this.#executePrepared(input);
  }

  async #executePrepared(input: RuntimeExecutionInput): Promise<EvmExecutionReceipt> {
    const prepared = this.#preflights.consume({
      id: input.preflightId,
      chainKey: input.chainKey,
      walletAddress: input.walletAddress,
      action: input.action,
    });
    const remoteChainId = await input.engine.assertExpectedChain();
    if (remoteChainId !== prepared.evidence.chainId) throw new Error("EVM execution chain no longer matches the reviewed preflight");

    const fresh = await input.engine.simulateTransaction({
      from: input.walletAddress,
      ...prepared.transaction,
    });
    const reviewedMaximum = BigInt(prepared.evidence.maximumNetworkFeeWei);
    const freshMaximum = fresh.gasLimit * fresh.maxFeePerGas;
    const allowedMaximum = (reviewedMaximum * 150n) / 100n;
    if (freshMaximum > allowedMaximum) {
      throw new Error("EVM network fee increased beyond the reviewed maximum; run a new preflight");
    }
    const balance = await input.engine.getBalance(input.walletAddress);
    if (balance.wei < prepared.transaction.valueWei + freshMaximum) {
      throw new Error("EVM wallet balance cannot cover the reviewed value and maximum network fee");
    }
    const nativeInput = prepared.evidence.nativeValueWei !== "0";
    if (!nativeInput) {
      const tokenBalance = await input.engine.getErc20Balance(
        prepared.evidence.tokenIn,
        input.walletAddress,
      );
      if (tokenBalance < BigInt(prepared.evidence.amountIn)) {
        throw new Error("EVM ERC-20 balance no longer covers the reviewed input amount");
      }
    }

    const nonce = await input.engine.getPendingNonce(input.walletAddress);
    const signed = await input.withSigner(async (signer) => await signer.signTransaction({
      to: prepared.transaction.to,
      value: prepared.transaction.valueWei,
      data: prepared.transaction.data,
      nonce,
      gasLimit: fresh.gasLimit,
      maxFeePerGas: fresh.maxFeePerGas,
      maxPriorityFeePerGas: fresh.maxPriorityFeePerGas,
      chainId: prepared.evidence.chainId,
    }));
    const transactionHash = await input.engine.sendRawTransaction(signed.rawTransaction);
    const broadcastAt = new Date().toISOString();
    const pending: EvmExecutionReceipt = {
      id: randomUUID(),
      chainKey: prepared.evidence.chainKey,
      chainId: prepared.evidence.chainId,
      transactionHash,
      wallet: input.walletAddress,
      kind: input.action,
      status: "unknown",
      tokenIn: prepared.evidence.tokenIn,
      tokenOut: prepared.evidence.tokenOut,
      amountIn: prepared.evidence.amountIn,
      expectedAmountOut: prepared.evidence.expectedAmountOut,
      minimumAmountOut: prepared.evidence.minimumAmountOut,
      networkFeeWei: freshMaximum.toString(),
      broadcastAt,
      reconciledAt: broadcastAt,
    };
    await this.#receipts.save(pending);
    try {
      const chainReceipt = await input.engine.waitForReceipt(transactionHash);
      const finalReceipt: EvmExecutionReceipt = {
        ...pending,
        status: chainReceipt.status === "success" ? "confirmed" : "reverted",
        reconciledAt: new Date().toISOString(),
      };
      await this.#receipts.save(finalReceipt);
      return finalReceipt;
    } catch {
      return pending;
    }
  }
}
