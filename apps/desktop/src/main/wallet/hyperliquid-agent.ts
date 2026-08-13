import { randomBytes } from "node:crypto";

import { bytesToHex, hexToBytes } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

type SecretStore = {
  isLocked(): boolean;
  getSecret(name: "hyperliquid-agent-secret"): Promise<string | null>;
  setSecret(name: "hyperliquid-agent-secret", plaintext: string): Promise<void>;
};

export type HyperliquidAgentSummary = {
  accountAddress: `0x${string}`;
  agentAddress: `0x${string}`;
  approvedAt: string;
};

type StoredAgent = HyperliquidAgentSummary & {
  version: 1;
  privateKey: `0x${string}`;
};

/**
 * Venue-isolated Hyperliquid API wallet.
 *
 * The account address owns the Hyperliquid portfolio. The encrypted agent key
 * only signs Hyperliquid L1 actions after the user has approved that API wallet
 * on Hyperliquid. It is never reused for Robinhood Chain or any other venue.
 */
export class HyperliquidAgentWalletService {
  readonly #secrets: SecretStore;

  constructor(secrets: SecretStore) {
    this.#secrets = secrets;
  }

  async get(): Promise<HyperliquidAgentSummary | null> {
    this.#assertUnlocked();
    const value = await this.#load();
    return value === null ? null : {
      accountAddress: value.accountAddress,
      agentAddress: value.agentAddress,
      approvedAt: value.approvedAt,
    };
  }

  async create(accountAddress: string, approvedAt: string): Promise<HyperliquidAgentSummary & { privateKey: `0x${string}` }> {
    const privateKey = bytesToHex(randomBytes(32));
    const summary = await this.#persist(accountAddress, privateKey, approvedAt);
    return { ...summary, privateKey };
  }

  async import(accountAddress: string, privateKey: string, approvedAt: string): Promise<HyperliquidAgentSummary> {
    const normalized = normalizePrivateKey(privateKey);
    return this.#persist(accountAddress, normalized, approvedAt);
  }

  async withSigner<T>(operation: (signer: PrivateKeyAccount, summary: HyperliquidAgentSummary) => Promise<T>): Promise<T> {
    this.#assertUnlocked();
    const stored = await this.#load();
    if (stored === null) throw new Error("Hyperliquid API wallet is not configured.");
    const bytes = hexToBytes(stored.privateKey);
    try {
      const signer = privateKeyToAccount(bytesToHex(bytes));
      return await operation(signer, {
        accountAddress: stored.accountAddress,
        agentAddress: stored.agentAddress,
        approvedAt: stored.approvedAt,
      });
    } finally {
      bytes.fill(0);
    }
  }

  async #persist(accountAddress: string, privateKey: `0x${string}`, approvedAt: string): Promise<HyperliquidAgentSummary> {
    this.#assertUnlocked();
    const account = normalizeAddress(accountAddress, "Hyperliquid account address");
    const timestamp = new Date(approvedAt);
    if (!Number.isFinite(timestamp.getTime()) || timestamp.getTime() > Date.now() + 60_000) {
      throw new Error("Hyperliquid API-wallet approval timestamp is invalid.");
    }
    const agentAddress = privateKeyToAccount(privateKey).address;
    const stored: StoredAgent = {
      version: 1,
      accountAddress: account,
      agentAddress,
      approvedAt: timestamp.toISOString(),
      privateKey,
    };
    await this.#secrets.setSecret("hyperliquid-agent-secret", JSON.stringify(stored));
    return { accountAddress: account, agentAddress, approvedAt: stored.approvedAt };
  }

  async #load(): Promise<StoredAgent | null> {
    const encoded = await this.#secrets.getSecret("hyperliquid-agent-secret");
    if (encoded === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(encoded);
    } catch {
      throw new Error("Hyperliquid API-wallet secret is invalid.");
    }
    if (typeof parsed !== "object" || parsed === null) throw new Error("Hyperliquid API-wallet secret is invalid.");
    const value = parsed as Partial<StoredAgent>;
    if (
      value.version !== 1
      || typeof value.accountAddress !== "string"
      || typeof value.agentAddress !== "string"
      || typeof value.privateKey !== "string"
      || typeof value.approvedAt !== "string"
    ) throw new Error("Hyperliquid API-wallet secret is invalid.");
    const privateKey = normalizePrivateKey(value.privateKey);
    const signer = privateKeyToAccount(privateKey);
    if (signer.address.toLowerCase() !== value.agentAddress.toLowerCase()) {
      throw new Error("Hyperliquid API-wallet integrity check failed.");
    }
    return {
      version: 1,
      accountAddress: normalizeAddress(value.accountAddress, "Hyperliquid account address"),
      agentAddress: normalizeAddress(value.agentAddress, "Hyperliquid agent address"),
      approvedAt: new Date(value.approvedAt).toISOString(),
      privateKey,
    };
  }

  #assertUnlocked(): void {
    if (this.#secrets.isLocked()) throw new Error("Vault is locked");
  }
}

function normalizePrivateKey(value: string): `0x${string}` {
  const normalized = value.trim().startsWith("0x") ? value.trim() : `0x${value.trim()}`;
  if (!/^0x[0-9a-fA-F]{64}$/u.test(normalized)) {
    throw new Error("Hyperliquid API-wallet key must be a 32-byte hexadecimal private key.");
  }
  return normalized as `0x${string}`;
}

function normalizeAddress(value: string, label: string): `0x${string}` {
  const normalized = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/u.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized.toLowerCase() as `0x${string}`;
}
