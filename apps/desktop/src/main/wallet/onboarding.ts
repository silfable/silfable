import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getBase58Encoder,
  type KeyPairSigner,
} from "@solana/kit";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "bip39";
import HDKey from "micro-key-producer/slip10.js";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { Keypair } from "@solana/web3.js";

import { MAINNET_PROFILE_ID, type EncryptedWalletMetadata } from "../storage/database.js";

const DERIVATION_PATH = "m/44'/501'/0'/0'" as const;
const PROFILE_ID = MAINNET_PROFILE_ID;
const DATA_KEY_ID = "local-data-key-v1";
const MAX_WALLETS = 20;

type SecretStore = {
  isLocked(): boolean;
  getSecret(name: "database-data-key" | "wallet-secret"): Promise<string | null>;
  setSecret(name: "wallet-secret" | "database-data-key", plaintext: string): Promise<void>;
  deleteSecret(name: "wallet-secret"): Promise<void>;
};

type WalletMetadataStore = {
  hasWallet(profileId: typeof PROFILE_ID): boolean;
  getWallet(profileId: typeof PROFILE_ID): EncryptedWalletMetadata | null;
  insertWallet(metadata: EncryptedWalletMetadata): void;
};

export class WalletOnboardingService {
  readonly #keystore: SecretStore;
  readonly #database: WalletMetadataStore;

  constructor(keystore: SecretStore, database: WalletMetadataStore) {
    this.#keystore = keystore;
    this.#database = database;
  }

  async createWallet(): Promise<{ address: string; recoveryMnemonic: string; derivationPath: typeof DERIVATION_PATH }> {
    this.#assertCanOnboard();
    const recoveryMnemonic = generateMnemonic(256);
    const privateKey = deriveMnemonicPrivateKey(recoveryMnemonic);
    const address = await this.#persistPrivateKey(privateKey);
    return { address, recoveryMnemonic, derivationPath: DERIVATION_PATH };
  }

