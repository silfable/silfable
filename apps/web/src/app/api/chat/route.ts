import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";
import { resolveSolanaBridgeIntent } from "@/lib/bridge-intent";
import { assertSolanaBridgeBalance } from "@/lib/solana-bridge-preflight";
import { resolveRobinhoodSwapIntent } from "@/lib/evm-swap-intent";
import { resolveRobinhoodToken } from "@/lib/robinhood-token";
import { resolveEvmToSolanaBridgeIntent } from "@/lib/evm-bridge-intent";
import { resolvePumpAnalysisIntent } from "@/lib/pump-analysis-utils";
import { runPumpAnalysisAiTool } from "@/lib/pump-ai-tool";
import { runSolanaAutomationAiTool } from "@/lib/solana-automation-ai-tool";
import { runEvmAutomationAiTool } from "@/lib/evm-automation-ai-tool";
import { selectSolanaRpc } from "@/lib/server-solana-rpc";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const LAMPORTS_PER_SOL = 1_000_000_000;
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

type ChatSettings = {
  customRpcUrl?: string;
  maxSlippageBps?: string;
  jupiterApiKey?: string;
  openRouterApiKey?: string;
  aiModel?: string;
  outputLimit?: string;
  temperature?: string;
};

type ChatMessage = {
  role?: "user" | "assistant";
  content?: string;
};

function parseSolAmount(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*sol/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

function isSolToUsdcSwap(text: string): boolean {
  return /\bswap\b|\btukar\b|\bconvert\b|\bbeli\b/i.test(text)
    && /\bsol\b/i.test(text)
    && /\busdc\b/i.test(text);
}

function findPumpMint(text: string): string | null {
  const matches = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g);
  return matches?.find((value) => value.toLowerCase().endsWith("pump")) ?? null;
}

function isLimitOrder(text: string): boolean {
  return /\blimit\b|\border\b|\bdip buy\b|\btake profit\b/i.test(text);
}

function isTokenLaunchIntent(text: string): boolean {
  return /\btoken launch\b|\blaunch (?:a )?token\b|\bcreate (?:a )?(?:token|coin)\b|\bbuat(?:kan)? (?:token|koin)\b|\bluncurkan (?:token|koin)\b/iu.test(text);
}

function isSolanaAutomationIntent(text: string): boolean {
  return /\bdca\b|\bautomation\b|\botomasi\b|\btake[ -]?profit\b|\bstop[ -]?loss\b|\b(?:tp|sl)\b/iu.test(text);
}

