import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { address as solanaAddress, getAddressEncoder, getBase58Decoder, getProgramDerivedAddress } from "@solana/kit";
import type { SecretName } from "../storage/keystore.js";
import { ProviderCircuitBreaker } from "./provider-circuit-breaker.js";
import { ProviderRateBudget } from "./provider-rate-budget.js";
import { extractPumpActivitySignals, extractPumpCandidateMints, extractPumpEventSignals, extractPumpMintSignals, MainnetReadService, PUMP_PROGRAM_ID, PUMP_SWAP_PROGRAM_ID } from "./read-only.js";

const WALLET = "11111111111111111111111111111111";
const MINT = "So11111111111111111111111111111111111111112";
const PUMP_MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

class Secrets {
  readonly values = new Map<SecretName, string>();
  async getSecret(name: SecretName) { return this.values.get(name) ?? null; }
}

test("portfolio returns finalized balances and only real Jupiter valuations", async () => {
  const secrets = new Secrets();
  secrets.values.set("jupiter-api-key", "jupiter-private-key");
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.jup.ag/")) return Response.json({
      [MINT]: { usdPrice: 150, createdAt: "2026-07-21T00:00:00Z", blockId: 123 },
    });
    const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
    if (request.method === "getBalance") return Response.json({ jsonrpc: "2.0", id: 1, result: { context: { slot: 99 }, value: 1_500_000_000 } });
    return Response.json({ jsonrpc: "2.0", id: 1, result: { context: { slot: 100 }, value: [] } });
  };
  const service = new MainnetReadService({ secrets, wallets: { listWallets: async () => [{ address: WALLET, primary: true }] }, fetch: fetchMock });
  const portfolio = await service.portfolio(WALLET);
  assert.equal(portfolio.solBalance, "1.5");
  assert.equal(portfolio.solUsdPrice, 150);
  assert.equal(portfolio.totalUsd, 225);
  assert.equal(portfolio.slot, 100);
});

test("portfolio refuses addresses outside the encrypted local registry", async () => {
  const service = new MainnetReadService({ secrets: new Secrets(), wallets: { listWallets: async () => [] }, fetch: async () => { throw new Error("must not fetch"); } });
  await assert.rejects(() => service.portfolio(WALLET), /not registered/u);
});

test("wallet activity returns only bounded finalized signatures for a registered wallet", async () => {
  let request: { method?: string; params?: unknown[] } = {};
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [{ address: WALLET, primary: true }] },
    fetch: async (_input, init) => {
      request = JSON.parse(String(init?.body)) as typeof request;
      return Response.json({ jsonrpc: "2.0", id: 1, result: [{ signature: "1".repeat(64), slot: 123, err: null, memo: "verified memo", blockTime: 1_753_056_000 }] });
    },
  });
  const activity = await service.activity(WALLET, 5);
  assert.equal(request.method, "getSignaturesForAddress");
  assert.deepEqual(request.params?.[1], { commitment: "finalized", limit: 5 });
  assert.equal(activity.entries[0]?.status, "success");
  assert.equal(activity.entries[0]?.memo, "verified memo");
  assert.match(activity.entries[0]?.explorerUrl ?? "", /^https:\/\/explorer\.solana\.com\/tx\//u);
});

test("bounded Pump scanner reads finalized official-program activity without execution authority", async () => {
  const requests: Array<{ method: string; params: unknown[] }> = [];
  const signature = "1".repeat(64);
  const service = new MainnetReadService({
    secrets: new Secrets(), wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      requests.push(request);
      if (request.method === "getSignaturesForAddress") return Response.json({ jsonrpc: "2.0", id: 1, result: [{ signature, slot: 123, err: null, blockTime: 1_753_056_000, confirmationStatus: "finalized" }] });
      if (request.method === "getTransaction") return Response.json({ jsonrpc: "2.0", id: 1, result: { slot: 123, meta: { postTokenBalances: [] } } });
      throw new Error("unexpected RPC method");
    },
  });
  const snapshot = await service.recentPumpCandidates({ signatureLimit: 1, candidateLimit: 1 });
  assert.deepEqual(requests[0]?.params, [PUMP_PROGRAM_ID, { commitment: "finalized", limit: 1 }]);
  assert.deepEqual((requests[1]?.params?.[1]), { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 });
  assert.equal(snapshot.commitment, "finalized");
  assert.equal(snapshot.scannedSignatures, 1);
  assert.equal(snapshot.cursorSignature, signature);
  assert.equal(snapshot.decodedEvents, 0);
  assert.equal(snapshot.candidates.length, 0);
  assert.equal(snapshot.executionAllowed, false);
});

