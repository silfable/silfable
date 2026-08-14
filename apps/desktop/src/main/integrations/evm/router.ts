import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";

const UNISWAP_V3_ROUTER_ABI = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams params) external payable returns (uint256 amountOut)",
]);

export interface EvmSwapRequest {
  /**
   * A deployment address verified independently for Robinhood Chain.
   * Never substitute a router address from Ethereum or another EVM chain.
   */
  verifiedRouterAddress: Address;
  tokenIn: Address;
  tokenOut: Address;
  fee?: number; // Fee tier: 500 (0.05%), 3000 (0.3%), 10000 (1%)
  amountInWei: bigint;
  minAmountOutWei: bigint;
  recipient: Address;
  deadlineMinutes?: number;
}

/**
 * Encodes Uniswap V3 exactInputSingle calldata with slippage guard
 */
export function buildUniswapV3SwapCalldata(req: EvmSwapRequest): {
  to: Address;
  calldata: Hex;
  valueWei: bigint;
} {
  if (req.verifiedRouterAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("A verified Robinhood Chain router address is required");
  }
  if (req.tokenIn.toLowerCase() === req.tokenOut.toLowerCase()) {
    throw new Error("EVM swap input and output tokens must be different");
  }
  if (req.amountInWei <= 0n || req.minAmountOutWei <= 0n) {
    throw new Error("EVM swap amounts must be positive");
  }
  const feeTier = req.fee ?? 3000; // Default 0.3% fee tier
  if (![500, 3_000, 10_000].includes(feeTier)) {
    throw new Error("EVM swap fee tier is not allowlisted");
  }
  const deadlineMinutes = req.deadlineMinutes ?? 10;
  if (!Number.isInteger(deadlineMinutes) || deadlineMinutes < 5 || deadlineMinutes > 1_440) {
    throw new Error("EVM swap deadline must be between 5 minutes and 24 hours");
  }
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);

  const calldata = encodeFunctionData({
    abi: UNISWAP_V3_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: req.tokenIn,
        tokenOut: req.tokenOut,
        fee: feeTier,
        recipient: req.recipient,
        deadline,
        amountIn: req.amountInWei,
        amountOutMinimum: req.minAmountOutWei,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  const isNativeEthSell = req.tokenIn.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

  return {
    to: req.verifiedRouterAddress,
    calldata,
    valueWei: isNativeEthSell ? req.amountInWei : 0n,
  };
}
