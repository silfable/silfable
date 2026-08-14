import "server-only";

import { SOL_MINT, USDC_MINT } from "@/lib/solana-automation-core";
import { createOwnedSolanaAutomation } from "@/lib/solana-automation-service";

type Usage = { inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number | null; model: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

const toolDefinition = {
  type: "function",
  function: {
    name: "create_automation_strategy",
    description: "Create one bounded Solana monitor-and-propose strategy in the current session. It cannot sign or broadcast a transaction.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["DCA", "EXIT"] },
        inputToken: { type: "string", description: "SOL or USDC only unless inputMint, inputSymbol, and inputDecimals are all supplied." },
        outputToken: { type: "string", description: "SOL or USDC only unless outputMint, outputSymbol, and outputDecimals are all supplied." },
        inputMint: { type: "string" }, inputSymbol: { type: "string" }, inputDecimals: { type: "integer" },
        outputMint: { type: "string" }, outputSymbol: { type: "string" }, outputDecimals: { type: "integer" },
        amount: { type: "string", description: "Human token amount per DCA cycle or exit amount; never raw units." },
        intervalSeconds: { type: "integer", minimum: 60, maximum: 31536000 },
        maximumExecutions: { type: "integer", minimum: 1, maximum: 365 },
        entryPriceUsd: { type: "number", exclusiveMinimum: 0 },
        takeProfitPriceUsd: { type: "number", exclusiveMinimum: 0 },
        stopLossPriceUsd: { type: "number", exclusiveMinimum: 0 },
        expiresInDays: { type: "integer", minimum: 1, maximum: 365 },
      },
      required: ["kind", "amount"],
    },
  },
} as const;

function knownToken(value: unknown, mint: unknown, symbol: unknown, decimals: unknown) {
  const alias = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (alias === "SOL" || mint === SOL_MINT) return { mint: SOL_MINT, symbol: "SOL", decimals: 9 };
  if (alias === "USDC" || mint === USDC_MINT) return { mint: USDC_MINT, symbol: "USDC", decimals: 6 };
  return { mint, symbol, decimals };
}

function lastUserText(messages: Array<{ role?: "user" | "assistant"; content?: string }>): string {
  return [...messages].reverse().find((message) => message.role === "user" && typeof message.content === "string")?.content ?? "";
}

function inferKnownPair(text: string): { inputToken?: string; outputToken?: string } {
  const pair = /\b(SOL|USDC)\b\s*(?:ke|to|→|->)\s*\b(SOL|USDC)\b/iu.exec(text);
  return pair ? { inputToken: pair[1]?.toUpperCase(), outputToken: pair[2]?.toUpperCase() } : {};
}

