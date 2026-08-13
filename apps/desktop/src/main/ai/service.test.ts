import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { MainnetReadService } from "../integrations/read-only.js";
import type { SecretName } from "../storage/keystore.js";
import { AiService } from "./service.js";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

class MemorySecrets {
  readonly values = new Map<SecretName, string>();
  async getSecret(name: SecretName) { return this.values.get(name) ?? null; }
  async setSecret(name: SecretName, plaintext: string) { this.values.set(name, plaintext); }
  async deleteSecret(name: SecretName) { this.values.delete(name); }
}

class MemorySettings {
  readonly values = new Map<string, unknown>();
  getSetting(key: string) { return this.values.get(key) ?? null; }
  setSetting(key: string, value: unknown) { this.values.set(key, value); }
}

test("OpenRouter key remains secret while public settings expose status", async () => {
  const secrets = new MemorySecrets();
  const service = new AiService({ keystore: secrets, settings: new MemorySettings() });
  await service.saveProvider("sk-or-private-test", "openai/gpt-4o-mini");
  assert.deepEqual(await service.listSettings(), [{ provider: "openrouter", configured: true, model: "openai/gpt-4o-mini" }]);
  assert.equal(JSON.stringify(await service.listSettings()).includes("sk-or-private"), false);
  assert.equal(secrets.values.get("openrouter-api-key"), "sk-or-private-test");
});

test("unconfigured OpenRouter cannot start a chat", async () => {
  const service = new AiService({ keystore: new MemorySecrets(), settings: new MemorySettings() });
  await assert.rejects(() => service.chat({ prompt: "hello", mode: "agent", walletAddress: null }), /not configured/u);
});

test("EVM wallet-scoped sessions receive only the typed EVM quote proposal from the trading tool surface", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  secrets.values.set("jupiter-api-key", "jup-test");
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return Response.json({ choices: [{ message: { content: "This lane is not enabled." } }], usage: {} });
  };
  const service = new AiService({
    keystore: secrets,
    settings: new MemorySettings(),
    readService: {} as MainnetReadService,
    evmSwapQuotes: { quote: async () => { throw new Error("The model did not request a quote"); } },
  });
  await service.chat({ prompt: "Swap on EVM", mode: "mission", walletAddress: `0x${"11".repeat(20)}`, walletScope: "evm" });
  const body = JSON.parse(requestBody) as { tools?: Array<{ function?: { name?: string } }> };
  const names = body.tools?.map((tool) => tool.function?.name) ?? [];
  assert.equal(names.includes("robinhood_swap_quote"), true);
  assert.equal(names.includes("mission_contract_preview"), false);
  assert.equal(names.includes("jupiter_swap_quote"), false);
  assert.equal(names.includes("pump_trade_contract_preview"), false);
  assert.equal(names.includes("pump_token_analysis"), false);
});

test("complete Solana DCA instructions bind directly to the active session", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  let createInput: Record<string, unknown> | null = null;
  let providerFetches = 0;
  globalThis.fetch = async () => {
    providerFetches += 1;
    return Response.json({ choices: [{ message: { content: "unexpected" } }], usage: {} });
  };
  const service = new AiService({
    keystore: secrets,
    settings: new MemorySettings(),
    automationManager: {
      createDca: (input: Record<string, unknown>) => {
        createInput = input;
        return { id: "strategy-1", ...input };
      },
    } as never,
  });
  const result = await service.chat({
    prompt: "Buatkan DCA untuk swap 0.5 USDC ke SOL setiap 1 menit 2 kali",
    mode: "mission",
    walletAddress: "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg",
    walletScope: "solana",
    sessionId: "session-real-123",
  });
  assert.equal(providerFetches, 0);
  assert.equal(result.toolsUsed.includes("create_automation_strategy"), true);
  assert.ok(createInput);
  const { expiresAt, ...boundInput } = createInput as unknown as Record<string, unknown>;
  assert.equal(typeof expiresAt, "string");
  assert.deepEqual(boundInput, {
    sessionId: "session-real-123",
    walletAddress: "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg",
    inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    outputMint: "So11111111111111111111111111111111111111112",
    orderAmountRaw: "500000",
    maximumTotalRaw: "1000000",
    intervalSeconds: 60,
    maximumExecutions: 2,
  });
});