test("bounded Pump scanner resumes after its encrypted finalized cursor", async () => {
  const cursor = "2".repeat(64);
  let request: { method?: string; params?: unknown[] } = {};
  const service = new MainnetReadService({
    secrets: new Secrets(), wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      request = JSON.parse(String(init?.body)) as typeof request;
      return Response.json({ jsonrpc: "2.0", id: 1, result: [] });
    },
  });
  const snapshot = await service.recentPumpCandidates({ signatureLimit: 4, candidateLimit: 2, untilSignature: cursor });
  assert.deepEqual(request.params, [PUMP_PROGRAM_ID, { commitment: "finalized", limit: 4, until: cursor }]);
  assert.equal(snapshot.cursorSignature, cursor);
  assert.equal(snapshot.scannedSignatures, 0);
});

test("Pump scanner candidate extraction is bounded, unique, and excludes quote mints", () => {
  assert.deepEqual(extractPumpCandidateMints({ meta: { postTokenBalances: [
    { mint: PUMP_MINT }, { mint: PUMP_MINT }, { mint: MINT }, { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, { mint: "invalid" },
  ] } }), [PUMP_MINT]);
});

test("Pump activity signals are decoded only for the pinned official program discriminators", () => {
  const encode = (bytes: number[]) => getBase58Decoder().decode(Uint8Array.from(bytes));
  const transaction = { transaction: { message: { instructions: [
    { programId: PUMP_PROGRAM_ID, data: encode([24, 30, 200, 40, 5, 28, 7, 119]) },
    { programId: PUMP_PROGRAM_ID, data: encode([102, 6, 61, 18, 1, 218, 235, 234, 1]) },
    { programId: "11111111111111111111111111111111", data: encode([51, 230, 133, 164, 1, 127, 131, 173]) },
  ] } }, meta: { innerInstructions: [{ instructions: [
    { programId: PUMP_PROGRAM_ID, data: encode([155, 234, 231, 146, 236, 158, 162, 30]) },
  ] }] } };
  assert.deepEqual(extractPumpActivitySignals(transaction), ["token-created", "curve-buy", "migration-observed"]);
});

test("Pump instruction signals bind to the instruction's exact mint account", () => {
  const otherMint = "4".repeat(32);
  const data = getBase58Decoder().decode(Uint8Array.from([24, 30, 200, 40, 5, 28, 7, 119]));
  const transaction = {
    transaction: { message: { instructions: [{ programId: PUMP_PROGRAM_ID, data, accounts: [PUMP_MINT] }] } },
    meta: { postTokenBalances: [{ mint: PUMP_MINT }, { mint: otherMint }] },
  };
  const signals = extractPumpMintSignals(transaction);
  assert.deepEqual(signals.get(PUMP_MINT), ["token-balance-observed", "token-created"]);
  assert.deepEqual(signals.get(otherMint), ["token-balance-observed"]);
});

test("Pump events decode only inside the official program execution frame and bind their mint", () => {
  const addressEncoder = getAddressEncoder();
  const mintBytes = Buffer.from(addressEncoder.encode(solanaAddress(PUMP_MINT)));
  const userBytes = Buffer.from(addressEncoder.encode(solanaAddress(WALLET)));
  const borshString = (value: string) => {
    const text = Buffer.from(value, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32LE(text.length);
    return Buffer.concat([length, text]);
  };
  const create = Buffer.concat([
    Buffer.from([27, 114, 169, 77, 222, 235, 99, 118]),
    borshString("Token"), borshString("TOK"), borshString("https://example.invalid/token.json"), mintBytes,
  ]).toString("base64");
  const ignoredTrade = Buffer.concat([
    Buffer.from([189, 219, 127, 211, 78, 230, 97, 238]), mintBytes,
  ]).toString("base64");
  const complete = Buffer.concat([
    Buffer.from([95, 114, 97, 156, 212, 46, 152, 8]), userBytes, mintBytes,
  ]).toString("base64");
  const transaction = { meta: { logMessages: [
    `Program ${PUMP_PROGRAM_ID} invoke [1]`,
    `Program data: ${create}`,
    "Program 11111111111111111111111111111111 invoke [2]",
    `Program data: ${ignoredTrade}`,
    "Program 11111111111111111111111111111111 success",
    `Program data: ${complete}`,
    `Program ${PUMP_PROGRAM_ID} success`,
  ] } };
  assert.deepEqual(extractPumpEventSignals(transaction).get(PUMP_MINT), ["create-event", "complete-event"]);
});

test("Jupiter swap preview uses V2 quote-only order and never sends a taker or API key in the URL", async () => {
  const secrets = new Secrets();
  secrets.values.set("jupiter-api-key", "jupiter-private-key");
  const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  let requestedUrl = "";
  let apiKey = "";
  const service = new MainnetReadService({
    secrets,
    wallets: { listWallets: async () => [] },
    fetch: async (input, init) => {
      requestedUrl = String(input);
      apiKey = new Headers(init?.headers).get("x-api-key") ?? "";
      return Response.json({ transaction: null, requestId: "private-order-id", outAmount: "987654", router: "metis", mode: "ultra", feeBps: 2, feeMint: MINT });
    },
  });
  const quote = await service.swapQuote(MINT, outputMint, "100000000");
  const url = new URL(requestedUrl);
  assert.equal(url.origin + url.pathname, "https://api.jup.ag/swap/v2/order");
  assert.equal(url.searchParams.get("inputMint"), MINT);
  assert.equal(url.searchParams.get("outputMint"), outputMint);
  assert.equal(url.searchParams.get("amount"), "100000000");
  assert.equal(url.searchParams.has("taker"), false);
  assert.equal(requestedUrl.includes("jupiter-private-key"), false);
  assert.equal(apiKey, "jupiter-private-key");
  assert.equal(quote.quoteOnly, true);
  assert.equal(quote.outAmount, "987654");
  assert.equal("transaction" in quote, false);
  assert.equal("requestId" in quote, false);
});

test("Jupiter swap preview rejects any unexpected transaction payload", async () => {
  const secrets = new Secrets();
  secrets.values.set("jupiter-api-key", "jupiter-private-key");
  const service = new MainnetReadService({
    secrets,
    wallets: { listWallets: async () => [] },
    fetch: async () => Response.json({ transaction: "base64-transaction", outAmount: "987654", router: "metis", mode: "ultra" }),
  });
  await assert.rejects(() => service.swapQuote(MINT, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "100000000"), /unexpected transaction/u);
});

test("Jupiter unsigned swap order binds the registered taker and guarded slippage", async () => {
  const secrets = new Secrets();
  secrets.values.set("jupiter-api-key", "jupiter-private-key");
  const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const transaction = Buffer.from([1, 2, 3]).toString("base64");
  let requestedUrl = "";
  let apiKey = "";
  const service = new MainnetReadService({
    secrets,
    wallets: { listWallets: async () => [{ address: WALLET, primary: true }] },
    fetch: async (input, init) => {
      requestedUrl = String(input);
      apiKey = new Headers(init?.headers).get("x-api-key") ?? "";
      return Response.json({ transaction, outAmount: "987654", router: "metis", mode: "ultra", requestId: "private-order-id", lastValidBlockHeight: "12345" });
    },
  });
  const order = await service.buildUnsignedSwapOrder(MINT, outputMint, "100000000", WALLET, 100);
  const url = new URL(requestedUrl);
  assert.equal(url.origin + url.pathname, "https://api.jup.ag/swap/v2/order");
  assert.equal(url.searchParams.get("taker"), WALLET);
  assert.equal(url.searchParams.get("slippageBps"), "100");
  assert.equal(requestedUrl.includes("jupiter-private-key"), false);
  assert.equal(apiKey, "jupiter-private-key");
  assert.equal(order.transaction, transaction);
  assert.equal(order.requestId, "private-order-id");
  assert.equal(order.lastValidBlockHeight, "12345");
});

test("buildUnsignedSwapOrder passes priorityLevel query parameter when priority preference is supplied", async () => {
  const secrets = new Secrets();
  secrets.values.set("jupiter-api-key", "jupiter-private-key");
  const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const transaction = Buffer.from([1, 2, 3]).toString("base64");
  let requestedUrl = "";
  const service = new MainnetReadService({
    secrets,
    wallets: { listWallets: async () => [{ address: WALLET, primary: true }] },
    fetch: async (input) => {
      requestedUrl = String(input);
      return Response.json({ transaction, outAmount: "987654", router: "metis", mode: "ultra", requestId: "private-order-id", lastValidBlockHeight: "12345" });
    },
  });
  await service.buildUnsignedSwapOrder(MINT, outputMint, "100000000", WALLET, 100, "fast");
  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("priorityLevel"), "fast");
});

test("unsigned simulation uses replaceable blockhash without signature verification or broadcast", async () => {
  const transaction = Buffer.from([1, 2, 3]).toString("base64");
  let request: { method?: string; params?: unknown[] } = {};
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      request = JSON.parse(String(init?.body)) as typeof request;
      return Response.json({ jsonrpc: "2.0", id: 1, result: { context: { slot: 123 }, value: { err: null, logs: ["Program log: preview"], unitsConsumed: 10, fee: 5000 } } });
    },
  });
  const simulation = await service.simulateUnsignedTransaction(transaction);
  assert.equal(request.method, "simulateTransaction");
  assert.deepEqual(request.params?.[1], { encoding: "base64", commitment: "confirmed", replaceRecentBlockhash: true, sigVerify: false, innerInstructions: true });
  assert.equal(simulation.unitsConsumed, 10);
  assert.equal(simulation.feeLamports, 5000);
  assert.equal(simulation.err, null);
});

