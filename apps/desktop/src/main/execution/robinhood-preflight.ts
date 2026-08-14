import crypto from "node:crypto";
import type { Address } from "viem";
import { previewExactRobinhoodAllowance } from "./robinhood-allowance.js";
import { ROBINHOOD_PILOT_POLICY } from "./robinhood-policy.js";
import type { ZeroExFirmQuote } from "../integrations/zeroex-firm-quote.js";

export type RobinhoodPreflight = { id: string; expiresAt: string; allowanceRequired: boolean; currentAllowance: string; gasLimit: string; maxFeePerGas: string; maxGasCostWei: string };
type PreflightEngine = { getErc20Allowance(token: Address, owner: Address, spender: Address): Promise<bigint>; estimateGasAndFees(input: { from: Address; to: Address; data?: `0x${string}`; valueWei: bigint }): Promise<{ gasLimit: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> };
type PreparedRobinhoodTrade = {
  quote: ZeroExFirmQuote;
  wallet: Address;
  sellToken: Address;
  allowanceRequired: boolean;
  expiresAt: number;
};
export class RobinhoodPreflightService {
  #prepared = new Map<string, PreparedRobinhoodTrade>();
  async prepare(input: { engine: PreflightEngine; wallet: Address; firmQuote: ZeroExFirmQuote; token: Address }): Promise<RobinhoodPreflight> {
    const allowance = await input.engine.getErc20Allowance(input.token, input.wallet, input.firmQuote.allowanceTarget);
    const approval = previewExactRobinhoodAllowance({ token: input.token, spender: input.firmQuote.allowanceTarget, sellAmount: input.firmQuote.sellAmount, currentAllowance: allowance });
    const gas = await input.engine.estimateGasAndFees({ from: input.wallet, to: input.firmQuote.to, data: input.firmQuote.data, valueWei: input.firmQuote.value });
    const maxGasCostWei = gas.gasLimit * gas.maxFeePerGas;
    if (maxGasCostWei > ROBINHOOD_PILOT_POLICY.maxGasWei) throw new Error("Robinhood pilot gas limit would be exceeded");
    const id = crypto.randomUUID(); const expiresAt = Date.now() + 60_000;
    this.#purge(); this.#prepared.set(id, {
      quote: input.firmQuote,
      wallet: input.wallet,
      sellToken: input.token,
      allowanceRequired: approval.approvalRequired,
      expiresAt,
    });
    return { id, expiresAt: new Date(expiresAt).toISOString(), allowanceRequired: approval.approvalRequired, currentAllowance: approval.currentAllowance, gasLimit: gas.gasLimit.toString(), maxFeePerGas: gas.maxFeePerGas.toString(), maxGasCostWei: maxGasCostWei.toString() };
  }
  take(id: string): ZeroExFirmQuote { this.#purge(); const prepared = this.#prepared.get(id); if (!prepared) throw new Error("Robinhood preflight is unavailable or expired"); this.#prepared.delete(id); return prepared.quote; }
  takeForApproval(id: string, wallet: Address): { token: Address; spender: Address; exactAmount: bigint } {
    const prepared = this.#takeScoped(id, wallet);
    if (!prepared.allowanceRequired) throw new Error("This Robinhood preflight does not require an ERC-20 approval");
    return {
      token: prepared.sellToken,
      spender: prepared.quote.allowanceTarget,
      exactAmount: BigInt(prepared.quote.sellAmount),
    };
  }
  takeForSwap(id: string, wallet: Address): { quote: ZeroExFirmQuote; sellToken: Address } {
    const prepared = this.#takeScoped(id, wallet);
    if (prepared.allowanceRequired) throw new Error("A confirmed exact approval is required; prepare a fresh trade review after approval");
    return { quote: prepared.quote, sellToken: prepared.sellToken };
  }
  #takeScoped(id: string, wallet: Address): PreparedRobinhoodTrade {
    this.#purge();
    const prepared = this.#prepared.get(id);
    if (!prepared) throw new Error("Robinhood preflight is unavailable or expired");
    this.#prepared.delete(id);
    if (prepared.wallet.toLowerCase() !== wallet.toLowerCase()) throw new Error("Robinhood preflight wallet scope does not match");
    return prepared;
  }
  #purge(): void { const now = Date.now(); for (const [id, p] of this.#prepared) if (p.expiresAt <= now) this.#prepared.delete(id); }
}
