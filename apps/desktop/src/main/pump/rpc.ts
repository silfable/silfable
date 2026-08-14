import { ProviderRateBudget } from "../integrations/provider-rate-budget.js";
import { writeSafeAuditLog } from "../telemetry/safe-audit-log.js";
import type { PumpFinalizedAccount } from "./state.js";

const MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/u;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/u;
const MAX_ACCOUNT_BYTES = 65_536;

type Fetch = typeof fetch;
type Sleep = (delayMs: number) => Promise<void>;

export type PumpRpcAccount = PumpFinalizedAccount & { lamports: number };
export type PumpRpcSimulationAccount = { lamports: number; data: [string, "base64"] } | null;
export type PumpRpcInnerInstructionGroup = {
  index: number;
  instructions: Array<{ programIdIndex: number }>;
};

export class PumpMainnetRpc {
  #url: string;
  readonly #fetch: Fetch;
  readonly #sleep: Sleep;
  readonly #rateBudget: ProviderRateBudget;

  constructor(input: { rpcUrl?: string; fetch?: Fetch; sleep?: Sleep; rateBudget?: ProviderRateBudget } = {}) {
    this.#url = input.rpcUrl ?? MAINNET_RPC_URL;
    this.#fetch = input.fetch ?? fetch;
    this.#sleep = input.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.#rateBudget = input.rateBudget ?? new ProviderRateBudget({
      name: "Pump Solana RPC",
      limit: 240,
      windowMs: 60_000,
    });
    this.#validateUrl(this.#url);
  }

  #validateUrl(url: string): void {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("Pump Mainnet RPC must use HTTPS");
    if (parsed.username !== "" || parsed.password !== "") throw new Error("Pump Mainnet RPC URL cannot contain credentials");
  }

  updateRpcUrl(url?: string): void {
    const nextUrl = url || MAINNET_RPC_URL;
    this.#validateUrl(nextUrl);
    this.#url = nextUrl;
  }

  async getMultipleAccountsInfoAndContext(
    addresses: string[],
    config: { commitment: "finalized" },
  ): Promise<{ context: { slot: number }; value: Array<PumpRpcAccount | null> }> {
    if (addresses.length < 1 || addresses.length > 32 || addresses.some((value) => !ADDRESS_PATTERN.test(value))) {
      throw new Error("Pump RPC account request is invalid");
    }
    const result = contextValue(await this.#rpc("getMultipleAccounts", [addresses, { ...config, encoding: "base64" }]));
    if (!Array.isArray(result.value) || result.value.length !== addresses.length) throw new Error("Pump RPC returned incomplete account evidence");
    return { context: result.context, value: result.value.map(parseAccount) };
  }

  async getLatestBlockhashAndContext(config: {
    commitment: "finalized";
    minContextSlot: number;
  }): Promise<{ context: { slot: number }; value: { blockhash: string; lastValidBlockHeight: number } }> {
    if (!Number.isSafeInteger(config.minContextSlot) || config.minContextSlot < 1) throw new Error("Pump blockhash minimum slot is invalid");
    const result = contextValue(await this.#rpc("getLatestBlockhash", [config]));
    if (typeof result.value !== "object" || result.value === null) throw new Error("Pump RPC blockhash evidence is invalid");
    const value = result.value as { blockhash?: unknown; lastValidBlockHeight?: unknown };
    if (typeof value.blockhash !== "string" || !ADDRESS_PATTERN.test(value.blockhash)
      || !Number.isSafeInteger(value.lastValidBlockHeight) || (value.lastValidBlockHeight as number) < 1) {
      throw new Error("Pump RPC blockhash evidence is invalid");
    }
    return { context: result.context, value: { blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight as number } };
  }

  async getBalanceAndContext(
    walletAddress: string,
    config: { commitment: "finalized" },
  ): Promise<{ context: { slot: number }; value: string }> {
    if (!ADDRESS_PATTERN.test(walletAddress)) throw new Error("Pump wallet address is invalid");
    const result = contextValue(await this.#rpc("getBalance", [walletAddress, config]));
    if (!Number.isSafeInteger(result.value) || (result.value as number) < 0) throw new Error("Pump RPC wallet balance is invalid");
    return { context: result.context, value: String(result.value) };
  }

  async getBlockHeight(config: { commitment: "finalized" }): Promise<number> {
    const result = await this.#rpc("getBlockHeight", [config]);
    if (!Number.isSafeInteger(result) || (result as number) < 1) {
      throw new Error("Pump RPC block height is invalid");
    }
    return result as number;
  }

  async getFeeForMessage(
    messageBase64: string,
    config: { commitment: "confirmed" },
  ): Promise<{ context: { slot: number }; value: number | null }> {
    assertBase64(messageBase64, "transaction message", 2_048);
    const result = contextValue(await this.#rpc("getFeeForMessage", [messageBase64, config]));
    if (result.value !== null && (!Number.isSafeInteger(result.value) || (result.value as number) < 0)) {
      throw new Error("Pump RPC network fee is invalid");
    }
    return { context: result.context, value: result.value as number | null };
  }

  async simulateTransaction(
    transactionBase64: string,
    config: {
      commitment: "confirmed";
      sigVerify: false;
      replaceRecentBlockhash: false;
      innerInstructions: true;
      accounts: { encoding: "base64"; addresses: string[] };
    },
  ): Promise<{
    context: { slot: number };
    value: {
      err: unknown;
      logs: string[] | null;
      unitsConsumed?: number;
      accounts?: PumpRpcSimulationAccount[] | null;
      innerInstructions?: PumpRpcInnerInstructionGroup[] | null;
    };
  }> {
    assertBase64(transactionBase64, "unsigned transaction", 1_232);
    if (config.accounts.addresses.length > 32 || config.accounts.addresses.some((value) => !ADDRESS_PATTERN.test(value))) {
      throw new Error("Pump simulation account request is invalid");
    }
    const result = contextValue(await this.#rpc("simulateTransaction", [transactionBase64, { ...config, encoding: "base64" }]));
    if (typeof result.value !== "object" || result.value === null) throw new Error("Pump RPC simulation response is invalid");
    return { context: result.context, value: result.value as never };
  }

  async #rpc(method: string, params: unknown[]): Promise<unknown> {
    const isBroadcast = method === "sendTransaction";
    const maxRetries = isBroadcast ? 0 : 3;
    let delayMs = 500;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        try {
          this.#rateBudget.consume();
        } catch (error) {
          writeSafeAuditLog("provider_budget_blocked", {
            operation: "pump_solana_rpc_request",
            outcome: "blocked",
            code: "RATE_BUDGET",
          });
          throw error;
        }
        const response = await this.#fetch(this.#url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
          signal: AbortSignal.timeout(15_000),
        });
        const body: unknown = await response.json();
        if (!response.ok || typeof body !== "object" || body === null) {
          if (attempt < maxRetries && (response.status === 429 || response.status >= 500)) {
            await this.#sleep(delayMs);
            delayMs *= 2;
            continue;
          }
          throw new Error(`Pump Mainnet RPC failed (${response.status})`);
        }
        const envelope = body as { result?: unknown; error?: unknown };
        if (envelope.error !== undefined || envelope.result === undefined) throw new Error("Pump Mainnet RPC returned an error");
        return envelope.result;
      } catch (err) {
        if (attempt < maxRetries && err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError" || err.message.includes("fetch failed"))) {
          await this.#sleep(delayMs);
          delayMs *= 2;
          continue;
        }
        throw err;
      }
    }
    throw new Error("Pump Mainnet RPC failed after retries");
  }

  async sendTransaction(
    signedTransactionBase64: string,
    config: { encoding: "base64"; skipPreflight?: boolean; maxRetries?: number } = { encoding: "base64" },
  ): Promise<string> {
    assertBase64(signedTransactionBase64, "signed transaction", 1_232);
    const result = await this.#rpc("sendTransaction", [signedTransactionBase64, config]);
    if (typeof result !== "string" || !SIGNATURE_PATTERN.test(result)) {
      throw new Error("Pump RPC sendTransaction signature is invalid");
    }
    return result;
  }
}