test("scoped unsigned simulation separates account funding from SOL input and network fee", async () => {
  const transaction = Buffer.from([1, 2, 3]).toString("base64");
  const requests: Array<{ method?: string; params?: unknown[] }> = [];
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { method?: string; params?: unknown[] };
      requests.push(request);
      if (request.method === "getBalance") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: { context: { slot: 120 }, value: 100_000_000 } });
      }
      return Response.json({
        jsonrpc: "2.0",
        id: 2,
        result: {
          context: { slot: 123 },
          value: {
            err: null,
            logs: [],
            unitsConsumed: 10,
            fee: 5_000,
            accounts: [{ lamports: 96_955_720, data: ["", "base64"], owner: WALLET, executable: false, rentEpoch: 0 }],
          },
        },
      });
    },
  });
  const simulation = await service.simulateUnsignedTransaction(transaction, {
    walletAddress: WALLET,
    solInputLamports: "1000000",
  });
  assert.deepEqual(requests.map((request) => request.method), ["getBalance", "simulateTransaction"]);
  assert.deepEqual((requests[1]?.params?.[1] as { accounts?: unknown; minContextSlot?: unknown }), {
    encoding: "base64",
    commitment: "confirmed",
    replaceRecentBlockhash: true,
    sigVerify: false,
    innerInstructions: true,
    minContextSlot: 120,
    accounts: { encoding: "base64", addresses: [WALLET] },
  });
  assert.equal(simulation.feeLamports, 5_000);
  assert.equal(simulation.accountCreationFundingLamports, 2_039_280);
  assert.equal(simulation.estimatedWalletOutflowLamports, "3044280");
});

