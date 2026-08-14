import { createSignableMessage, getBase58Decoder, type KeyPairSigner } from "@solana/kit";

const BASE_URL = "https://api.jup.ag/trigger/v2";
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const RAW_AMOUNT_PATTERN = /^[1-9]\d*$/u;

type Fetch = typeof globalThis.fetch;
type Sleep = (delayMs: number) => Promise<void>;
type SecretReader = { getSecret(name: "jupiter-api-key"): Promise<string | null> };
type WalletSigner = { withWalletSigner<T>(address: string, operation: (signer: KeyPairSigner) => Promise<T>): Promise<T> };

export type TriggerVault = { userPubkey: string; vaultPubkey: string; privyVaultId: string };
export type TriggerDeposit = { transaction: string; requestId: string; receiverAddress: string; mint: string; amount: string; tokenDecimals: number; inputTokenAccount: string };
export type TriggerSingleOrderInput = {
  depositRequestId: string; depositSignedTx: string; userPubkey: string; inputMint: string; inputAmount: string; outputMint: string;
  triggerMint: string; triggerCondition: "above" | "below"; triggerPriceUsd: number; slippageBps: number; expiresAt: number;
};
export type TriggerOrder = { id: string; txSignature: string; depositConfirmed: boolean };
export type TriggerCancelDraft = { id: string; transaction: string; requestId: string };
export type TriggerOrderHistoryItem = { id: string; orderState: "pending" | "open" | "executing" | "filled" | "pending_withdraw" | "cancelled" | "expired" | "failed"; userPubkey: string; inputMint: string; outputMint: string; initialInputAmount: string; remainingInputAmount: string; triggerMint: string; triggerCondition: "above" | "below"; triggerPriceUsd: number; slippageBps: number; expiresAt: number; createdAt: number; updatedAt: number };
export type TriggerOrderHistory = { orders: TriggerOrderHistoryItem[]; pagination: { total: number; limit: number; offset: number } };

export class JupiterTriggerV2Client {
  readonly #fetch: Fetch;
  readonly #secrets: SecretReader;
  readonly #wallets: WalletSigner;
  readonly #sleep: Sleep;
  readonly #tokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(input: { secrets: SecretReader; wallets: WalletSigner; fetch?: Fetch; sleep?: Sleep }) {
    this.#secrets = input.secrets;
    this.#wallets = input.wallets;
    this.#fetch = input.fetch ?? globalThis.fetch;
    this.#sleep = input.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  }

