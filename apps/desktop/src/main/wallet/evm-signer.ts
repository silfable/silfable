import { privateKeyToAccount, mnemonicToAccount } from "viem/accounts";
import { bytesToHex, keccak256, type Hex } from "viem";
import { validateMnemonic } from "bip39";

export const EVM_DERIVATION_PATH = "m/44'/60'/0'/0/0" as const;

export const ROBINHOOD_CHAIN_CONFIG = {
  chainId: 4663,
  name: "Robinhood Chain",
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com/",
  currencySymbol: "ETH",
} as const;

export type EvmAddress = `0x${string}`;

export type EvmTransactionRequest = {
  to: EvmAddress;
  value: bigint;
  data?: Hex;
  nonce: number;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  chainId: number;
};

/**
 * Derives an Ethereum public address (0x...) from a 32-byte private key using Viem.
 */
export function privateKeyToEvmAddress(privateKey: Uint8Array): EvmAddress {
  if (privateKey.length !== 32) {
    throw new Error("EVM private key must be exactly 32 bytes");
  }
  const hexPk = bytesToHex(privateKey);
  const account = privateKeyToAccount(hexPk);
  return account.address;
}

export class EvmSignerService {
  readonly #account: ReturnType<typeof privateKeyToAccount>;

  constructor(privateKey: Uint8Array) {
    if (privateKey.length !== 32) {
      throw new Error("EVM private key must be exactly 32 bytes");
    }
    const hexPk = bytesToHex(privateKey);
    this.#account = privateKeyToAccount(hexPk);
  }

  static fromMnemonic(mnemonic: string, path: string = EVM_DERIVATION_PATH): EvmSignerService {
    if (!validateMnemonic(mnemonic)) {
      throw new Error("Invalid BIP-39 mnemonic");
    }
    const account = mnemonicToAccount(mnemonic, { path: path as `m/44'/60'/${string}` });
    const pkBytes = Buffer.from(account.getHdKey().privateKey!);
    return new EvmSignerService(pkBytes);
  }

  getAddress(): EvmAddress {
    return this.#account.address;
  }

  /**
   * Signs an EVM personal message (EIP-191) using real secp256k1 ECDSA
   */
  async signMessage(message: string): Promise<{ address: EvmAddress; signature: Hex }> {
    const signature = await this.#account.signMessage({ message });
    return {
      address: this.#account.address,
      signature,
    };
  }

  /**
   * Prepares a signed EVM EIP-1559 transaction payload
   */
  async signTransaction(tx: EvmTransactionRequest): Promise<{ rawTransaction: Hex; txHash: Hex }> {
    const serializedTx = await this.#account.signTransaction({
      type: "eip1559",
      to: tx.to,
      value: tx.value,
      data: tx.data ?? "0x",
      nonce: tx.nonce,
      gas: tx.gasLimit,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      chainId: tx.chainId,
    });

    return {
      rawTransaction: serializedTx,
      txHash: keccak256(serializedTx),
    };
  }
}