test("complete Solana TP/SL instructions bind directly to the active session", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  let createInput: Record<string, unknown> | null = null;
  let providerFetches = 0;
  globalThis.fetch = async () => {
    providerFetches += 1;
    return Response.json({ choices: [{ message: { content: "unexpected" } }], usage: {} });
  };
  const service = new AiService({
    keystore: secrets,
    settings: new MemorySettings(),
    automationManager: {
      createExit: (input: Record<string, unknown>) => {
        createInput = input;
        return { id: "exit-1", ...input };
      },
    } as never,
  });
  const result = await service.chat({
    prompt: "Buat TP 1 USD dan SL 0.01 USD untuk 0.001 SOL ke USDC; entry 0.5 USD",
    mode: "mission",
    walletAddress: "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg",
    walletScope: "solana",
    sessionId: "session-real-123",
  });
  assert.equal(providerFetches, 0);
  assert.equal(result.toolsUsed.includes("create_automation_strategy"), true);
  assert.ok(createInput);
  const { expiresAt, ...boundInput } = createInput as unknown as Record<string, unknown>;
  assert.equal(typeof expiresAt, "string");
  assert.deepEqual(boundInput, {
    sessionId: "session-real-123",
    walletAddress: "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg",
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amountRaw: "1000000",
    entryPriceUsd: 0.5,
    takeProfitPriceUsd: 1,
    stopLossPriceUsd: 0.01,
  });
});

test("direct JUP swap shows an insufficient-balance policy block without calling the provider", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  let providerFetches = 0;
  globalThis.fetch = async () => {
    providerFetches += 1;
    throw new Error("The direct Solana swap route must not call the AI provider");
  };
  const wallet = "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg";
  const service = new AiService({
    keystore: secrets,
    settings: new MemorySettings(),
    readService: {
      portfolio: async () => ({
        address: wallet,
        slot: 1,
        solBalance: "0.01",
        solUsdPrice: 100,
        totalUsd: 1,
        assets: [{
          mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
          amount: "323703",
          decimals: 6,
          uiAmount: "0.323703",
          usdPrice: 0.2,
          usdValue: 0.06,
        }],
        verifiedAt: new Date().toISOString(),
      }),
      swapQuote: async () => ({
        inputMint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        outputMint: "So11111111111111111111111111111111111111112",
        inAmount: "500000",
        outAmount: "1000000",
        router: "metis",
        mode: "ultra",
        feeBps: 2,
        feeMint: "So11111111111111111111111111111111111111112",
        quoteOnly: true,
        verifiedAt: new Date().toISOString(),
      }),
    } as unknown as MainnetReadService,
  });
  const result = await service.chat({
    prompt: "Saya ingin swap 0.5 JUP ke SOL",
    mode: "mission",
    walletAddress: wallet,
    walletScope: "solana",
  });
  assert.equal(providerFetches, 0);
  assert.equal(result.missionPreview?.status, "blocked");
  assert.equal(result.missionPreview?.checks.find((check) => check.code === "balance_sufficient")?.status, "fail");
  assert.match(result.text, /blocked by local policy/u);
});