test("scoped unsigned simulation blocks when RPC omits post-simulation wallet evidence", async () => {
  const transaction = Buffer.from([1, 2, 3]).toString("base64");
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { method?: string };
      return request.method === "getBalance"
        ? Response.json({ jsonrpc: "2.0", id: 1, result: { context: { slot: 120 }, value: 100_000_000 } })
        : Response.json({ jsonrpc: "2.0", id: 2, result: { context: { slot: 123 }, value: { err: null, logs: [], unitsConsumed: 10, fee: 5_000 } } });
    },
  });
  await assert.rejects(
    () => service.simulateUnsignedTransaction(transaction, {
      walletAddress: WALLET,
      solInputLamports: null,
    }),
    /omitted the selected wallet balance evidence/u,
  );
});

test("scoped unsigned simulation preserves a program failure even when post-balance evidence is absent", async () => {
  const transaction = Buffer.from([1, 2, 3]).toString("base64");
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { method?: string };
      return request.method === "getBalance"
        ? Response.json({ jsonrpc: "2.0", id: 1, result: { context: { slot: 120 }, value: 100_000_000 } })
        : Response.json({ jsonrpc: "2.0", id: 2, result: { context: { slot: 123 }, value: { err: { InstructionError: [2, "Custom"] }, logs: [], unitsConsumed: 10, fee: 5_000 } } });
    },
  });
  const simulation = await service.simulateUnsignedTransaction(transaction, {
    walletAddress: WALLET,
    solInputLamports: null,
  });
  assert.deepEqual(simulation.err, { InstructionError: [2, "Custom"] });
  assert.equal(simulation.accountCreationFundingLamports, null);
  assert.equal(simulation.estimatedWalletOutflowLamports, null);
});

test("Jupiter execution posts a signed transaction and request id without leaking the API key", async () => {
  const secrets = new Secrets();
  secrets.values.set("jupiter-api-key", "jupiter-private-key");
  const transaction = Buffer.from([1, 2, 3]).toString("base64");
  let requestedUrl = "";
  let requestBody: Record<string, unknown> = {};
  const service = new MainnetReadService({
    secrets,
    wallets: { listWallets: async () => [] },
    fetch: async (input, init) => {
      requestedUrl = String(input);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ status: "Success", signature: "1".repeat(64), code: 0, totalInputAmount: "100", totalOutputAmount: "200" });
    },
  });
  const result = await service.executeSignedSwap(transaction, "private-order-id", "12345");
  assert.equal(requestedUrl, "https://api.jup.ag/swap/v2/execute");
  assert.equal(requestedUrl.includes("jupiter-private-key"), false);
  assert.deepEqual(requestBody, { signedTransaction: transaction, requestId: "private-order-id", lastValidBlockHeight: "12345" });
  assert.equal(result.status, "Success");
  assert.equal(result.signature, "1".repeat(64));
});

test("transaction receipt verification searches Solana history and returns finalized evidence", async () => {
  let request: { method?: string; params?: unknown[] } = {};
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      request = JSON.parse(String(init?.body)) as typeof request;
      return Response.json({ jsonrpc: "2.0", id: 1, result: { context: { slot: 456 }, value: [{ slot: 455, confirmations: null, err: null, confirmationStatus: "finalized" }] } });
    },
  });
  const verification = await service.verifyTransactionSignature("1".repeat(64));
  assert.equal(request.method, "getSignatureStatuses");
  assert.deepEqual(request.params, [["1".repeat(64)], { searchTransactionHistory: true }]);
  assert.equal(verification.state, "finalized");
  assert.equal(verification.slot, 455);
});