function contextValue(body: unknown): { context: { slot: number }; value: unknown } {
  if (typeof body !== "object" || body === null) throw new Error("Pump RPC context is invalid");
  const result = body as { context?: { slot?: unknown }; value?: unknown };
  if (!Number.isSafeInteger(result.context?.slot) || (result.context?.slot as number) < 1 || !("value" in result)) {
    throw new Error("Pump RPC context is invalid");
  }
  return { context: { slot: result.context!.slot as number }, value: result.value };
}

function parseAccount(value: unknown): PumpRpcAccount | null {
  if (value === null) return null;
  if (typeof value !== "object" || value === null) throw new Error("Pump RPC account evidence is invalid");
  const account = value as { lamports?: unknown; owner?: unknown; data?: unknown };
  if (!Number.isSafeInteger(account.lamports) || (account.lamports as number) < 0
    || typeof account.owner !== "string" || !ADDRESS_PATTERN.test(account.owner)
    || !Array.isArray(account.data) || account.data.length !== 2 || account.data[1] !== "base64"
    || typeof account.data[0] !== "string") throw new Error("Pump RPC account evidence is invalid");
  const data = decodeBase64(account.data[0], "account data", MAX_ACCOUNT_BYTES, true);
  return { lamports: account.lamports as number, owner: account.owner, data };
}

function assertBase64(value: string, label: string, maxBytes: number): void {
  decodeBase64(value, label, maxBytes);
}

function decodeBase64(value: string, label: string, maxBytes: number, allowEmpty = false): Uint8Array {
  if ((!allowEmpty && value.length === 0) || value.length > Math.ceil(maxBytes / 3) * 4 + 4 || !BASE64_PATTERN.test(value)) {
    throw new Error(`Pump RPC ${label} is invalid`);
  }
  const decoded = Buffer.from(value, "base64");
  if ((!allowEmpty && decoded.length === 0) || decoded.length > maxBytes) throw new Error(`Pump RPC ${label} is invalid`);
  return decoded;
}
