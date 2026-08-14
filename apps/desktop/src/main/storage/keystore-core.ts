import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type SecretName =
  | "wallet-secret"
  | "evm-wallet-secret"
  | "openai-api-key"
  | "anthropic-api-key"
  | "openrouter-api-key"
  | "jupiter-api-key"
  | "uniswap-api-key"
  | "tavily-api-key"
  | "zeroex-api-key"
  | "solana-rpc-url"
  | "ethereum-rpc-url"
  | "base-rpc-url"
  | "arbitrum-rpc-url"
  | "optimism-rpc-url"
  | "polygon-rpc-url"
  | "bsc-rpc-url"
  | "avalanche-rpc-url"
  | "robinhood-rpc-url"
  | "r2-access-key-id"
  | "r2-secret-access-key"
  | "database-data-key"
  | "session-data-key"
  | "pump-risk-ledger-key"
  | "pump-receipt-store-key"
  | "robinhood-receipt-store-key"
  | "evm-receipt-store-key"
  | "evm-bridge-receipt-store-key"
  | "mission-runtime-store-key"
  | "portfolio-history-store-key"
  | "full-access-store-key"
  | "hyperliquid-agent-secret";

type KeystoreFileV1 = {
  version: 1;
  records: Partial<Record<string, string>>;
};

export type SecureStoragePort = {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): string;
  encryptString(plaintext: string): Buffer;
  decryptString(encrypted: Buffer): string;
};

const SECRET_NAMES = new Set<string>([
  "wallet-secret",
  "evm-wallet-secret",
  "openai-api-key",
  "anthropic-api-key",
  "openrouter-api-key",
  "jupiter-api-key",
  "uniswap-api-key",
  "tavily-api-key",
  "zeroex-api-key",
  "solana-rpc-url",
  "ethereum-rpc-url",
  "base-rpc-url",
  "arbitrum-rpc-url",
  "optimism-rpc-url",
  "polygon-rpc-url",
  "bsc-rpc-url",
  "avalanche-rpc-url",
  "robinhood-rpc-url",
  "r2-access-key-id",
  "r2-secret-access-key",
  "database-data-key",
  "session-data-key",
  "pump-risk-ledger-key",
  "pump-receipt-store-key",
  "robinhood-receipt-store-key",
  "evm-receipt-store-key",
  "evm-bridge-receipt-store-key",
  "mission-runtime-store-key",
  "portfolio-history-store-key",
  "full-access-store-key",
  "hyperliquid-agent-secret",
]);
const MAX_KEYSTORE_BYTES = 1024 * 1024;

export class PortableEncryptedKeystore {
  readonly #path: string;
  readonly #storage: SecureStoragePort;
  #locked = true;
  #mutationTail: Promise<void> = Promise.resolve();

  constructor(path: string, storage: SecureStoragePort) {
    this.#path = path;
    this.#storage = storage;
  }

  isLocked(): boolean {
    return this.#locked;
  }

  unlock(): void {
    assertSecureStorageBackend(this.#storage);
    this.#locked = false;
  }

  lock(): void {
    this.#locked = true;
  }

  async backupAndReset(directory: string): Promise<boolean> {
    if (!this.#locked) throw new Error("Lock the keystore before resetting it");
    await this.#mutationTail;
    try {
      await stat(this.#path);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await rename(this.#path, join(directory, "secrets.v1.json"));
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return false;
      throw error;
    }
  }

  async setSecret(name: SecretName, plaintext: string): Promise<void> {
    this.#assertUnlocked();
    if (plaintext.length === 0) throw new Error("Secret cannot be empty");
    return this.#enqueueMutation(async () => {
      this.#assertUnlocked();
      const file = await this.#readFile();
      file.records[name] = this.#storage.encryptString(plaintext).toString("base64");
      await this.#writeFile(file);
    });
  }

  async getSecret(name: SecretName): Promise<string | null> {
    this.#assertUnlocked();
    const encrypted = (await this.#readFile()).records[name];
    return encrypted === undefined ? null : this.#storage.decryptString(Buffer.from(encrypted, "base64"));
  }

  async deleteSecret(name: SecretName): Promise<void> {
    this.#assertUnlocked();
    return this.#enqueueMutation(async () => {
      this.#assertUnlocked();
      const file = await this.#readFile();
      delete file.records[name];
      await this.#writeFile(file);
    });
  }

  #enqueueMutation(operation: () => Promise<void>): Promise<void> {
    const result = this.#mutationTail.then(operation, operation);
    this.#mutationTail = result.catch(() => undefined);
    return result;
  }

  #assertUnlocked(): void {
    if (this.#locked) throw new Error("Keystore is locked");
    assertSecureStorageBackend(this.#storage);
  }

  async #readFile(): Promise<KeystoreFileV1> {
    try {
      if ((await stat(this.#path)).size > MAX_KEYSTORE_BYTES) throw new Error("Keystore file exceeds the size limit");
      const parsed: unknown = JSON.parse(await readFile(this.#path, "utf8"));
      if (!isKeystoreFile(parsed)) throw new Error("Keystore file is invalid");
      return parsed;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return { version: 1, records: {} };
      throw error;
    }
  }

  async #writeFile(file: KeystoreFileV1): Promise<void> {
    const directory = dirname(this.#path);
    const temporaryPath = `${this.#path}.tmp`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, JSON.stringify(file), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.#path);
  }
}

export function assertSecureStorageBackend(storage: SecureStoragePort, platform = process.platform): void {
  if (!storage.isEncryptionAvailable()) throw new Error("OS-backed encryption is unavailable");
  if (platform === "linux" && storage.getSelectedStorageBackend() === "basic_text") {
    throw new Error("Refusing Electron basic_text secret storage backend");
  }
}

function isKeystoreFile(value: unknown): value is KeystoreFileV1 {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { version?: unknown; records?: unknown };
  if (candidate.version !== 1 || typeof candidate.records !== "object" || candidate.records === null) return false;
  return Object.entries(candidate.records).every(([name, record]) =>
    SECRET_NAMES.has(name as SecretName) &&
    typeof record === "string" &&
    record.length > 0 &&
    record.length <= MAX_KEYSTORE_BYTES &&
    isCanonicalBase64(record),
  );
}

function isCanonicalBase64(value: string): boolean {
  try {
    return Buffer.from(value, "base64").toString("base64") === value;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
