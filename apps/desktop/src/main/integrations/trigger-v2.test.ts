import assert from "node:assert/strict";
import test from "node:test";

import { generateKeyPairSigner } from "@solana/kit";

import { JupiterTriggerV2Client } from "./trigger-v2.js";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("Trigger V2 signs the official challenge locally and keeps credentials in headers", async () => {
  const signer = await generateKeyPairSigner();
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/challenge")) return json({ type: "message", challenge: "Sign this local test challenge" });
    if (url.endsWith("/auth/verify")) return json({ token: "jwt-private-token" });
    if (url.endsWith("/vault")) return json({ error: "not found" }, 404);
    if (url.endsWith("/vault/register")) return json({ userPubkey: signer.address, vaultPubkey: SOL, privyVaultId: "vault-test-id" }, 201);
    throw new Error(`Unexpected URL ${url}`);
  };
  const client = new JupiterTriggerV2Client({
    secrets: { getSecret: async () => "jup_private_key" },
    wallets: { withWalletSigner: async (_address, operation) => operation(signer) },
    fetch: fetch as typeof globalThis.fetch,
  });
  const vault = await client.getOrRegisterVault(signer.address);
  assert.equal(vault.userPubkey, signer.address);
  assert.equal(calls.length, 4);
  assert.equal(calls.every((call) => !call.url.includes("jup_private_key") && !call.url.includes("jwt-private-token")), true);
  const verifyBody = JSON.parse(String(calls[1]?.init?.body)) as Record<string, unknown>;
  assert.equal(verifyBody.type, "message");
  assert.equal(typeof verifyBody.signature, "string");
  assert.equal(String(verifyBody.signature).length >= 64, true);
  assert.equal((calls[3]?.init?.headers as Record<string, string>).Authorization, "Bearer jwt-private-token");
});

test("Trigger V2 crafts explicit single-price metadata and bounds order policy", async () => {
  const signer = await generateKeyPairSigner();
  const bodies: Record<string, unknown>[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/challenge")) return json({ type: "message", challenge: "challenge" });
    if (url.endsWith("/auth/verify")) return json({ token: "jwt" });
    if (init?.body) bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    if (url.endsWith("/deposit/craft")) return json({ transaction: "unsigned-transaction-value", requestId: "deposit-request", receiverAddress: SOL, mint: SOL, amount: "100000000", tokenDecimals: 9, inputTokenAccount: USDC });
    if (url.endsWith("/orders/price")) return json({ id: "order-123456", txSignature: "signature-value", depositConfirmed: true });
    throw new Error(`Unexpected URL ${url}`);
  };
  const client = new JupiterTriggerV2Client({ secrets: { getSecret: async () => "jup_key" }, wallets: { withWalletSigner: async (_address, operation) => operation(signer) }, fetch: fetch as typeof globalThis.fetch });
  const deposit = await client.craftSingleDeposit({ walletAddress: signer.address, inputMint: SOL, outputMint: USDC, amount: "100000000" });
  assert.equal(bodies[0]?.orderType, "price");
  assert.equal(bodies[0]?.orderSubType, "single");
  const order = await client.createSingleOrder({ depositRequestId: deposit.requestId, depositSignedTx: "signed-transaction-value-that-is-long-enough", userPubkey: signer.address, inputMint: SOL, inputAmount: "100000000", outputMint: USDC, triggerMint: SOL, triggerCondition: "above", triggerPriceUsd: 200, slippageBps: 100, expiresAt: Date.now() + 60_000 });
  assert.equal(order.depositConfirmed, true);
  await assert.rejects(() => client.createSingleOrder({ depositRequestId: deposit.requestId, depositSignedTx: "signed-transaction-value-that-is-long-enough", userPubkey: signer.address, inputMint: SOL, inputAmount: "100000000", outputMint: USDC, triggerMint: SOL, triggerCondition: "above", triggerPriceUsd: 200, slippageBps: 301, expiresAt: Date.now() + 60_000 }), /fields are invalid/u);
});

