export type SupportedChainType = "solana" | "evm";

export type EvmChainId = 1 | 42161 | 8453; // Ethereum Mainnet, Arbitrum One, Base Mainnet

export type UnsignedEvmTransactionPayload = {
  to: string;
  value: string;
  data: string;
  chainId: EvmChainId;
  nonce: number;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  gasLimit: string;
};

export interface CrossChainVenueProvider {
  readonly chainType: SupportedChainType;
  readonly chainId: string | number;
  validateAddress(address: string): boolean;
  buildUnsignedTrade(params: {
    to: string;
    amountWei: string;
    callData?: string;
    nonce: number;
    maxFeePerGasWei: string;
    maxPriorityFeePerGasWei: string;
    gasLimit: string;
  }): UnsignedEvmTransactionPayload;
}

export class EvmVenueProvider implements CrossChainVenueProvider {
  readonly chainType = "evm" as const;
  readonly chainId: EvmChainId;

  constructor(chainId: EvmChainId) {
    this.chainId = chainId;
  }

  validateAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/u.test(address);
  }

  buildUnsignedTrade(params: {
    to: string;
    amountWei: string;
    callData?: string;
    nonce: number;
    maxFeePerGasWei: string;
    maxPriorityFeePerGasWei: string;
    gasLimit: string;
  }): UnsignedEvmTransactionPayload {
    if (!this.validateAddress(params.to)) throw new Error("Invalid EVM target address");
    if (!/^(0|[1-9]\d*)$/u.test(params.amountWei)) throw new Error("Invalid EVM value amount");
    if (!/^(0|[1-9]\d*)$/u.test(params.maxFeePerGasWei)) throw new Error("Invalid EVM max fee per gas");
    if (!/^(0|[1-9]\d*)$/u.test(params.maxPriorityFeePerGasWei)) throw new Error("Invalid EVM priority fee per gas");
    if (!/^(0|[1-9]\d*)$/u.test(params.gasLimit)) throw new Error("Invalid EVM gas limit");
    if (!Number.isInteger(params.nonce) || params.nonce < 0) throw new Error("Invalid EVM nonce");

    const data = params.callData ?? "0x";
    if (!/^0x([a-fA-F0-9]{2})*$/u.test(data)) throw new Error("Invalid EVM call data format");

    return {
      to: params.to,
      value: params.amountWei,
      data,
      chainId: this.chainId,
      nonce: params.nonce,
      maxFeePerGas: params.maxFeePerGasWei,
      maxPriorityFeePerGas: params.maxPriorityFeePerGasWei,
      gasLimit: params.gasLimit,
    };
  }
}