  async authenticate(walletAddress: string): Promise<string> {
    assertAddress(walletAddress);
    const cached = this.#tokens.get(walletAddress);
    if (cached !== undefined && cached.expiresAt > Date.now()) return cached.token;
    const apiKey = await this.#apiKey();
    const challenge = await this.#request("/auth/challenge", apiKey, null, { method: "POST", body: { walletPubkey: walletAddress, type: "message" } });
    const message = field(challenge, "challenge");
    const signature = await this.#wallets.withWalletSigner(walletAddress, async (signer) => {
      const [signatures] = await signer.signMessages([createSignableMessage(message)]);
      const bytes = signatures?.[signer.address];
      if (bytes === undefined) throw new Error("Jupiter authentication signature is unavailable");
      return getBase58Decoder().decode(bytes);
    });
    const verified = await this.#request("/auth/verify", apiKey, null, { method: "POST", body: { type: "message", walletPubkey: walletAddress, signature } });
    const token = field(verified, "token");
    this.#tokens.set(walletAddress, { token, expiresAt: Date.now() + 23 * 60 * 60_000 });
    return token;
  }

  async getOrRegisterVault(walletAddress: string): Promise<TriggerVault> {
    const { apiKey, token } = await this.#auth(walletAddress);
    let value: unknown;
    try { value = await this.#request("/vault", apiKey, token, { method: "GET", retrySafe: true }); }
    catch (error) {
      if (!(error instanceof TriggerApiError) || error.status !== 404) throw error;
      value = await this.#request("/vault/register", apiKey, token, { method: "GET" });
    }
    return vault(value, walletAddress);
  }

  async craftSingleDeposit(input: { walletAddress: string; inputMint: string; outputMint: string; amount: string }): Promise<TriggerDeposit> {
    assertAddress(input.walletAddress); assertAddress(input.inputMint); assertAddress(input.outputMint);
    if (input.inputMint === input.outputMint || !RAW_AMOUNT_PATTERN.test(input.amount)) throw new Error("Trigger deposit fields are invalid");
    const { apiKey, token } = await this.#auth(input.walletAddress);
    const value = await this.#request("/deposit/craft", apiKey, token, { method: "POST", body: { inputMint: input.inputMint, outputMint: input.outputMint, userAddress: input.walletAddress, amount: input.amount, orderType: "price", orderSubType: "single" } });
    return {
      transaction: field(value, "transaction"), requestId: field(value, "requestId"), receiverAddress: field(value, "receiverAddress"),
      mint: field(value, "mint"), amount: field(value, "amount"), tokenDecimals: integerField(value, "tokenDecimals"), inputTokenAccount: field(value, "inputTokenAccount"),
    };
  }

  async createSingleOrder(input: TriggerSingleOrderInput): Promise<TriggerOrder> {
    validateOrder(input);
    const { apiKey, token } = await this.#auth(input.userPubkey);
    const value = await this.#request("/orders/price", apiKey, token, { method: "POST", body: { orderType: "single", ...input } });
    return { id: field(value, "id"), txSignature: field(value, "txSignature"), depositConfirmed: booleanField(value, "depositConfirmed") };
  }

  async history(walletAddress: string, state: "active" | "past" = "active"): Promise<TriggerOrderHistory> {
    const { apiKey, token } = await this.#auth(walletAddress);
    const value = await this.#request(`/orders/history?state=${state}&limit=50&offset=0`, apiKey, token, { method: "GET", retrySafe: true });
    if (!isRecord(value) || !Array.isArray(value.orders) || !isRecord(value.pagination)) throw new Error("Jupiter Trigger order history is invalid");
    return { orders: value.orders.slice(0, 50).map(orderHistoryItem), pagination: { total: integerField(value.pagination, "total"), limit: integerField(value.pagination, "limit"), offset: integerField(value.pagination, "offset") } };
  }

  async initiateCancel(walletAddress: string, orderId: string): Promise<TriggerCancelDraft> {
    if (!validId(orderId)) throw new Error("Trigger order ID is invalid");
    const { apiKey, token } = await this.#auth(walletAddress);
    const value = await this.#request(`/orders/price/cancel/${encodeURIComponent(orderId)}`, apiKey, token, { method: "POST" });
    return { id: field(value, "id"), transaction: field(value, "transaction"), requestId: field(value, "requestId") };
  }

  async confirmCancel(walletAddress: string, orderId: string, signedTransaction: string, cancelRequestId: string): Promise<{ id: string; txSignature: string }> {
    if (!validId(orderId) || signedTransaction.length < 32 || signedTransaction.length > 8_000 || !validId(cancelRequestId)) throw new Error("Trigger cancellation fields are invalid");
    const { apiKey, token } = await this.#auth(walletAddress);
    const value = await this.#request(`/orders/price/confirm-cancel/${encodeURIComponent(orderId)}`, apiKey, token, { method: "POST", body: { signedTransaction, cancelRequestId } });
    return { id: field(value, "id"), txSignature: field(value, "txSignature") };
  }

  async #auth(walletAddress: string): Promise<{ apiKey: string; token: string }> { return { apiKey: await this.#apiKey(), token: await this.authenticate(walletAddress) }; }
  async #apiKey(): Promise<string> { const value = await this.#secrets.getSecret("jupiter-api-key"); if (value === null) throw new Error("Jupiter is not configured"); return value; }
  async #request(path: string, apiKey: string, token: string | null, input: { method: "GET" | "POST"; body?: Record<string, unknown>; retrySafe?: boolean }): Promise<unknown> {
    const maxRetries = input.retrySafe === true ? 2 : 0;
    let delayMs = 250;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await this.#fetch(`${BASE_URL}${path}`, { method: input.method, headers: { "x-api-key": apiKey, ...(token === null ? {} : { Authorization: `Bearer ${token}` }), ...(input.body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }), signal: AbortSignal.timeout(20_000) });
        let body: unknown = null; try { body = await response.json(); } catch { /* handled below */ }
        if (!response.ok) {
          if (attempt < maxRetries && (response.status === 429 || response.status >= 500)) {
            await this.#sleep(delayMs);
            delayMs *= 2;
            continue;
          }
          throw new TriggerApiError(response.status, safeApiError(body));
        }
        if (!isRecord(body)) throw new Error("Jupiter Trigger returned an invalid response");
        return body;
      } catch (error) {
        if (attempt < maxRetries && retryableReadError(error)) {
          await this.#sleep(delayMs);
          delayMs *= 2;
          continue;
        }
        throw error;
      }
    }
    throw new Error("Jupiter Trigger read failed after bounded retries");
  }
}