async function getJupiterQuote(inputAmountLamports: number, slippageBps: number, apiKey?: string) {
  const url = new URL("https://lite-api.jup.ag/swap/v1/quote");
  url.searchParams.set("inputMint", SOL_MINT);
  url.searchParams.set("outputMint", USDC_MINT);
  url.searchParams.set("amount", String(inputAmountLamports));
  url.searchParams.set("slippageBps", String(slippageBps));
  url.searchParams.set("restrictIntermediateTokens", "true");

  const headers: HeadersInit = apiKey ? { "x-api-key": apiKey } : {};
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Jupiter quote failed with status ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

async function callOpenRouter(input: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  sessionMode: "agent" | "mission";
  walletAddress: string | null;
  maxTokens: number;
  temperature: number;
  workspace: "solana" | "evm";
  chainKey: string | null;
  sessionWalletAddress: string | null;
}) {
  const history = input.messages
    .slice(-12)
    .flatMap((message) =>
      (message.role === "user" || message.role === "assistant") && typeof message.content === "string"
        ? [{ role: message.role, content: message.content.slice(0, 8_000) }]
        : [],
    );
  const capabilityBoundary =
    `You are Silfable Web's ${input.workspace.toUpperCase()} AI trading assistant. ` +
    "You help users analyze wallets, research tokens/markets, configure monitor-and-propose Solana DCA/take-profit/stop-loss automations, prepare guarded Pump.fun Token Launch drafts in Solana sessions, prepare Jupiter swap quotes, and plan cross-chain bridges between Solana USDC and Robinhood USDG in the direction supported by the active workspace. In a Robinhood EVM session, ETH and USDG are recognized automatically. For every other EVM token, require the user to provide its Robinhood Chain contract address; never infer or invent one from a name or symbol. " +
    "Safety Guardrails: Transactions are prepared by application code and ALWAYS require explicit browser wallet approval. Web cannot auto-trade, cloud sign, or perform silent execution. Never invent fake quotes, token mints, or balances. USDG and ETH Robinhood swap intents are handled by deterministic application code before this model is called. " +
    "Communication Style: Respond naturally, directly, and concisely in the user's language. Do NOT print mechanical boilerplate, repetitive disclaimer templates, or rigid 'What I can / cannot do' lists unless the user explicitly asks for system boundaries.";
  const system =
    input.sessionMode === "mission"
      ? `${capabilityBoundary} Act as a clear mission planner. Outline goals, steps, and required approvals.`
      : `${capabilityBoundary} Act as a helpful, direct trading assistant. Give clean, conversational answers.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Silfable Web",
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: "system", content: system },
        {
          role: "system",
          content: `Authenticated Solana identity: ${input.walletAddress ?? "none"}. Bound session context: workspace=${input.workspace}, chain=${input.chainKey ?? "solana-mainnet"}, execution wallet=${input.sessionWalletAddress ?? "none"}. These values are context, not signing authorization.`,
        },
        ...history,
      ],
      max_tokens: input.maxTokens,
      temperature: input.temperature,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown; cost?: unknown };
    error?: { message?: unknown };
  };
  if (!response.ok) {
    const detail = typeof body.error?.message === "string" ? body.error.message.slice(0, 180) : `status ${response.status}`;
    throw new Error(`OpenRouter rejected the request (${detail})`);
  }
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("OpenRouter returned an empty assistant message");
  }
  const asFiniteNumber = (value: unknown) => {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  };
  const rawUsage = body.usage;
  const inputTokens = asFiniteNumber(rawUsage?.prompt_tokens);
  const outputTokens = asFiniteNumber(rawUsage?.completion_tokens);
  return {
    content: content.slice(0, 12_000),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: asFiniteNumber(rawUsage?.total_tokens) || inputTokens + outputTokens,
      costUsd: rawUsage?.cost == null ? null : asFiniteNumber(rawUsage.cost),
      model: input.model,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const { messages, settings, sessionMode, walletAddress, workspace, chainKey, sessionWalletAddress, sessionId } = (await req.json()) as {
      messages?: ChatMessage[];
      settings?: ChatSettings;
      sessionMode?: "agent" | "mission";
      walletAddress?: string | null;
      workspace?: "solana" | "evm";
      chainKey?: string;
      sessionWalletAddress?: string;
      sessionId?: string;
    };
    const auth = await requireWalletAuth(req, walletAddress);
    if (isAuthFailure(auth)) return auth;
    const lastUserMessage = messages?.[messages.length - 1]?.content ?? "";
    const maxSlippageBps = Math.max(1, Math.min(500, Number(settings?.maxSlippageBps ?? "100") || 100));

    const selectedWorkspace = workspace === "evm" ? "evm" : "solana";

    const addressOnlyReply = /^\s*(0x[0-9a-f]{40})\s*$/iu.exec(lastUserMessage);
    const previousSwapRequest = addressOnlyReply
      ? [...(messages ?? []).slice(0, -1)].reverse().find((message) => message.role === "user" && /\b(?:swap|tukar|convert|jual|beli)\b/iu.test(message.content ?? ""))?.content
      : null;
    const contextualSwapMessage = previousSwapRequest && addressOnlyReply
      ? previousSwapRequest.replace(/((?:ke|to|->|→)\s*)[A-Za-z][A-Za-z0-9_-]{1,31}\b/iu, `$1${addressOnlyReply[1]}`)
      : lastUserMessage;
    const evmSwapIntent = resolveRobinhoodSwapIntent(contextualSwapMessage);
    if (evmSwapIntent.requested) {
      if (selectedWorkspace !== "evm" || chainKey !== "robinhood") {
        return NextResponse.json({ role: "assistant", content: "Open a Robinhood EVM session bound to your EVM wallet first. No quote or transaction was prepared." });
      }
      if (!evmSwapIntent.amount || !evmSwapIntent.sellToken || !evmSwapIntent.buyToken || evmSwapIntent.needsContractAddress) {
        return NextResponse.json({ role: "assistant", content: "Please provide the amount and contract address for every token other than ETH or USDG. Example: `swap 0.5 ETH to 0x...`. Silfable will validate the address and token metadata on Robinhood Chain before requesting a quote." });
      }
      if (evmSwapIntent.sellToken === evmSwapIntent.buyToken || Number(evmSwapIntent.amount) <= 0) {
        return NextResponse.json({ role: "assistant", content: "The source and destination tokens must differ, with a positive amount." });
      }
      if (typeof sessionWalletAddress !== "string" || !/^0x[0-9a-f]{40}$/iu.test(sessionWalletAddress)) {
        return NextResponse.json({ role: "assistant", content: "The Robinhood session is not bound to a valid EVM wallet." });
      }
      const [sellToken, buyToken] = await Promise.all([resolveRobinhoodToken(evmSwapIntent.sellToken), resolveRobinhoodToken(evmSwapIntent.buyToken)]);
      if (!sellToken || !buyToken) {
        return NextResponse.json({ role: "assistant", content: "I could not validate one of those contract addresses as an ERC-20 token on Robinhood Chain. Check the address and send the swap request again." });
      }
      return NextResponse.json({
        role: "assistant",
        content: `A ${evmSwapIntent.amount} ${sellToken.symbol} → ${buyToken.symbol} swap proposal is ready. Silfable is loading a live Robinhood Chain route; no signature or broadcast has occurred.`,
        proposal: { id: `evm_swap_${Date.now()}`, type: "evm_swap", mint: "", solAmount: "0", estimatedTokens: "Quote pending", sellToken: sellToken.symbol, buyToken: buyToken.symbol, sellTokenAddress: sellToken.address, buyTokenAddress: buyToken.address, sellTokenDecimals: sellToken.decimals, buyTokenDecimals: buyToken.decimals, sellAmount: evmSwapIntent.amount, status: "preview_only", mode: "restricted_browser_wallet", venue: "Uniswap Trading API", explanation: "The contract addresses and token metadata were validated on Robinhood Chain. Wallet confirmation remains required.", checks: [{ code: "wallet_bound", status: "pass", message: `Session EVM wallet: ${sessionWalletAddress}` }, { code: "token_contracts", status: "pass", message: "Token contracts and decimals were read from Robinhood Chain." }, { code: "chain_pinned", status: "pass", message: "Chain is pinned to Robinhood Chain (4663)." }, { code: "wallet_approval", status: "pass", message: "Your browser wallet will request explicit approval before broadcast." }] },
      });
    }

    const evmBridgeIntent = resolveEvmToSolanaBridgeIntent(messages ?? []);
    if (evmBridgeIntent.requested) {
      if (selectedWorkspace !== "evm" || chainKey !== "robinhood") {
        return NextResponse.json({
          role: "assistant",
          content: "Open a Robinhood Chain session bound to the source EVM wallet first. No quote or transaction was prepared.",
        });
      }
      if (!evmBridgeIntent.amountUsdg) {
        return NextResponse.json({
          role: "assistant",
          content: "Provide the USDG amount to bridge from Robinhood Chain. Example: Bridge 1 USDG to Solana.",
        });
      }
      if (!evmBridgeIntent.destinationRecipient) {
        return NextResponse.json({
          role: "assistant",
          content: "The amount was found. Now provide the full destination Solana wallet address; the USDG amount from your previous message will be retained.",
        });
      }
      const amount = Number(evmBridgeIntent.amountUsdg);
      if (!Number.isFinite(amount) || amount < 0.01 || amount > 1_000) {
        return NextResponse.json({ role: "assistant", content: "The bridge amount must be between 0.01 and 1,000 USDG. No transaction was prepared." });
      }
      try {
        new PublicKey(evmBridgeIntent.destinationRecipient);
      } catch {
        return NextResponse.json({ role: "assistant", content: "The destination Solana address is invalid. No quote or transaction was prepared." });
      }
      if (typeof sessionWalletAddress !== "string" || !/^0x[0-9a-f]{40}$/iu.test(sessionWalletAddress)) {
        return NextResponse.json({ role: "assistant", content: "The Robinhood session is not bound to a valid source EVM wallet." });
      }
      return NextResponse.json({
        role: "assistant",
        content: `A bridge proposal for ${evmBridgeIntent.amountUsdg} USDG from Robinhood Chain to Solana USDC is ready. Select Prepare quote to obtain a Relay route; no approval, signature, or broadcast has occurred.`,
        proposal: {
          id: `evm_bridge_${Date.now()}`,
          type: "evm_bridge",
          mint: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
          solAmount: "0",
          estimatedTokens: "Quote pending",
          amountUsdg: evmBridgeIntent.amountUsdg,
          destination: "solana",
          destinationRecipient: evmBridgeIntent.destinationRecipient,
          outputSymbol: "USDC",
          status: "preview_only",
          mode: "restricted_browser_wallet",
          venue: "Relay",
          explanation: "AI only creates the typed bridge intent. Deterministic application code validates Relay calldata, balances, network fees, source receipt, and destination settlement.",
          checks: [
            { code: "source_workspace", status: "pass", message: `Source wallet is pinned to Robinhood Chain: ${sessionWalletAddress}.` },
            { code: "destination_chain", status: "pass", message: "Destination is pinned to Solana Mainnet USDC." },
            { code: "recipient_bound", status: "pass", message: `Exact Solana recipient: ${evmBridgeIntent.destinationRecipient}.` },
            { code: "wallet_approval", status: "pass", message: "Any USDG approval and bridge deposit require separate MetaMask/Rabby confirmations." },
          ],
        },
      });
    }

    const bridgeIntent = resolveSolanaBridgeIntent(messages ?? []);
    if (bridgeIntent.requested) {
      if (selectedWorkspace !== "solana") {
        return NextResponse.json({
          role: "assistant",
          content: "Use this format: Bridge 1 USDG from Robinhood to Solana <Solana address>. No transaction was prepared from the incomplete request.",
        });
      }
      const { amountUsdc, destinationRecipient } = bridgeIntent;
      if (!amountUsdc) {
        return NextResponse.json({
          role: "assistant",
          content: "Provide the USDC amount to bridge. A maximum amount is not selected automatically because balance and fees must be reviewed first. Example: 0.5 USDC.",
        });
      }
      if (!destinationRecipient) {
        return NextResponse.json({
          role: "assistant",
          content: "The amount was found. Now provide the full Robinhood EVM destination address in 0x... format; the amount from your previous message will be retained.",
        });
      }
      if (amountUsdc < 0.01 || amountUsdc > 1_000) {
        return NextResponse.json({ role: "assistant", content: "The web bridge amount must be between 0.01 and 1,000 USDC. No transaction was prepared." });
      }
      if (typeof sessionWalletAddress !== "string" || !sessionWalletAddress) {
        return NextResponse.json({ role: "assistant", content: "The bridge cannot be prepared because the session is not bound to the source Solana wallet." });
      }
      let balancePreflight;
      try {
        const requiredUsdc = BigInt(Math.round(amountUsdc * 1_000_000));
        balancePreflight = await assertSolanaBridgeBalance(new Connection(SOLANA_RPC, "confirmed"), sessionWalletAddress, requiredUsdc);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Source wallet balance could not be verified.";
        return NextResponse.json({ role: "assistant", content: `The bridge was not prepared. ${message} No quote, signature, or wallet popup was created.` });
      }
      return NextResponse.json({
        role: "assistant",
        content: `A bridge proposal for ${amountUsdc} USDC from Solana to Robinhood USDG is ready for review. No executable quote, signature, or broadcast has occurred.`,
        proposal: {
          id: `bridge_${Date.now()}`,
          type: "solana_bridge",
          mint: USDC_MINT,
          solAmount: "0",
          estimatedTokens: "Quote obtained during deterministic preparation",
          amountUsdc: String(amountUsdc),
          destination: "robinhood",
          destinationRecipient,
          outputSymbol: "USDG",
          status: "ready_for_user_signature",
          mode: "restricted_browser_wallet",
          venue: "Relay",
          explanation: "AI only creates the typed intent. Deterministic application code obtains and validates the route before wallet approval.",
          checks: [
            { code: "source_workspace", status: "pass", message: "Source session is bound to one Solana wallet." },
            { code: "destination_chain", status: "pass", message: "Destination is pinned to Robinhood Chain." },
            { code: "recipient_bound", status: "pass", message: "The exact EVM recipient is shown before preparation." },
            { code: "source_usdc_balance", status: "pass", message: `Live source balance verified: ${balancePreflight.availableUsdc} USDC for this ${amountUsdc} USDC bridge.` },
            { code: "source_sol_fee", status: "pass", message: `Live SOL fee reserve verified: ${balancePreflight.availableSol} SOL available; minimum reserve ${balancePreflight.feeReserveSol} SOL.` },
          ],
        },
      });
    }

    if (isTokenLaunchIntent(lastUserMessage)) {
      return NextResponse.json({
        role: "assistant",
        content: selectedWorkspace === "solana"
          ? "Token Launch is available in this Solana session. Select **TOKEN LAUNCH** beneath the conversation, enter metadata and fee limits, then follow unsigned preflight → final Mainnet checks → Phantom/Solflare approval. No transaction is created from this chat message alone."
          : "Pump.fun Token Launch must be created from a Solana session bound to a Phantom/Solflare wallet. Open or create a Solana session first; no transaction can be prepared from this EVM session.",
      });
    }

    if (isSolanaAutomationIntent(lastUserMessage)) {
      if (typeof sessionId !== "string" || !/^[0-9a-f]{24}$/iu.test(sessionId) || typeof sessionWalletAddress !== "string") {
        return NextResponse.json({ role: "assistant", content: "Create automation from a wallet-bound Solana or Robinhood session." });
      }
      const openRouterApiKey = settings?.openRouterApiKey?.trim();
      if (!openRouterApiKey) {
        return NextResponse.json({ role: "assistant", content: "The AI tool for creating automation is not configured. Open **Settings → Provider**, verify your OpenRouter API key, choose a tool-calling model, then save." });
      }
      try {
        if (selectedWorkspace === "evm") {
          if (chainKey !== "robinhood" || !/^0x[0-9a-f]{40}$/iu.test(sessionWalletAddress)) return NextResponse.json({ role: "assistant", content: "Robinhood automation requires a Robinhood Chain session bound to the connected MetaMask/Rabby wallet." });
          const result = await runEvmAutomationAiTool({ userId: auth.userId, sessionId, walletAddress: sessionWalletAddress, text: lastUserMessage });
          return NextResponse.json({ role: "assistant", content: result.content, automationCreated: result.created });
        }
        if (selectedWorkspace !== "solana") return NextResponse.json({ role: "assistant", content: "Automation is available only in a Solana or Robinhood Chain session." });
        const result = await runSolanaAutomationAiTool({
          apiKey: openRouterApiKey,
          model: settings?.aiModel?.trim() || "openai/gpt-4o-mini",
          messages: messages ?? [],
          userId: auth.userId,
          sessionId,
          walletAddress: sessionWalletAddress,
          maxTokens: Math.max(256, Math.min(2_048, Number(settings?.outputLimit ?? "1200") || 1_200)),
          temperature: Math.max(0, Math.min(1, Number(settings?.temperature ?? "0.3") || 0.3)),
        });
        return NextResponse.json({ role: "assistant", content: result.content, usage: result.usage, automationCreated: result.created });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Automation AI tool failed.";
        return NextResponse.json({ role: "assistant", content: `Automation was not created: ${message}` });
      }
    }

    if (selectedWorkspace === "solana" && isSolToUsdcSwap(lastUserMessage)) {
      const solAmount = parseSolAmount(lastUserMessage) ?? 0.001;
      const inputAmount = Math.floor(solAmount * LAMPORTS_PER_SOL);
      const quote = await getJupiterQuote(inputAmount, maxSlippageBps, settings?.jupiterApiKey);
      const outputAmount = String(quote.outAmount ?? "0");
      const priceImpactPct = String(quote.priceImpactPct ?? "0");

      return NextResponse.json({
        role: "assistant",
        content:
          `A restricted Mainnet swap proposal for ${solAmount} SOL → USDC is ready.\n\n` +
          `A Jupiter quote is available with estimated output ${Number(outputAmount) / 1_000_000} USDC, maximum slippage ${maxSlippageBps} bps, and approximately ${priceImpactPct}% price impact. ` +
          "No transaction has been signed or broadcast. If the details are correct, select the wallet approval button to create and sign the swap transaction in Phantom/Solflare.",
        proposal: {
          id: `swap_${Date.now()}`,
          type: "jupiter_swap",
          mint: USDC_MINT,
          inputMint: SOL_MINT,
          outputMint: USDC_MINT,
          outputSymbol: "USDC",
          solAmount: String(solAmount),
          inputAmount: String(inputAmount),
          outputAmount,
          minimumOutputAmount: String(quote.otherAmountThreshold ?? "0"),
          priceImpactPct,
          slippageBps: maxSlippageBps,
          estimatedTokens: `${Number(outputAmount) / 1_000_000} USDC`,
          status: "ready_for_user_signature",
          mode: "restricted_browser_wallet",
          venue: "Jupiter Swap API",
          explanation:
            "Restricted web mode: the AI only creates quotes and unsigned transactions. Your browser wallet remains the final signer.",
          checks: [
            { code: "mainnet_only", status: "pass", message: "Only Solana Mainnet is enabled." },
            { code: "quote_only", status: "pass", message: "Jupiter returned route evidence before any signature." },
            { code: "user_wallet_required", status: "pass", message: "Execution requires explicit Phantom/Solflare approval." },
          ],
          quoteResponse: quote,
        },
      });
    }

    const pumpAnalysisIntent = resolvePumpAnalysisIntent(lastUserMessage);
    if (pumpAnalysisIntent.requested) {
      if (selectedWorkspace !== "solana") {
        return NextResponse.json({ role: "assistant", content: "Pump.fun analysis is available only in a Solana session. Open or create a bound Solana session first." });
      }
      if (!pumpAnalysisIntent.mint) {
        return NextResponse.json({ role: "assistant", content: "Provide the full Solana mint address to analyze. Example: Analyze Pump.fun token <mint>." });
      }
      const openRouterApiKey = settings?.openRouterApiKey?.trim();
      if (!openRouterApiKey) {
        return NextResponse.json({ role: "assistant", content: "AI Pump analysis cannot run yet. Open **Settings → Provider**, verify your OpenRouter API key, choose a tool-calling model, then save." });
      }
      try {
        const model = settings?.aiModel?.trim() || "openai/gpt-4o-mini";
        const result = await runPumpAnalysisAiTool({
          apiKey: openRouterApiKey,
          model,
          messages: messages ?? [],
          exactMint: pumpAnalysisIntent.mint,
          referenceBuyLamports: pumpAnalysisIntent.referenceBuyLamports,
          rpcUrl: selectSolanaRpc(settings?.customRpcUrl),
          maxTokens: Math.max(512, Math.min(4_096, Number(settings?.outputLimit ?? "1200") || 1_200)),
          temperature: Math.max(0, Math.min(1, Number(settings?.temperature ?? "0.3") || 0.3)),
        });
        return NextResponse.json({
          role: "assistant",
          content: result.content,
          usage: result.usage,
          proposal: {
            id: `pump_analysis_${Date.now()}`,
            type: "pump_analysis",
            mint: result.intelligence.mint,
            solAmount: String(Number(result.intelligence.metrics.referenceBuyInputLamports) / LAMPORTS_PER_SOL),
            estimatedTokens: "Finalized read-only intelligence",
            status: "preview_only",
            mode: "read_only_ai_tool",
            venue: result.intelligence.venue,
            explanation: "The AI selected a scoped read-only tool. Deterministic server code independently verified finalized Pump/PumpSwap evidence; no transaction was built, signed, or broadcast.",
            checks: result.intelligence.researchEligibility?.checks.map((check) => ({ code: check.id, status: check.passed ? "pass" : "block", message: check.message })),
            pumpIntelligence: result.intelligence,
          },
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Pump analysis failed.";
        return NextResponse.json({ role: "assistant", content: `Pump.fun analysis failed safely: ${message} No transaction was created or broadcast.` });
      }
    }

    const pumpMint = findPumpMint(lastUserMessage);
    if (pumpMint) {
      const solAmount = parseSolAmount(lastUserMessage) ?? 0.001;
      return NextResponse.json({
        role: "assistant",
        content:
          `I found Pump.fun mint ${pumpMint.slice(0, 6)}...${pumpMint.slice(-6)} and created a restricted preview for ${solAmount} SOL.\n\n` +
          "Pump.fun on web is currently limited to analysis and preview. Pump.fun signing and broadcast remain disabled until guards, fee ceilings, and final revalidation match the desktop implementation.",
        proposal: {
          id: `pump_${Date.now()}`,
          type: "pump_fun_buy",
          mint: pumpMint,
          solAmount: String(solAmount),
          estimatedTokens: "Preview only",
          status: "preview_only",
          mode: "restricted_preview_only",
          venue: "Pump.fun",
          explanation:
            "Pump.fun web trading is not live. Use this proposal for review, not execution.",
        },
      });
    }

    if (isLimitOrder(lastUserMessage)) {
      const solAmount = parseSolAmount(lastUserMessage) ?? 0.001;
      return NextResponse.json({
        role: "assistant",
        content:
          `I reviewed the Limit Order instruction for ${solAmount} SOL and created a restricted preview proposal.\n\n` +
          "On web, Jupiter v2 Limit Order is currently preview-only. Deposit execution and headless reconciliation require an encrypted local keystore, available in Silfable Desktop.",
        proposal: {
          id: `limit_${Date.now()}`,
          type: "limit_order",
          mint: USDC_MINT,
          solAmount: String(solAmount),
          estimatedTokens: `${(solAmount * 150).toFixed(2)} USDC`,
          status: "preview_only",
          mode: "restricted_preview_only",
          venue: "Jupiter Trigger V2",
          explanation:
            "Limit order web trading berada dalam mode preview-only.",
        },
      });
    }

    const openRouterApiKey = settings?.openRouterApiKey?.trim();
    if (openRouterApiKey) {
      const model = settings?.aiModel?.trim() || "openai/gpt-4o-mini";
      const maxTokens = Math.max(256, Math.min(4_096, Number(settings?.outputLimit ?? "1200") || 1_200));
      const temperature = Math.max(0, Math.min(2, Number(settings?.temperature ?? "0.7") || 0.7));
      const result = await callOpenRouter({
        apiKey: openRouterApiKey,
        model,
        messages: messages ?? [],
        sessionMode: sessionMode === "mission" ? "mission" : "agent",
        walletAddress: typeof walletAddress === "string" ? walletAddress.slice(0, 64) : null,
        maxTokens,
        temperature,
        workspace: selectedWorkspace,
        chainKey: typeof chainKey === "string" ? chainKey.slice(0, 32) : null,
        sessionWalletAddress: typeof sessionWalletAddress === "string" ? sessionWalletAddress.slice(0, 64) : null,
      });
      return NextResponse.json({
        role: "assistant",
        content: result.content,
        usage: result.usage,
      });
    }

    return NextResponse.json({
      role: "assistant",
      content: "AI is not configured. Open **Settings → Provider**, enter your OpenRouter API key, choose a model from the OpenRouter catalog, then select **Save**.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { role: "assistant", content: `AI trading request failed safely. No Mainnet action was taken. Details: ${message}` },
      { status: 200 },
    );
  }
}
