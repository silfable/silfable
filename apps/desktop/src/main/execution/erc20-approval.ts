import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

export interface Erc20ApprovalParams {
  tokenAddress: Address;
  spenderAddress: Address;
  exactAmount: bigint;
}

/**
 * Builds calldata for exact ERC-20 approval (prevents infinite approval risk)
 */
export function buildExactApprovalCalldata(params: Erc20ApprovalParams): Hex {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [params.spenderAddress, params.exactAmount],
  });
}