test("Trigger V2 exposes bounded history and the documented two-step cancellation", async () => {
  const signer = await generateKeyPairSigner(); const now = Date.now(); const orderId = "order-123456"; const calls: string[] = [];
  const fetch = async (input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    if (url.endsWith("/auth/challenge")) return json({ type: "message", challenge: "challenge" });
    if (url.endsWith("/auth/verify")) return json({ token: "jwt" });
    if (url.includes("/orders/history")) return json({ orders: [{ id: orderId, orderState: "open", userPubkey: signer.address, inputMint: SOL, outputMint: USDC, initialInputAmount: "100000000", remainingInputAmount: "100000000", triggerMint: SOL, triggerCondition: "above", triggerPriceUsd: 200, slippageBps: 100, expiresAt: now + 60_000, createdAt: now, updatedAt: now }], pagination: { total: 1, limit: 50, offset: 0 } });
    if (url.endsWith(`/orders/price/cancel/${orderId}`)) return json({ id: orderId, transaction: "unsigned-withdrawal-transaction", requestId: "cancel-request" });
    if (url.endsWith(`/orders/price/confirm-cancel/${orderId}`)) return json({ id: orderId, txSignature: "1".repeat(64) });
    throw new Error(`Unexpected URL ${url}`);
  };
  const client = new JupiterTriggerV2Client({ secrets: { getSecret: async () => "jup_key" }, wallets: { withWalletSigner: async (_address, operation) => operation(signer) }, fetch: fetch as typeof globalThis.fetch });
  const history = await client.history(signer.address); assert.equal(history.orders[0]?.orderState, "open");
  const draft = await client.initiateCancel(signer.address, orderId); assert.equal(draft.requestId, "cancel-request");
  const receipt = await client.confirmCancel(signer.address, orderId, "signed-withdrawal-transaction-value", draft.requestId); assert.equal(receipt.id, orderId);
  assert.equal(calls.some((url) => url.includes("confirm-cancel")), true);
});

test("Trigger V2 retries only explicitly retry-safe reads with bounded backoff", async () => {
  const signer = await generateKeyPairSigner();
  const now = Date.now();
  let historyAttempts = 0;
  const delays: number[] = [];
  const fetch = async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/auth/challenge")) return json({ type: "message", challenge: "challenge" });
    if (url.endsWith("/auth/verify")) return json({ token: "jwt" });
    if (url.includes("/orders/history")) {
      historyAttempts += 1;
      if (historyAttempts === 1) return json({ error: "rate limited" }, 429);
      return json({ orders: [{
        id: "order-123456", orderState: "open", userPubkey: signer.address, inputMint: SOL, outputMint: USDC,
        initialInputAmount: "100000000", remainingInputAmount: "100000000", triggerMint: SOL,
        triggerCondition: "above", triggerPriceUsd: 200, slippageBps: 100,
        expiresAt: now + 60_000, createdAt: now, updatedAt: now,
      }], pagination: { total: 1, limit: 50, offset: 0 } });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const client = new JupiterTriggerV2Client({
    secrets: { getSecret: async () => "jup_key" },
    wallets: { withWalletSigner: async (_address, operation) => operation(signer) },
    fetch: fetch as typeof globalThis.fetch,
    sleep: async (delayMs) => { delays.push(delayMs); },
  });

  const history = await client.history(signer.address);
  assert.equal(history.orders.length, 1);
  assert.equal(historyAttempts, 2);
  assert.deepEqual(delays, [250]);
});

test("Trigger V2 never retries a timed-out mutation", async () => {
  const signer = await generateKeyPairSigner();
  let depositAttempts = 0;
  const delays: number[] = [];
  const fetch = async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/auth/challenge")) return json({ type: "message", challenge: "challenge" });
    if (url.endsWith("/auth/verify")) return json({ token: "jwt" });
    if (url.endsWith("/deposit/craft")) {
      depositAttempts += 1;
      const error = new Error("request timed out");
      error.name = "TimeoutError";
      throw error;
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const client = new JupiterTriggerV2Client({
    secrets: { getSecret: async () => "jup_key" },
    wallets: { withWalletSigner: async (_address, operation) => operation(signer) },
    fetch: fetch as typeof globalThis.fetch,
    sleep: async (delayMs) => { delays.push(delayMs); },
  });

  await assert.rejects(
    () => client.craftSingleDeposit({ walletAddress: signer.address, inputMint: SOL, outputMint: USDC, amount: "100000000" }),
    /timed out/u,
  );
  assert.equal(depositAttempts, 1);
  assert.deepEqual(delays, []);
});

function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }); }
