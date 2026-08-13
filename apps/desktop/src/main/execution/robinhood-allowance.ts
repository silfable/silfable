import { isAddress, type Address, type Hex } from "viem";
import { buildExactApprovalCalldata } from "./erc20-approval.js";

export type RobinhoodAllowancePreview = {
  token: Address;
  spender: Address;
  requiredAmount: string;
  currentAllowance: string;
  approvalRequired: boolean;
  exactApprovalCalldata: Hex | null;
};

/** Builds an approval preview only. It never signs, submits, or increases an approval beyond the exact sell amount. */
export function previewExactRobinhoodAllowance(input: { token: string; spender: string; sellAmount: string; currentAllowance: bigint }): RobinhoodAllowancePreview {
  if (!isAddress(input.token) || !isAddress(input.spender)) throw new Error("Robinhood allowance preview requires valid EVM addresses");
  if (!/^[1-9]\d*$/u.test(input.sellAmount)) throw new Error("Robinhood allowance preview sell amount is invalid");
  if (input.currentAllowance < 0n) throw new Error("Robinhood allowance is invalid");
  const required = BigInt(input.sellAmount);
  const approvalRequired = input.currentAllowance < required;
  return {
    token: input.token,
    spender: input.spender,
    requiredAmount: input.sellAmount,
    currentAllowance: input.currentAllowance.toString(),
    approvalRequired,
    exactApprovalCalldata: approvalRequired ? buildExactApprovalCalldata({ tokenAddress: input.token, spenderAddress: input.spender, exactAmount: required }) : null,
  };
}