test("Robinhood ETH and USDG aliases resolve locally from an Indonesian swap request", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  const walletAddress = `0x${"11".repeat(20)}`;
  let providerFetches = 0;
  let quoteInput: Record<string, unknown> | null = null;
  globalThis.fetch = async () => {
    providerFetches += 1;
    throw new Error("The direct alias route must not call the AI provider");
  };
  const proposal = {
    id: "11111111-1111-4111-8111-111111111111",
    quoteId: "22222222-2222-4222-8222-222222222222",
    chainId: 4663,
    chainKey: "robinhood" as const,
    walletAddress,
    slippageBps: 50,
    quote: {
      sellToken: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
      buyToken: "0x0000000000000000000000000000000000000000",
      sellAmount: "500000",
      buyAmount: "250000000000000",
      minBuyAmount: "248750000000000",
      blockNumber: "1",
      zeroExFeeAmount: null,
      zeroExFeeToken: null,
      liquidityAvailable: true,
      sellTokenSymbol: "USDG",
      buyTokenSymbol: "ETH",
      sellTokenMultiplier: "1000000",
      buyTokenMultiplier: "1000000000000000000",
      provider: "uniswap" as const,
      routerAddress: `0x${"22".repeat(20)}`,
      routeNames: ["V3"],
    },
    status: "quote-only" as const,
    createdAt: new Date().toISOString(),
  };
  const service = new AiService({
    keystore: secrets,
    settings: new MemorySettings(),
    evmSwapQuotes: {
      quote: async (input) => {
        quoteInput = input;
        return proposal;
      },
    },
  });

  const result = await service.chat({
    prompt: "bantu saya untuk swap 0.5 usdg ke eth saya",
    mode: "mission",
    walletAddress,
    walletScope: "evm",
    evmChainKey: "robinhood",
  });

  assert.equal(providerFetches, 0);
  assert.deepEqual(quoteInput, {
    walletAddress,
    chainKey: "robinhood",
    sellToken: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    buyToken: "0x0000000000000000000000000000000000000000",
    sellAmount: "500000",
    slippageBps: 50,
  });
  assert.equal(result.evmSwapProposal, proposal);
  assert.deepEqual(result.toolsUsed, ["robinhood_swap_quote"]);
  assert.match(result.text, /USDG → ETH quote prepared/u);
});

test("new Solana wallet sessions expose Jupiter preparation but not legacy Pump or limit-order proposals", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  secrets.values.set("jupiter-api-key", "jup-test");
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return Response.json({ choices: [{ message: { content: "Solana workspace ready." } }], usage: {} });
  };
  const service = new AiService({ keystore: secrets, settings: new MemorySettings(), readService: {} as MainnetReadService });
  await service.chat({ prompt: "Plan a swap", mode: "mission", walletAddress: "11111111111111111111111111111111", walletScope: "solana" });
  const body = JSON.parse(requestBody) as { tools?: Array<{ function?: { name?: string } }> };
  const names = body.tools?.map((tool) => tool.function?.name) ?? [];
  assert.equal(names.includes("mission_contract_preview"), true);
  assert.equal(names.includes("jupiter_swap_quote"), true);
  assert.equal(names.includes("pump_trade_contract_preview"), false);
  assert.equal(names.includes("pump_token_analysis"), false);
  assert.equal(names.includes("limit_order_contract_preview"), false);
});

test("swap mission preview applies a stricter session slippage default when omitted", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  secrets.values.set("jupiter-api-key", "jup-test");
  const wallet = "11111111111111111111111111111111";
  const sol = "So11111111111111111111111111111111111111112";
  const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  let completion = 0;
  globalThis.fetch = async () => {
    completion += 1;
    if (completion === 1) return Response.json({ choices: [{ message: { content: null, tool_calls: [{
      id: "swap-preview",
      type: "function",
      function: { name: "mission_contract_preview", arguments: JSON.stringify({
        goal: "Swap SOL to USDC with local defaults", inputMint: sol, outputMint: usdc, inputAmount: "1000000",
        stopConditions: ["Stop if quote changes"],
      }) },
    }] } }], usage: {} });
    return Response.json({ choices: [{ message: { content: "Preview prepared." } }], usage: {} });
  };
  const service = new AiService({
    keystore: secrets,
    settings: new MemorySettings(),
    transactionSettings: { get: () => ({ maxNetworkFeeLamports: 200_000, maxFeePercent: 5, defaultSlippageBps: 40, maxSlippageBps: 80, defaultDeadlineMinutes: 45, priority: "economy" }) },
    readService: {
      portfolio: async () => ({ address: wallet, slot: 1, solBalance: "1", solUsdPrice: 150, totalUsd: 150, assets: [], verifiedAt: new Date().toISOString() }),
      swapQuote: async () => ({ inputMint: sol, outputMint: usdc, inAmount: "1000000", outAmount: "80000", router: "metis", mode: "ultra", feeBps: 2, feeMint: sol, quoteOnly: true, verifiedAt: new Date().toISOString() }),
    } as unknown as MainnetReadService,
  });
  const started = Date.now();
  const result = await service.chat({
    prompt: "Swap 0.001 SOL to USDC",
    mode: "mission",
    walletAddress: wallet,
    transactionSettings: { maxNetworkFeeLamports: 200_000, maxFeePercent: 5, defaultSlippageBps: 20, maxSlippageBps: 25, defaultDeadlineMinutes: 45, priority: "economy" },
  });
  assert.equal(result.missionPreview?.maxSlippageBps, 20);
  assert.equal(result.missionPreview?.status, "ready-for-review");
  assert.ok(Date.parse(result.missionPreview!.deadlineAt) >= started + 44 * 60_000);
});

