import { randomUUID } from "node:crypto";
import type { Address, Hex } from "viem";

import type { EvmSignerService } from "../wallet/evm-signer.js";
import { ROBINHOOD_PILOT_POLICY } from "./robinhood-policy.js";
import type { RobinhoodPreflightService } from "./robinhood-preflight.js";
import type { EmergencyStopService } from "../security/emergency-stop.js";
import type { MasterPasswordService } from "../security/master-password.js";

type SwapEngine = {
  getChainId(): number;
  getErc20Allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  getPendingNonce(address: Address): Promise<number>;
  estimateGasAndFees(input: { from: Address; to: Address; data?: Hex; valueWei: bigint }): Promise<{ gasLimit: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  sendRawTransaction(rawTx: Hex): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<{ status: "success" | "reverted" }>;
};

type ReceiptSaver = { save(receipt: { id: string; transactionHash: Hex; wallet: Address; kind: "swap"; status: "confirmed" | "reverted" | "unknown"; reconciledAt: string }): Promise<void> };
type SwapReceipt = { id: string; transactionHash: Hex; wallet: Address; kind: "swap"; status: "confirmed" | "reverted" | "unknown"; reconciledAt: string };

export type RobinhoodSwapRequest = {
  masterPassword: string;
  confirmation: "EXECUTE ROBINHOOD MAINNET SWAP";
  preflightId: string;
  wallet: Address;
};

/** Executes a one-time, preflighted 0x swap. It refuses stale/consumed quotes and insufficient exact allowance. */
export class RobinhoodSwapExecutionService {
  readonly #passwords: MasterPasswordService;
  readonly #emergencyStop: EmergencyStopService;
  readonly #preflight: RobinhoodPreflightService;
  readonly #receipts: ReceiptSaver | undefined;

  constructor(passwords: MasterPasswordService, emergencyStop: EmergencyStopService, preflight: RobinhoodPreflightService, receipts?: ReceiptSaver) {
    this.#passwords = passwords; this.#emergencyStop = emergencyStop; this.#preflight = preflight; this.#receipts = receipts;
  }

  async execute(input: RobinhoodSwapRequest & { engine: SwapEngine; withSigner: <T>(operation: (signer: EvmSignerService) => Promise<T>) => Promise<T> }): Promise<{ hash: Hex; receipt: SwapReceipt }> {
    if (input.confirmation !== "EXECUTE ROBINHOOD MAINNET SWAP") throw new Error("Robinhood swap confirmation is required");
    this.#emergencyStop.assertExecutionAllowed();
    if (!(await this.#passwords.verify(input.masterPassword))) throw new Error("Master password is incorrect");
    const prepared = this.#preflight.takeForSwap(input.preflightId, input.wallet);
    const { quote, sellToken } = prepared;
    const allowance = await input.engine.getErc20Allowance(sellToken, input.wallet, quote.allowanceTarget);
    if (allowance < BigInt(quote.sellAmount)) throw new Error("Robinhood swap requires a confirmed exact ERC-20 approval; prepare a new quote after approval");
    const [nonce, gas] = await Promise.all([
      input.engine.getPendingNonce(input.wallet),
      input.engine.estimateGasAndFees({ from: input.wallet, to: quote.to, data: quote.data, valueWei: quote.value }),
    ]);
    if (gas.gasLimit * gas.maxFeePerGas > ROBINHOOD_PILOT_POLICY.maxGasWei) throw new Error("Robinhood pilot gas limit would be exceeded");
    const signed = await input.withSigner((signer) => signer.signTransaction({ to: quote.to, value: quote.value, data: quote.data, nonce, gasLimit: gas.gasLimit, maxFeePerGas: gas.maxFeePerGas, maxPriorityFeePerGas: gas.maxPriorityFeePerGas, chainId: input.engine.getChainId() }));
    const hash = await input.engine.sendRawTransaction(signed.rawTransaction);
    const receiptId = randomUUID();
    const pendingReceipt: SwapReceipt = { id: receiptId, transactionHash: hash, wallet: input.wallet, kind: "swap", status: "unknown", reconciledAt: new Date().toISOString() };
    await this.#receipts?.save(pendingReceipt);
    try {
      const chainReceipt = await input.engine.waitForReceipt(hash);
      const finalReceipt: SwapReceipt = {
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