  async importMnemonic(mnemonic: string): Promise<{ address: string }> {
    this.#assertCanOnboard();
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized)) throw new Error("Mnemonic is invalid");
    return { address: await this.#persistPrivateKey(deriveMnemonicPrivateKey(normalized)) };
  }

  async importPrivateKey(serialized: string): Promise<{ address: string }> {
    this.#assertCanOnboard();
    return { address: await this.#persistPrivateKey(parsePrivateKey(serialized)) };
  }

  async listWallets(): Promise<Array<{ address: string; primary: boolean }>> {
    if (this.#keystore.isLocked()) throw new Error("Keystore is locked");
    const serialized = await this.#keystore.getSecret("wallet-secret");
    if (serialized === null) return [];
    const privateKeys = parseStoredWalletSecrets(serialized);
    try {
      const wallets: Array<{ address: string; primary: boolean }> = [];
      for (const [index, privateKey] of privateKeys.entries()) {
        const signer = privateKey.length === 32
          ? await createKeyPairSignerFromPrivateKeyBytes(privateKey)
          : await createKeyPairSignerFromBytes(privateKey);
        wallets.push({ address: signer.address, primary: index === 0 });
      }
      const primary = wallets[0];
      if (primary !== undefined && !this.#database.hasWallet(PROFILE_ID)) {
        this.#database.insertWallet({
          id: randomUUID(),
          profileId: PROFILE_ID,
          ...(await this.#encryptAddress(primary.address)),
          createdAt: new Date().toISOString(),
        });
      }
      return wallets;
    } finally {
      for (const privateKey of privateKeys) privateKey.fill(0);
    }
  }

  async getWalletAddress(): Promise<string> {
    if (this.#keystore.isLocked()) throw new Error("Keystore is locked");
    const metadata = this.#database.getWallet(PROFILE_ID);
    if (metadata === null) throw new Error("Mainnet wallet is not configured");
    if (metadata.keyId !== DATA_KEY_ID) throw new Error("Wallet metadata key is unsupported");

    const dataKey = await this.#getOrCreateDataKey();
    try {
      const nonce = Buffer.from(metadata.nonce, "base64");
      const payload = Buffer.from(metadata.ciphertext, "base64");
      if (nonce.length !== 12 || payload.length <= 16) throw new Error("Wallet metadata is invalid");
      const authTag = payload.subarray(payload.length - 16);
      const ciphertext = payload.subarray(0, payload.length - 16);
      const decipher = createDecipheriv("aes-256-gcm", dataKey, nonce);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } finally {
      dataKey.fill(0);
    }
  }

  async withWalletSigner<T>(address: string, operation: (signer: KeyPairSigner) => Promise<T>): Promise<T> {
    if (this.#keystore.isLocked()) throw new Error("Keystore is locked");
    if (!this.#database.hasWallet(PROFILE_ID)) throw new Error("Mainnet wallet is not configured");
    const serialized = await this.#keystore.getSecret("wallet-secret");
    if (serialized === null) throw new Error("Wallet secret is unavailable");
    const privateKeys = parseStoredWalletSecrets(serialized);
    try {
      for (const privateKey of privateKeys) {
        const signer = privateKey.length === 32
          ? await createKeyPairSignerFromPrivateKeyBytes(privateKey)
          : await createKeyPairSignerFromBytes(privateKey);
        if (signer.address === address) return await operation(signer);
      }
      throw new Error("Selected wallet secret is unavailable");
    } finally {
      for (const storedKey of privateKeys) storedKey.fill(0);
    }
  }

  async withWalletWeb3Keypair<T>(address: string, operation: (keypair: Keypair) => Promise<T>): Promise<T> {
    if (this.#keystore.isLocked()) throw new Error("Keystore is locked");
    if (!this.#database.hasWallet(PROFILE_ID)) throw new Error("Mainnet wallet is not configured");
    const serialized = await this.#keystore.getSecret("wallet-secret");
    if (serialized === null) throw new Error("Wallet secret is unavailable");
    const privateKeys = parseStoredWalletSecrets(serialized);
    try {
      for (const privateKey of privateKeys) {
        const keypair = privateKey.length === 32
          ? Keypair.fromSeed(privateKey)
          : Keypair.fromSecretKey(privateKey);
        if (keypair.publicKey.toBase58() === address) return await operation(keypair);
      }
      throw new Error("Selected wallet secret is unavailable");
    } finally {
      for (const storedKey of privateKeys) storedKey.fill(0);
    }
  }

  #assertCanOnboard(): void {
    if (this.#keystore.isLocked()) throw new Error("Keystore must be unlocked before wallet onboarding");
  }

  async #persistPrivateKey(privateKey: Uint8Array): Promise<string> {
    try {
      const signer =
        privateKey.length === 32
          ? await createKeyPairSignerFromPrivateKeyBytes(privateKey)
          : await createKeyPairSignerFromBytes(privateKey);
      const address = signer.address;
      const existingSerialized = await this.#keystore.getSecret("wallet-secret");
      const existingKeys = existingSerialized === null ? [] : parseStoredWalletSecrets(existingSerialized);
      try {
        if (existingKeys.length >= MAX_WALLETS) throw new Error(`A maximum of ${MAX_WALLETS} wallets is supported`);
        for (const existingKey of existingKeys) {
          const existingSigner = existingKey.length === 32
            ? await createKeyPairSignerFromPrivateKeyBytes(existingKey)
            : await createKeyPairSignerFromBytes(existingKey);
          if (existingSigner.address === address) throw new Error("This wallet is already configured");
        }
        const encodedKeys = [...existingKeys.map((key) => Buffer.from(key).toString("base64")), Buffer.from(privateKey).toString("base64")];
        await this.#keystore.setSecret("wallet-secret", JSON.stringify({ version: 2, encoding: "base64", wallets: encodedKeys }));
        if (this.#database.hasWallet(PROFILE_ID)) return address;

        const encryptedAddress = await this.#encryptAddress(address);
        this.#database.insertWallet({
          id: randomUUID(),
          profileId: PROFILE_ID,
          ...encryptedAddress,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        if (existingSerialized === null) await this.#keystore.deleteSecret("wallet-secret");
        else await this.#keystore.setSecret("wallet-secret", existingSerialized);
        throw error;
      } finally {
        for (const existingKey of existingKeys) existingKey.fill(0);
      }

      return address;
    } finally {
      privateKey.fill(0);
    }
  }

  async #encryptAddress(address: string): Promise<Pick<EncryptedWalletMetadata, "ciphertext" | "nonce" | "keyId">> {
    const dataKey = await this.#getOrCreateDataKey();
    try {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", dataKey, nonce);
      const ciphertext = Buffer.concat([cipher.update(address, "utf8"), cipher.final(), cipher.getAuthTag()]);
      return {
        ciphertext: ciphertext.toString("base64"),
        nonce: nonce.toString("base64"),
        keyId: DATA_KEY_ID,
      };
    } finally {
      dataKey.fill(0);
    }
  }

  async #getOrCreateDataKey(): Promise<Buffer> {
    const stored = await this.#keystore.getSecret("database-data-key");
    if (stored !== null) {
      const key = Buffer.from(stored, "base64");
      if (key.length !== 32) throw new Error("Database data key is invalid");
      return key;
    }

    const key = randomBytes(32);
    await this.#keystore.setSecret("database-data-key", key.toString("base64"));
    return key;
  }
}

function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/u).join(" ");
}

function deriveMnemonicPrivateKey(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic);
  try {
    const child = HDKey.fromMasterSeed(seed).derive(DERIVATION_PATH);
    return Uint8Array.from(child.privateKey);
  } finally {
    seed.fill(0);
  }
}

function parsePrivateKey(serialized: string): Uint8Array {
  const value = serialized.trim();
  let bytes: Uint8Array;
  if (value.startsWith("[")) {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
      throw new Error("Private key JSON must be an array of bytes");
    }
    bytes = Uint8Array.from(parsed);
  } else {
    bytes = Uint8Array.from(getBase58Encoder().encode(value));
  }

  if (bytes.length !== 32 && bytes.length !== 64) {
    bytes.fill(0);
    throw new Error("Private key must contain 32 or 64 bytes");
  }
  return bytes;
}

function parseStoredWalletSecrets(serialized: string): Uint8Array[] {
  const parsed: unknown = JSON.parse(serialized);
  if (typeof parsed !== "object" || parsed === null) throw new Error("Wallet secret is invalid");
  const value = parsed as { version?: unknown; encoding?: unknown; bytes?: unknown; wallets?: unknown };
  if (value.encoding !== "base64") {
    throw new Error("Wallet secret is unsupported");
  }
  const encoded = value.version === 1 && typeof value.bytes === "string"
    ? [value.bytes]
    : value.version === 2 && Array.isArray(value.wallets) && value.wallets.every((item) => typeof item === "string")
      ? value.wallets
      : null;
  if (encoded === null || encoded.length === 0 || encoded.length > MAX_WALLETS) throw new Error("Wallet secret is unsupported");
  const keys = encoded.map((item) => Uint8Array.from(Buffer.from(item, "base64")));
  if (keys.some((bytes) => bytes.length !== 32 && bytes.length !== 64)) {
    for (const bytes of keys) bytes.fill(0);
    throw new Error("Wallet secret length is invalid");
  }
  return keys;
}