test("Pump watchlist sessions expose read-only scoped analysis and no contract proposal tools", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  secrets.values.set("jupiter-api-key", "jup-test");
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return Response.json({ choices: [{ message: { content: "Watchlist remains read-only." } }], usage: {} });
  };
  const service = new AiService({
    keystore: secrets,
    settings: new MemorySettings(),
    readService: { pumpTokenAnalysis: async () => ({}) } as unknown as MainnetReadService,
  });
  await service.chat({
    prompt: "Analyze my watchlist",
    mode: "mission",
    walletAddress: "11111111111111111111111111111111",
    pumpScope: { kind: "watchlist", allowedMints: ["So11111111111111111111111111111111111111112"] },
  });
  const body = JSON.parse(requestBody) as { tools?: Array<{ function?: { name?: string } }> };
  const toolNames = body.tools?.map((tool) => tool.function?.name) ?? [];
  assert.equal(toolNames.includes("pump_token_analysis"), true);
  assert.equal(toolNames.includes("pump_trade_contract_preview"), false);
  assert.equal(toolNames.includes("mission_contract_preview"), false);
  assert.equal(toolNames.includes("limit_order_contract_preview"), false);
});

test("Pump analysis rejects a mint outside the encrypted session scope before RPC", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  let completion = 0;
  let readCalls = 0;
  let secondRequestBody = "";
  globalThis.fetch = async (_input, init) => {
    completion += 1;
    if (completion === 1) return Response.json({
      choices: [{ message: { content: null, tool_calls: [{ id: "off-scope", type: "function", function: { name: "pump_token_analysis", arguments: JSON.stringify({ mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }) } }] } }],
      usage: {},
    });
    secondRequestBody = String(init?.body);
    return Response.json({ choices: [{ message: { content: "That mint is outside this session." } }], usage: {} });
  };
  const service = new AiService({
    keystore: secrets,
    settings: new MemorySettings(),
    readService: { pumpTokenAnalysis: async () => { readCalls += 1; return {}; } } as unknown as MainnetReadService,
  });
  const result = await service.chat({
    prompt: "Analyze another token",
    mode: "mission",
    walletAddress: null,
    pumpScope: { kind: "watchlist", allowedMints: ["So11111111111111111111111111111111111111112"] },
  });
  assert.equal(readCalls, 0);
  assert.deepEqual(result.toolsUsed, []);
  assert.match(secondRequestBody, /outside this session scope/u);
});