test("transaction receipt verification distinguishes missing and failed signatures", async () => {
  let failed = false;
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async () => Response.json({ jsonrpc: "2.0", id: 1, result: { context: { slot: 456 }, value: [failed ? { slot: 455, err: { InstructionError: [1, "Custom"] }, confirmationStatus: "finalized" } : null] } }),
  });
  assert.equal((await service.verifyTransactionSignature("1".repeat(64))).state, "not-found");
  failed = true;
  const verification = await service.verifyTransactionSignature("1".repeat(64));
  assert.equal(verification.state, "failed");
  assert.match(verification.error ?? "", /InstructionError/u);
});

test("Jupiter requests stop after bounded provider failures and recover only after cooldown", async () => {
  const secrets = new Secrets();
  secrets.values.set("jupiter-api-key", "jupiter-private-key");
  let now = 0;
  let requests = 0;
  const circuit = new ProviderCircuitBreaker({
    name: "Jupiter provider",
    failureThreshold: 2,
    cooldownMs: 1_000,
    now: () => now,
  });
  const service = new MainnetReadService({
    secrets,
    wallets: { listWallets: async () => [] },
    jupiterCircuit: circuit,
    fetch: async () => {
      requests += 1;
      return requests <= 2
        ? Response.json({ error: "temporary" }, { status: 503 })
        : Response.json({ [MINT]: { usdPrice: 150 } });
    },
  });

  await assert.rejects(() => service.prices([MINT]), /Jupiter price request failed/u);
  await assert.rejects(() => service.prices([MINT]), /Jupiter price request failed/u);
  await assert.rejects(() => service.prices([MINT]), /temporarily unavailable/u);
  assert.equal(requests, 2);

  now = 1_000;
  const prices = await service.prices([MINT]);
  assert.equal(prices.get(MINT)?.usdPrice, 150);
  assert.equal(requests, 3);
});

test("Jupiter request budget fails closed before another provider request", async () => {
  const secrets = new Secrets();
  secrets.values.set("jupiter-api-key", "jupiter-private-key");
  let requests = 0;
  const service = new MainnetReadService({
    secrets,
    wallets: { listWallets: async () => [] },
    jupiterRateBudget: new ProviderRateBudget({
      name: "Jupiter provider",
      limit: 1,
      windowMs: 60_000,
    }),
    fetch: async () => {
      requests += 1;
      return Response.json({ [MINT]: { usdPrice: 150 } });
    },
  });

  await service.prices([MINT]);
  await assert.rejects(() => service.prices([MINT]), /request budget is exhausted/u);
  assert.equal(requests, 1);
});

test("Solana RPC request budget blocks sustained reads before another fetch", async () => {
  let requests = 0;
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    solanaRpcRateBudget: new ProviderRateBudget({
      name: "Solana RPC",
      limit: 1,
      windowMs: 60_000,
    }),
    fetch: async () => {
      requests += 1;
      return Response.json({ jsonrpc: "2.0", id: 1, result: { value: [null] } });
    },
  });

  await service.verifyTransactionSignature("1".repeat(64));
  await assert.rejects(
    () => service.verifyTransactionSignature("1".repeat(64)),
    /request budget is exhausted/u,
  );
  assert.equal(requests, 1);
});

test("transaction receipt verification retries timeouts with bounded read-only backoff", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const timeout = Object.assign(new Error("verification timed out"), { name: "TimeoutError" });
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async () => {
      attempts += 1;
      throw timeout;
    },
    sleep: async (delayMs) => { delays.push(delayMs); },
  });
  await assert.rejects(
    () => service.verifyTransactionSignature("1".repeat(64)),
    /timed out/u,
  );
  assert.equal(attempts, 4);
  assert.deepEqual(delays, [500, 1_000, 2_000]);
});

test("confirmed transaction settlement exposes actual fee and selected-wallet lamport delta", async () => {
  const wallet = "11111111111111111111111111111111";
  let request: { method?: string } = {};
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      request = JSON.parse(String(init?.body)) as typeof request;
      return Response.json({ jsonrpc: "2.0", id: 1, result: {
        slot: 77,
        meta: { fee: 166_729, preBalances: [156_130_058], postBalances: [152_924_049] },
        transaction: { message: { accountKeys: [{ pubkey: wallet, signer: true, writable: true }] } },
      } });
    },
  });
  const settlement = await service.transactionSettlement("1".repeat(64), wallet);
  assert.equal(request.method, "getTransaction");
  assert.deepEqual(settlement, { slot: 77, feeLamports: 166_729, walletPreLamports: "156130058", walletPostLamports: "152924049" });
});