function inferAmount(text: string, token: unknown): string | undefined {
  const alias = typeof token === "string" ? token : "SOL|USDC";
  const match = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${alias})\\b`, "iu").exec(text);
  return match?.[1]?.replace(",", ".");
}

function inferIntervalSeconds(text: string): number | undefined {
  const match = /(\d+)\s*(?:seconds?|secs?|detik|minutes?|mins?|menit|hours?|hrs?|jam)/iu.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isInteger(value) || value <= 0) return undefined;
  const unit = match[0].toLowerCase();
  return /hours?|hrs?|jam/u.test(unit) ? value * 3600 : /minutes?|mins?|menit/u.test(unit) ? value * 60 : value;
}

function inferCycles(text: string): number | undefined {
  const match = /(?:selama|for|x)\s*(\d+)\s*(?:kali|times?|cycles?)/iu.exec(text);
  const value = Number(match?.[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function asInteger(value: unknown): number | undefined {
  const number = asFiniteNumber(value);
  return number != null && Number.isInteger(number) ? number : undefined;
}

function parseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

function readUsage(value: unknown, model: string): Usage {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (entry: unknown) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0 ? entry : 0;
  const inputTokens = number(source.prompt_tokens);
  const outputTokens = number(source.completion_tokens);
  return { inputTokens, outputTokens, totalTokens: number(source.total_tokens) || inputTokens + outputTokens, costUsd: source.cost == null ? null : number(source.cost), model };
}

export async function runSolanaAutomationAiTool(input: {
  apiKey: string; model: string; messages: Array<{ role?: "user" | "assistant"; content?: string }>;
  userId: string; sessionId: string; walletAddress: string; maxTokens: number; temperature: number;
}): Promise<{ content: string; usage: Usage; created: boolean }> {
  const history = input.messages.slice(-12).flatMap((message) =>
    (message.role === "user" || message.role === "assistant") && typeof message.content === "string"
      ? [{ role: message.role, content: message.content.slice(0, 8_000) }]
      : [],
  );
  const system = `You are Silfable Web's Solana automation assistant. Use create_automation_strategy exactly once when the user explicitly asks to create DCA, take-profit, stop-loss, or exit automation AND provides every required parameter. Current session and wallet are injected by the application; never ask for or output another wallet. Recognize SOL (${SOL_MINT}, 9 decimals) and USDC (${USDC_MINT}, 6 decimals). For any other token, require its exact mint, symbol, and decimals from the user; never invent them. DCA needs input token, output token, amount, intervalSeconds, and maximumExecutions. Exit needs input token, output token, amount, entryPriceUsd, and at least one of takeProfitPriceUsd or stopLossPriceUsd. If any required detail is missing, ask one concise follow-up and do not call the tool. Strategy expiry defaults to 30 days only if the user did not specify it. This creates monitor-and-propose only: no cloud signing or automatic transaction execution.`;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json", "X-Title": "Silfable Web" },
    body: JSON.stringify({ model: input.model, messages: [{ role: "system", content: system }, ...history], tools: [toolDefinition], tool_choice: "auto", max_tokens: input.maxTokens, temperature: input.temperature }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown } }>; usage?: unknown; error?: { message?: unknown } };
  if (!response.ok) throw new Error(typeof payload.error?.message === "string" ? payload.error.message : `OpenRouter request failed (${response.status})`);
  const message = payload.choices?.[0]?.message;
  const call = Array.isArray(message?.tool_calls)
    ? message.tool_calls.find((candidate): candidate is ToolCall => Boolean(candidate && typeof candidate === "object" && (candidate as ToolCall).function?.name === "create_automation_strategy" && typeof (candidate as ToolCall).function?.arguments === "string"))
    : undefined;
  if (!call) {
    const content = typeof message?.content === "string" && message.content.trim() ? message.content.slice(0, 12_000) : "Provide the strategy details you want to create, and I will prepare it.";
    return { content, usage: readUsage(payload.usage, input.model), created: false };
  }
  const args = parseObject(call.function.arguments);
  if (!args) return { content: "The AI automation parameters are invalid. No strategy was created; provide the strategy details again.", usage: readUsage(payload.usage, input.model), created: false };
  const userText = lastUserText(input.messages);
  const pair = inferKnownPair(userText);
  // An explicit SOL/USDC pair in the user's message is authoritative. Some providers emit
  // a non-string token object despite the function schema, which must not erase that pair.
  const inputToken = pair.inputToken ?? (typeof args.inputToken === "string" ? args.inputToken : undefined);
  const outputToken = pair.outputToken ?? (typeof args.outputToken === "string" ? args.outputToken : undefined);
  const kind = typeof args.kind === "string" ? args.kind.toUpperCase() : "";
  const common = {
    sessionId: input.sessionId,
    walletAddress: input.walletAddress,
    input: knownToken(inputToken, args.inputMint, args.inputSymbol, args.inputDecimals),
    output: knownToken(outputToken, args.outputMint, args.outputSymbol, args.outputDecimals),
    amount: typeof args.amount === "number" ? String(args.amount) : typeof args.amount === "string" ? args.amount : inferAmount(userText, inputToken),
    expiresInDays: asInteger(args.expiresInDays) ?? 30,
  };
  if (kind !== "DCA" && kind !== "EXIT") return { content: "Automation type was not recognized. Specify either DCA or TP/SL; no strategy was created.", usage: readUsage(payload.usage, input.model), created: false };
  const request = kind === "DCA"
    ? { kind: "DCA", common, intervalSeconds: asInteger(args.intervalSeconds) ?? inferIntervalSeconds(userText), maximumExecutions: asInteger(args.maximumExecutions) ?? inferCycles(userText) }
    : { kind: "EXIT", common, entryPriceUsd: asFiniteNumber(args.entryPriceUsd), takeProfitPriceUsd: asFiniteNumber(args.takeProfitPriceUsd), stopLossPriceUsd: asFiniteNumber(args.stopLossPriceUsd) };
  const created = await createOwnedSolanaAutomation({ userId: input.userId, request });
  if (!created.ok) {
    const detail = created.issues.map((issue) => issue.message).filter(Boolean).join(" ");
    return { content: `The strategy was not created because its details are invalid: ${detail}`, usage: readUsage(payload.usage, input.model), created: false };
  }
  const strategy = created.strategy;
  const summary = created.input.kind === "DCA"
    ? `DCA ${strategy.inputSymbol} → ${strategy.outputSymbol} was created: ${created.input.common.amount} ${strategy.inputSymbol} every ${created.input.intervalSeconds} seconds, for a maximum of ${created.input.maximumExecutions} cycles. A proposal will be created when the schedule is due; your browser wallet must still approve the swap.`
    : `TP/SL ${strategy.inputSymbol} → ${strategy.outputSymbol} was created for ${created.input.common.amount} ${strategy.inputSymbol}. TP: ${created.input.takeProfitPriceUsd ?? "—"} USD; SL: ${created.input.stopLossPriceUsd ?? "—"} USD. When a trigger is detected, only a swap proposal is created for review.`;
  return { content: summary, usage: readUsage(payload.usage, input.model), created: true };
}
