import type { Address, Hex } from "viem";
import { randomUUID } from "node:crypto";

import type { EvmSignerService } from "../wallet/evm-signer.js";
import { buildExactApprovalCalldata } from "./erc20-approval.js";
import type { EmergencyStopService } from "../security/emergency-stop.js";
import type { MasterPasswordService } from "../security/master-password.js";
import type { RobinhoodPreflightService } from "./robinhood-preflight.js";
import { ROBINHOOD_PILOT_POLICY } from "./robinhood-policy.js";

type ApprovalEngine = {
  getChainId(): number;
  getPendingNonce(address: Address): Promise<number>;
  estimateGasAndFees(input: { from: Address; to: Address; data?: Hex; valueWei: bigint }): Promise<{ gasLimit: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  sendRawTransaction(rawTx: Hex): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<{ status: "success" | "reverted" }>;
};

type ReceiptSaver = { save(receipt: { id: string; transactionHash: Hex; wallet: Address; kind: "approval"; status: "confirmed" | "reverted" | "unknown"; reconciledAt: string }): Promise<void> };
type ApprovalReceipt = { id: string; transactionHash: Hex; wallet: Address; kind: "approval"; status: "confirmed" | "reverted" | "unknown"; reconciledAt: string };

export type RobinhoodApprovalRequest = {
  masterPassword: string;
  confirmation: "APPROVE ROBINHOOD MAINNET";
  preflightId: string;
  wallet: Address;
};

/**
 * Executes only the exact ERC-20 approval required by an already reviewed trade.
 * It deliberately does not execute a swap: after approval is confirmed, the caller
 * must obtain a new firm quote and preflight it again.
 */
export class RobinhoodApprovalExecutionService {
  readonly #passwords: MasterPasswordService;
  readonly #emergencyStop: EmergencyStopService;
  readonly #preflight: RobinhoodPreflightService;
  readonly #receipts: ReceiptSaver | undefined;

  constructor(passwords: MasterPasswordService, emergencyStop: EmergencyStopService, preflight: RobinhoodPreflightService, receipts?: ReceiptSaver) {
    this.#passwords = passwords;
    this.#emergencyStop = emergencyStop;
    this.#preflight = preflight;
    this.#receipts = receipts;
  }

  async execute(input: RobinhoodApprovalRequest & { engine: ApprovalEngine; withSigner: <T>(operation: (signer: EvmSignerService) => Promise<T>) => Promise<T> }): Promise<{ hash: Hex; receipt: ApprovalReceipt }> {
    if (input.confirmation !== "APPROVE ROBINHOOD MAINNET") throw new Error("Robinhood approval confirmation is required");
    this.#emergencyStop.assertExecutionAllowed();
    if (!(await this.#passwords.verify(input.masterPassword))) throw new Error("Master password is incorrect");
    const approval = this.#preflight.takeForApproval(input.preflightId, input.wallet);

    const data = buildExactApprovalCalldata({ tokenAddress: approval.token, spenderAddress: approval.spender, exactAmount: approval.exactAmount });
    const [nonce, gas] = await Promise.all([
      input.engine.getPendingNonce(input.wallet),
      input.engine.estimateGasAndFees({ from: input.wallet, to: approval.token, data, valueWei: 0n }),
    ]);
    if (gas.gasLimit * gas.maxFeePerGas > ROBINHOOD_PILOT_POLICY.maxGasWei) {
      throw new Error("Robinhood pilot gas limit would be exceeded");
    }
    const signed = await input.withSigner((signer) => signer.signTransaction({
      to: approval.token,
      value: 0n,
      data,
      nonce,
      gasLimit: gas.gasLimit,
      maxFeePerGas: gas.maxFeePerGas,
      maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
      chainId: input.engine.getChainId(),
    }));
    const hash = await input.engine.sendRawTransaction(signed.rawTransaction);
    const receiptId = randomUUID();
    const broadcastAt = new Date().toISOString();
    const pendingReceipt: ApprovalReceipt = { id: receiptId, transactionHash: hash, wallet: input.wallet, kind: "approval", status: "unknown", reconciledAt: broadcastAt };
    await this.#receipts?.save(pendingReceipt);
    try {
      const chainReceipt = await input.engine.waitForReceipt(hash);
      const finalReceipt: ApprovalReceipt = {
        ...pendingReceipt,
        status: chainReceipt.status === "success" ? "confirmed" : "reverted",
        reconciledAt: new Date().toISOString(),
      };
      await this.#receipts?.save(finalReceipt);
      return { hash, receipt: finalReceipt };
    } catch {
      return { hash, receipt: pendingReceipt };
    }
  }
}