test("finalized Pump settlement exposes exact-mint raw delta and token-account funding", async () => {
  const tokenAccount = "AY8Ti7Tr7iUGksWJ7GjYy3vkE2YBv6qj9BnE8HtYCf8f";
  let commitment = "";
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { params: [string, { commitment: string }] };
      commitment = request.params[1].commitment;
      return Response.json({ jsonrpc: "2.0", id: 1, result: {
        slot: 88,
        meta: {
          fee: 5_000,
          preBalances: [100_000_000, 0],
          postBalances: [96_955_720, 2_039_280],
          preTokenBalances: [],
          postTokenBalances: [{ accountIndex: 1, mint: PUMP_MINT, owner: WALLET, uiTokenAmount: { amount: "250000", decimals: 6, uiAmount: 0.25 } }],
        },
        transaction: { message: { accountKeys: [{ pubkey: WALLET }, { pubkey: tokenAccount }] } },
      } });
    },
  });
  const settlement = await service.pumpTransactionSettlement("1".repeat(64), WALLET, PUMP_MINT);
  assert.equal(commitment, "finalized");
  assert.equal(settlement.tokenRawDelta, "250000");
  assert.equal(settlement.accountCreationFundingLamports, 2_039_280);
  assert.equal(settlement.walletPostLamports, "96955720");
});

test("finalized Token Launch settlement proves a newly funded mint and exact creator outflow", async () => {
  const creator = WALLET;
  const mint = PUMP_MINT;
  const bondingCurve = "AY8Ti7Tr7iUGksWJ7GjYy3vkE2YBv6qj9BnE8HtYCf8f";
  let commitment = "";
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { params: [string, { commitment: string }] };
      commitment = request.params[1].commitment;
      return Response.json({ jsonrpc: "2.0", id: 1, result: {
        slot: 99,
        meta: {
          err: null,
          fee: 5_000,
          preBalances: [100_000_000, 0, 0],
          postBalances: [96_955_720, 1_461_600, 1_577_680],
        },
        transaction: { message: { accountKeys: [
          { pubkey: creator, signer: true, writable: true },
          { pubkey: mint, signer: true, writable: true },
          { pubkey: bondingCurve, signer: false, writable: true },
        ] } },
      } });
    },
  });
  const settlement = await service.pumpLaunchTransactionSettlement("1".repeat(64), creator, mint);
  assert.equal(commitment, "finalized");
  assert.equal(settlement.slot, 99);
  assert.equal(settlement.feeLamports, 5_000);
  assert.equal(settlement.accountCreationFundingLamports, 3_039_280);
  assert.equal(settlement.walletOutflowLamports, "3044280");
  assert.equal(settlement.walletPreLamports, "100000000");
  assert.equal(settlement.walletPostLamports, "96955720");
});

test("Token Launch settlement rejects a mint account that was already funded", async () => {
  const creator = WALLET;
  const mint = PUMP_MINT;
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async () => Response.json({ jsonrpc: "2.0", id: 1, result: {
      slot: 100,
      meta: {
        err: null,
        fee: 5_000,
        preBalances: [100_000_000, 1_461_600],
        postBalances: [99_995_000, 1_461_600],
      },
      transaction: { message: { accountKeys: [
        { pubkey: creator, signer: true, writable: true },
        { pubkey: mint, signer: true, writable: true },
      ] } },
    } }),
  });

  await assert.rejects(
    () => service.pumpLaunchTransactionSettlement("1".repeat(64), creator, mint),
    /does not prove creator outflow and a newly funded mint/,
  );
});

test("Token Launch settlement rejects a finalized transaction with an on-chain error", async () => {
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async () => Response.json({ jsonrpc: "2.0", id: 1, result: {
      slot: 101,
      meta: {
        err: { InstructionError: [0, "Custom"] },
        fee: 5_000,
        preBalances: [100_000_000, 0],
        postBalances: [99_995_000, 1_461_600],
      },
      transaction: { message: { accountKeys: [
        { pubkey: WALLET, signer: true, writable: true },
        { pubkey: PUMP_MINT, signer: true, writable: true },
      ] } },
    } }),
  });

  await assert.rejects(
    () => service.pumpLaunchTransactionSettlement("1".repeat(64), WALLET, PUMP_MINT),
    /invalid finalized Token Launch settlement details/,
  );
});

test("Jupiter token search returns bounded verification evidence without exposing the API key", async () => {
  const secrets = new Secrets();
  secrets.values.set("jupiter-api-key", "jupiter-private-key");
  let requestedUrl = "";
  let apiKey = "";
  const service = new MainnetReadService({
    secrets,
    wallets: { listWallets: async () => [] },
    fetch: async (input, init) => {
      requestedUrl = String(input);
      apiKey = new Headers(init?.headers).get("x-api-key") ?? "";
      return Response.json([{ id: MINT, name: "Wrapped SOL", symbol: "SOL", decimals: 9, isVerified: true, organicScore: 99.2, organicScoreLabel: "high", usdPrice: 150, mcap: 80_000_000_000, holderCount: 2_000_000, tags: ["verified", "strict"] }]);
    },
  });
  const evidence = await service.tokenSearch("SOL");
  assert.equal(new URL(requestedUrl).pathname, "/tokens/v2/search");
  assert.equal(new URL(requestedUrl).searchParams.get("query"), "SOL");
  assert.equal(requestedUrl.includes("jupiter-private-key"), false);
  assert.equal(apiKey, "jupiter-private-key");
  assert.equal(evidence.tokens[0]?.mint, MINT);
  assert.equal(evidence.tokens[0]?.isVerified, true);
  assert.equal(evidence.tokens[0]?.organicScore, 99.2);
});