export class TriggerApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function assertAddress(value: string): void { if (!ADDRESS_PATTERN.test(value)) throw new Error("Solana address is invalid"); }
function validId(value: string): boolean { return typeof value === "string" && value.length >= 8 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/u.test(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function field(value: unknown, name: string): string { if (!isRecord(value) || typeof value[name] !== "string" || value[name].length < 1 || value[name].length > 10_000) throw new Error(`Jupiter Trigger field ${name} is invalid`); return value[name]; }
function integerField(value: unknown, name: string): number { if (!isRecord(value) || typeof value[name] !== "number" || !Number.isInteger(value[name]) || value[name] < 0) throw new Error(`Jupiter Trigger field ${name} is invalid`); return value[name]; }
function booleanField(value: unknown, name: string): boolean { if (!isRecord(value) || typeof value[name] !== "boolean") throw new Error(`Jupiter Trigger field ${name} is invalid`); return value[name]; }
function vault(value: unknown, walletAddress: string): TriggerVault { const result = { userPubkey: field(value, "userPubkey"), vaultPubkey: field(value, "vaultPubkey"), privyVaultId: field(value, "privyVaultId") }; if (result.userPubkey !== walletAddress) throw new Error("Jupiter vault is not bound to the selected wallet"); assertAddress(result.vaultPubkey); return result; }
function validateOrder(input: TriggerSingleOrderInput): void { assertAddress(input.userPubkey); assertAddress(input.inputMint); assertAddress(input.outputMint); assertAddress(input.triggerMint); if (input.inputMint === input.outputMint || (input.triggerMint !== input.inputMint && input.triggerMint !== input.outputMint) || !RAW_AMOUNT_PATTERN.test(input.inputAmount) || !Number.isFinite(input.triggerPriceUsd) || input.triggerPriceUsd <= 0 || !Number.isInteger(input.slippageBps) || input.slippageBps < 0 || input.slippageBps > 300 || !Number.isInteger(input.expiresAt) || input.expiresAt <= Date.now()) throw new Error("Trigger order fields are invalid"); }
function safeApiError(value: unknown): string { return isRecord(value) && typeof value.error === "string" ? value.error.slice(0, 300) : "Jupiter Trigger request failed"; }
function retryableReadError(value: unknown): boolean {
  return value instanceof Error
    && !(value instanceof TriggerApiError)
    && (value.name === "TimeoutError" || value.name === "AbortError" || value.message.includes("fetch failed"));
}
function orderHistoryItem(value: unknown): TriggerOrderHistoryItem {
  if (!isRecord(value)) throw new Error("Jupiter Trigger order history item is invalid");
  const orderState = value.orderState; const triggerCondition = value.triggerCondition;
  if (!["pending", "open", "executing", "filled", "pending_withdraw", "cancelled", "expired", "failed"].includes(String(orderState)) || (triggerCondition !== "above" && triggerCondition !== "below")) throw new Error("Jupiter Trigger order state is invalid");
  const result = { id: field(value, "id"), orderState: orderState as TriggerOrderHistoryItem["orderState"], userPubkey: field(value, "userPubkey"), inputMint: field(value, "inputMint"), outputMint: field(value, "outputMint"), initialInputAmount: field(value, "initialInputAmount"), remainingInputAmount: field(value, "remainingInputAmount"), triggerMint: field(value, "triggerMint"), triggerCondition: triggerCondition as TriggerOrderHistoryItem["triggerCondition"], triggerPriceUsd: numberField(value, "triggerPriceUsd"), slippageBps: integerField(value, "slippageBps"), expiresAt: integerField(value, "expiresAt"), createdAt: integerField(value, "createdAt"), updatedAt: integerField(value, "updatedAt") };
  assertAddress(result.userPubkey); assertAddress(result.inputMint); assertAddress(result.outputMint); assertAddress(result.triggerMint);
  if (!/^\d+$/u.test(result.initialInputAmount) || !/^\d+$/u.test(result.remainingInputAmount) || result.triggerPriceUsd <= 0 || result.expiresAt <= 0 || result.createdAt <= 0 || result.updatedAt <= 0) throw new Error("Jupiter Trigger order fields are invalid");
  return result;
}
function numberField(value: unknown, name: string): number { if (!isRecord(value) || typeof value[name] !== "number" || !Number.isFinite(value[name])) throw new Error(`Jupiter Trigger field ${name} is invalid`); return value[name]; }