test("exact-mint Pump sessions reject an off-scope trade proposal before policy evaluation", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  secrets.values.set("jupiter-api-key", "jup-test");
  let completion = 0;
  let secondRequestBody = "";
  globalThis.fetch = async (_input, init) => {
    completion += 1;
    if (completion === 1) return Response.json({ choices: [{ message: { content: null, tool_calls: [{
      id: "wrong-trade-mint",
      type: "function",
      function: { name: "pump_trade_contract_preview", arguments: JSON.stringify({
        goal: "Buy another token", side: "buy", tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        inputAmount: "1000000", maxSolExposureLamports: "1000000", minimumOutputAmount: "1", maxSlippageBps: 100,
        deadlineAt: "2026-07-22T08:00:00.000Z", stopConditions: ["Stop on any policy failure"],
      }) },
    }] } }], usage: {} });
    secondRequestBody = String(init?.body);
    return Response.json({ choices: [{ message: { content: "The requested mint is outside this session." } }], usage: {} });
  };
  const service = new AiService({ keystore: secrets, settings: new MemorySettings(), readService: {} as MainnetReadService });
  const result = await service.chat({
    prompt: "Prepare a proposal for a different mint",
    mode: "mission",
    walletAddress: "11111111111111111111111111111111",
    pumpScope: { kind: "exact-mint", allowedMints: ["So11111111111111111111111111111111111111112"] },
  });
  assert.deepEqual(result.toolsUsed, []);
  assert.match(secondRequestBody, /outside this exact-mint session scope/u);
});

test("Pump discovery sessions expose only the bounded scanner from the Pump proposal surface", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  secrets.values.set("jupiter-api-key", "jup-test");
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return Response.json({ choices: [{ message: { content: "Scanner is ready for an explicit manual run." } }], usage: {} });
  };
  const service = new AiService({
    keystore: secrets,
    settings: new MemorySettings(),
    readService: { recentPumpCandidates: async () => ({}) } as unknown as MainnetReadService,
  });
  await service.chat({ prompt: "Review scanner boundaries", mode: "mission", walletAddress: "11111111111111111111111111111111", pumpScope: { kind: "discovery", allowedMints: [] } });
  const body = JSON.parse(requestBody) as { tools?: Array<{ function?: { name?: string } }> };
  const names = body.tools?.map((tool) => tool.function?.name) ?? [];
  assert.equal(names.includes("pump_recent_candidates"), true);
  assert.equal(names.includes("pump_token_analysis"), false);
  assert.equal(names.includes("pump_trade_contract_preview"), false);
  assert.equal(names.includes("mission_contract_preview"), false);
  assert.equal(names.includes("limit_order_contract_preview"), false);
});

test("Pump discovery cursor is injected by the trusted session boundary, not the model", { concurrency: false }, async () => {
  const secrets = new MemorySecrets();
  secrets.values.set("openrouter-api-key", "sk-or-test");
  const cursor = "3".repeat(64);
  let completion = 0;
  let scannerInput: unknown;
  globalThis.fetch = async () => {
    completion += 1;
    if (completion === 1) return Response.json({ choices: [{ message: { content: null, tool_calls: [{
      id: "scan-newer",
      type: "function",
      function: { name: "pump_recent_candidates", arguments: JSON.stringify({ signatureLimit: 2 }) },
    }] } }], usage: {} });
    return Response.json({ choices: [{ message: { content: "No newer finalized activity was observed." } }], usage: {} });
  };
  const service = new AiService({
    keystore: secrets,
    settings: new MemorySettings(),
    readService: { recentPumpCandidates: async (input: unknown) => {
      scannerInput = input;
      return {
        source: "recent-program-transactions", programId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", commitment: "finalized",
        scannedSignatures: 0, observedMints: 0, decodedEvents: 0, cursorSignature: cursor, candidates: [], executionAllowed: false,
        disclosure: "Incremental bounded scan only.", scannedAt: "2026-07-22T00:00:00.000Z",
      };
    } } as unknown as MainnetReadService,
  });
  await service.chat({
    prompt: "Scan finalized activity",
    mode: "mission",
    walletAddress: null,
    pumpScope: { kind: "discovery", allowedMints: [], discoveryCursor: cursor },
  });
  assert.deepEqual(scannerInput, { signatureLimit: 2, untilSignature: cursor });
});