test("Pump token analysis verifies the canonical curve owner and decodes bounded reserve evidence", async () => {
  const encoder = getAddressEncoder();
  const [bondingCurveAddress] = await getProgramDerivedAddress({
    programAddress: solanaAddress(PUMP_PROGRAM_ID),
    seeds: [new TextEncoder().encode("bonding-curve"), encoder.encode(solanaAddress(PUMP_MINT))],
  });
  const [bondingCurveTokenAccount] = await getProgramDerivedAddress({
    programAddress: solanaAddress(ASSOCIATED_TOKEN_PROGRAM_ID),
    seeds: [
      encoder.encode(bondingCurveAddress),
      encoder.encode(solanaAddress("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")),
      encoder.encode(solanaAddress(PUMP_MINT)),
    ],
  });
  const data = Buffer.alloc(115);
  createHash("sha256").update("account:BondingCurve").digest().copy(data, 0, 0, 8);
  data.writeBigUInt64LE(1_073_000_000_000_000n, 8);
  data.writeBigUInt64LE(30_000_000_000n, 16);
  data.writeBigUInt64LE(793_100_000_000_000n, 24);
  data.writeBigUInt64LE(0n, 32);
  data.writeBigUInt64LE(1_000_000_000_000_000n, 40);
  data[48] = 0;
  const global = Buffer.alloc(162);
  createHash("sha256").update("account:Global").digest().copy(global, 0, 0, 8);
  global.writeBigUInt64LE(793_100_000_000_000n, 89);
  global.writeBigUInt64LE(100n, 105);
  global.writeBigUInt64LE(50n, 154);
  const requests: Array<{ method?: string; params?: unknown[] }> = [];
  let base64AccountCalls = 0;
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      requests.push(request);
      if (request.method === "getTokenLargestAccounts") return rpcContext(4240, [
        { address: String(bondingCurveTokenAccount), amount: "793100000000000" },
        { address: WALLET, amount: "200000000000000" },
      ]);
      if ((request.params[1] as { encoding?: string }).encoding === "jsonParsed") return rpcContext(4241, mintAccount("1000000000000000"));
      base64AccountCalls += 1;
      if (base64AccountCalls === 1) return rpcContext(4242, { owner: PUMP_PROGRAM_ID, data: [data.toString("base64"), "base64"] });
      if (base64AccountCalls === 3) return rpcContext(4243, { owner: PUMP_PROGRAM_ID, data: [global.toString("base64"), "base64"] });
      return rpcContext(4242, null);
    },
  });
  const evidence = await service.pumpTokenAnalysis(PUMP_MINT, "2000000");
  assert.equal(requests.filter((request) => request.method === "getAccountInfo").length, 4);
  assert.equal((requests[0]?.params?.[1] as { commitment?: string }).commitment, "finalized");
  assert.match(String(requests[0]?.params?.[0]), /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u);
  assert.equal(evidence.accountVerified, true);
  assert.equal(evidence.venue, "bonding-curve-active");
  assert.equal(evidence.virtualQuoteReserves, "30000000000");
  assert.equal(evidence.metrics.quoteSymbol, "SOL");
  assert.equal(evidence.metrics.curveProgressPercent, 0);
  assert.equal(evidence.metrics.baseProtocolFeeBps, 100);
  assert.equal(evidence.metrics.baseCreatorFeeBps, 50);
  assert.equal(evidence.top10ConcentrationPercent, 20);
  assert.ok((evidence.metrics.estimatedMarketCapQuote ?? 0) > 27);
  assert.ok((evidence.metrics.referenceBuyPriceImpactBps ?? 0) > 0);
  assert.equal(evidence.metrics.referencePath.venue, "bonding-curve");
  assert.equal(evidence.metrics.referencePath.buyInputQuoteAmount, "2000000");
  assert.ok(BigInt(evidence.metrics.referencePath.buyOutputTokenAmount ?? "0") > 0n);
  assert.equal(evidence.metrics.referencePath.sellInputTokenAmount, evidence.metrics.referencePath.buyOutputTokenAmount);
  assert.ok(BigInt(evidence.metrics.referencePath.sellOutputQuoteAmount ?? "0") > 0n);
  assert.equal(evidence.metrics.referencePath.networkFeeLamports, null);
  assert.equal(evidence.metrics.referencePath.rentLamports, null);
  assert.equal(evidence.slot, 4243);
});

