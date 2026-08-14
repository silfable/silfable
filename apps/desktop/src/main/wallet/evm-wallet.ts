import { generateMnemonic, validateMnemonic } from "bip39";

import { bytesToHex, hexToBytes } from "viem";

import { EVM_DERIVATION_PATH, EvmSignerService, type EvmAddress } from "./evm-signer.js";

const MAX_EVM_WALLETS = 20;

type StoredEvmWallet =
  | { kind: "mnemonic"; value: string }
  | { kind: "private-key"; value: `0x${string}` };

type SecretStore = {
  isLocked(): boolean;
  getSecret(name: "evm-wallet-secret"): Promise<string | null>;
  setSecret(name: "evm-wallet-secret", plaintext: string): Promise<void>;
};

/** Local-only EVM wallet for Robinhood Chain. It deliberately has no broadcast method. */
export class EvmWalletService {
  readonly #secrets: SecretStore;

  constructor(secrets: SecretStore) {
    this.#secrets = secrets;
  }

  async listWallets(): Promise<Array<{ address: EvmAddress; primary: boolean }>> {
    this.#assertUnlocked();
    const stored = await this.#loadWallets();
    return stored.map((wallet, index) => ({
      address: this.#toSigner(wallet).getAddress(),
      primary: index === 0,
    }));
  }

  async getAddress(): Promise<EvmAddress | null> {
    const wallet = (await this.listWallets())[0];
    return wallet?.address ?? null;
  }

  async createWallet(): Promise<{ address: EvmAddress; recoveryMnemonic: string; derivationPath: typeof EVM_DERIVATION_PATH }> {
    this.#assertUnlocked();
    const recoveryMnemonic = generateMnemonic(256);
    const address = await this.#persistWallet({ kind: "mnemonic", value: recoveryMnemonic });
    return { address, recoveryMnemonic, derivationPath: EVM_DERIVATION_PATH };
  }

  async importMnemonic(mnemonic: string): Promise<{ address: EvmAddress }> {
    this.#assertUnlocked();
    const normalized = mnemonic.trim().toLowerCase().replace(/\s+/gu, " ");
    if (!validateMnemonic(normalized)) throw new Error("EVM recovery phrase is invalid");
    return { address: await this.#persistWallet({ kind: "mnemonic", value: normalized }) };
  }

  async importPrivateKey(privateKey: string): Promise<{ address: EvmAddress }> {
    this.#assertUnlocked();
    const normalized = privateKey.trim().startsWith("0x")
      ? privateKey.trim()
      : `0x${privateKey.trim()}`;
    const bytes = hexToBytes(normalized as `0x${string}`);
    try {
      if (bytes.length !== 32) throw new Error("EVM private key must be exactly 32 bytes");
      return { address: await this.#persistWallet({ kind: "private-key", value: bytesToHex(bytes) }) };
    } finally {
      bytes.fill(0);
    }
  }

  async withSigner<T>(operation: (signer: EvmSignerService) => Promise<T>): Promise<T> {
    this.#assertUnlocked();
    const wallet = (await this.#loadWallets())[0];
    if (wallet === undefined) throw new Error("Robinhood EVM wallet is not configured");
    return await operation(this.#toSigner(wallet));
  }

  async hasAddress(address: string): Promise<boolean> {
    this.#assertUnlocked();
    return (await this.#loadWallets()).some(
      (wallet) => this.#toSigner(wallet).getAddress().toLowerCase() === address.toLowerCase(),
    );
  }

  async withSignerForAddress<T>(
    address: string,
    operation: (signer: EvmSignerService) => Promise<T>,
  ): Promise<T> {
    this.#assertUnlocked();
    const wallet = (await this.#loadWallets()).find(
      (entry) => this.#toSigner(entry).getAddress().toLowerCase() === address.toLowerCase(),
    );
    if (wallet === undefined) throw new Error("Selected EVM wallet is not registered in the encrypted vault");
    return await operation(this.#toSigner(wallet));
  }

  async #persistWallet(wallet: StoredEvmWallet): Promise<EvmAddress> {
    const address = this.#toSigner(wallet).getAddress();
    const existing = await this.#loadWallets();
    if (existing.length >= MAX_EVM_WALLETS) throw new Error(`A maximum of ${MAX_EVM_WALLETS} EVM wallets is supported`);
    if (existing.some((entry) => this.#toSigner(entry).getAddress().toLowerCase() === address.toLowerCase())) {
      throw new Error("This EVM wallet is already configured");
    }
    await this.#secrets.setSecret("evm-wallet-secret", JSON.stringify({ version: 2, wallets: [...existing, wallet] }));
    return address;
  }

  async #loadWallets(): Promise<StoredEvmWallet[]> {
    const serialized = await this.#secrets.getSecret("evm-wallet-secret");
    if (serialized === null) return [];
    // Version 1 was a single mnemonic string. It remains readable so a vault
    // upgrade never loses access to an existing EVM account.
    if (validateMnemonic(serialized.trim().toLowerCase().replace(/\s+/gu, " "))) {
      return [{ kind: "mnemonic", value: serialized.trim().toLowerCase().replace(/\s+/gu, " ") }];
    }
    let parsed: unknown;
    try { parsed = JSON.parse(serialized); } catch { throw new Error("EVM wallet secret is invalid"); }
    if (typeof parsed !== "object" || parsed === null) throw new Error("EVM wallet secret is invalid");
    const value = parsed as { version?: unknown; wallets?: unknown };
    if (value.version !== 2 || !Array.isArray(value.wallets) || value.wallets.length < 1 || value.wallets.length > MAX_EVM_WALLETS) {
      throw new Error("EVM wallet secret is unsupported");
    }
    const wallets = value.wallets as unknown[];
    if (!wallets.every((entry) => typeof entry === "object" && entry !== null
      && (((entry as StoredEvmWallet).kind === "mnemonic" && typeof (entry as StoredEvmWallet).value === "string" && validateMnemonic((entry as StoredEvmWallet).value))
        || ((entry as StoredEvmWallet).kind === "private-key" && typeof (entry as StoredEvmWallet).value === "string" && /^0x[0-9a-fA-F]{64}$/u.test((entry as StoredEvmWallet).value))))) {
      throw new Error("EVM wallet secret is invalid");
    }
    return wallets as StoredEvmWallet[];
  }

  #toSigner(wallet: StoredEvmWallet): EvmSignerService {
    if (wallet.kind === "mnemonic") return EvmSignerService.fromMnemonic(wallet.value);
    const privateKeyBytes = hexToBytes(wallet.value);
    try {
      return new EvmSignerService(privateKeyBytes);
    } finally {
      privateKeyBytes.fill(0);
    }
  }

  #assertUnlocked(): void {
    if (this.#secrets.isLocked()) throw new Error("Vault is locked");
  }
}