test("Pump token analysis does not infer migration or safety from a missing curve account", async () => {
  const service = new MainnetReadService({
    secrets: new Secrets(),
    wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (request.method === "getTokenLargestAccounts") return rpcContext(99, []);
      if ((request.params[1] as { encoding?: string }).encoding === "jsonParsed") return rpcContext(99, mintAccount("1000000"));
      return rpcContext(99, null);
    },
  });
  const evidence = await service.pumpTokenAnalysis(PUMP_MINT);
  assert.equal(evidence.venue, "unknown");
  assert.equal(evidence.bondingCurveExists, false);
  assert.equal(evidence.complete, null);
  assert.match(evidence.warnings.join(" "), /does not prove/u);
});

test("Pump token analysis independently verifies a canonical migrated PumpSwap pool", async () => {
  const encoder = getAddressEncoder();
  const [poolAuthority] = await getProgramDerivedAddress({
    programAddress: solanaAddress(PUMP_PROGRAM_ID),
    seeds: [new TextEncoder().encode("pool-authority"), encoder.encode(solanaAddress(PUMP_MINT))],
  });
  const [poolAddress] = await getProgramDerivedAddress({
    programAddress: solanaAddress(PUMP_SWAP_PROGRAM_ID),
    seeds: [new TextEncoder().encode("pool"), new Uint8Array([0, 0]), encoder.encode(poolAuthority), encoder.encode(solanaAddress(PUMP_MINT)), encoder.encode(solanaAddress(MINT))],
  });
  const pool = Buffer.alloc(261);
  Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]).copy(pool);
  pool[8] = 254;
  pool.writeUInt16LE(0, 9);
  Buffer.from(encoder.encode(poolAuthority)).copy(pool, 11);
  Buffer.from(encoder.encode(solanaAddress(PUMP_MINT))).copy(pool, 43);
  Buffer.from(encoder.encode(solanaAddress(MINT))).copy(pool, 75);
  Buffer.from(encoder.encode(solanaAddress(WALLET))).copy(pool, 139);
  Buffer.from(encoder.encode(solanaAddress(PUMP_PROGRAM_ID))).copy(pool, 171);
  pool.writeBigUInt64LE(500n, 245);
  let vaultBalanceCalls = 0;
  const service = new MainnetReadService({
    secrets: new Secrets(), wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (request.method === "getTokenLargestAccounts") return rpcContext(501, [
        { address: WALLET, amount: "600000" },
        { address: MINT, amount: "100000" },
      ]);
      if (request.method === "getTokenAccountBalance") {
        vaultBalanceCalls += 1;
        return rpcContext(504 + vaultBalanceCalls, { amount: vaultBalanceCalls === 1 ? "800000" : "2500000000", decimals: vaultBalanceCalls === 1 ? 6 : 9 });
      }
      if ((request.params[1] as { encoding?: string }).encoding === "jsonParsed") return rpcContext(500, mintAccount("1000000"));
      if (String(request.params[0]) === String(poolAddress)) return rpcContext(503, { owner: PUMP_SWAP_PROGRAM_ID, data: [pool.toString("base64"), "base64"] });
      return rpcContext(502, null);
    },
  });
  const evidence = await service.pumpTokenAnalysis(PUMP_MINT);
  assert.equal(evidence.venue, "pumpswap-migrated");
  assert.equal(evidence.pumpSwapPoolVerified, true);
  assert.equal(evidence.pumpSwapPoolAddress, String(poolAddress));
  assert.equal(evidence.top10ConcentrationPercent, 10);
  assert.equal(evidence.poolBaseReserves, "800000");
  assert.equal(evidence.poolQuoteReserves, "2500000000");
  assert.equal(evidence.pumpSwapEffectiveQuoteReserves, "2500000500");
  assert.doesNotMatch(evidence.warnings.join(" "), /concentration risk is high/u);
});

function rpcContext(slot: number, value: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id: 1, result: { context: { slot }, value } });
}

function mintAccount(supply: string): unknown {
  return { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: { parsed: { type: "mint", info: { decimals: 6, supply, mintAuthority: null, freezeAuthority: null } } } };
}

test("Tavily search sends the credential only as authorization and bounds evidence", async () => {
  const secrets = new Secrets();
  secrets.values.set("tavily-api-key", "tvly-private-key");
  let body = "";
  let authorization = "";
  const service = new MainnetReadService({
    secrets,
    wallets: { listWallets: async () => [] },
    fetch: async (_input, init) => {
      body = String(init?.body);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({ answer: "Current evidence", results: [{ title: "Source", url: "https://example.com/evidence", content: "Evidence", score: 0.9 }] });
    },
  });
  const evidence = await service.search("SOL market news");
  assert.equal(authorization, "Bearer tvly-private-key");
  assert.equal(body.includes("tvly-private-key"), false);
  assert.equal(evidence.results.length, 1);
});
