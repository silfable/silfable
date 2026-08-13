import "server-only";

import type { PumpTokenIntelligence } from "@silfable/contracts";

import { analyzePumpToken } from "@/lib/pump-analysis-core";

type ToolMessage = { role: "user" | "assistant"; content?: string | null; tool_calls?: unknown };
type Usage = { inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number | null; model: string };

export async function runPumpAnalysisAiTool(input: {
  apiKey: string;
  model: string;
  messages: Array<{ role?: "user" | "assistant"; content?: string }>;
  exactMint: string;
  referenceBuyLamports: string;
  rpcUrl: string;
  maxTokens: number;
  temperature: number;
}): Promise<{ content: string; intelligence: PumpTokenIntelligence; usage: Usage }> {
  const history = input.messages.slice(-10).flatMap((message) =>
    (message.role === "user" || message.role === "assistant") && typeof message.content === "string"
      ? [{ role: message.role, content: message.content.slice(0, 8_000) } satisfies ToolMessage]
      : [],
  );
  const system = "You are Silfable Web's read-only Pump.fun token research assistant. For the exact mint supplied by the user, call pump_token_analysis exactly once. Treat the returned finalized RPC evidence as authoritative. Summarize venue verification, authorities, holder concentration, liquidity/reserves, curve progress, the size-specific reserve-only buy/sell-back path, failed eligibility checks, and material warnings. Never claim that a token is safe, recommend a trade, or claim signing/broadcast authority. Reply concisely in the user's language.";
  const tools = [{
    type: "function",
    function: {
      name: "pump_token_analysis",
      description: "Verify finalized read-only Pump.fun and canonical PumpSwap evidence for one exact Solana mint. This tool cannot sign or broadcast.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          mint: { type: "string", description: `Exact scoped mint: ${input.exactMint}` },
          referenceBuyLamports: { type: "string", description: "SOL reference analysis size in lamports; not spending authority." },
        },
        required: ["mint", "referenceBuyLamports"],
      },
    },
  }];

  let first: Awaited<ReturnType<typeof openRouterRequest>>;
  try {
    first = await openRouterRequest(input, {
      messages: [{ role: "system", content: system }, ...history],
      tools,
      tool_choice: { type: "function", function: { name: "pump_token_analysis" } },
    });
  } catch {
    const intelligence = await analyzePumpToken(input.rpcUrl, input.exactMint, input.referenceBuyLamports);
    return { content: formatDeterministicPumpSummary(intelligence), intelligence, usage: emptyUsage(input.model) };
  }
  const firstMessage = first.message;
  const toolCall = Array.isArray(firstMessage.tool_calls)
    ? firstMessage.tool_calls.find((candidate) => isPumpToolCall(candidate)) as PumpToolCall | undefined
    : undefined;
  const argumentsValue = toolCall ? parseToolArguments(toolCall.function.arguments) : null;
  const requestedMint = typeof argumentsValue?.mint === "string" ? argumentsValue.mint : input.exactMint;
  if (requestedMint !== input.exactMint) throw new Error("AI requested Pump analysis outside the exact mint scope.");
  const requestedReference = typeof argumentsValue?.referenceBuyLamports === "string" && /^[1-9]\d*$/u.test(argumentsValue.referenceBuyLamports)
    ? argumentsValue.referenceBuyLamports
    : input.referenceBuyLamports;
  const intelligence = await analyzePumpToken(input.rpcUrl, input.exactMint, requestedReference);

  if (!toolCall) {
    return { content: formatDeterministicPumpSummary(intelligence), intelligence, usage: usage(first.usage, input.model) };
  }
  let second: Awaited<ReturnType<typeof openRouterRequest>>;
  try {
    second = await openRouterRequest(input, {
      messages: [
        { role: "system", content: system },
        ...history,
        firstMessage,
        { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(intelligence) },
      ],
    });
  } catch {
    return { content: formatDeterministicPumpSummary(intelligence), intelligence, usage: usage(first.usage, input.model) };
  }
  const combined = combineUsage(usage(first.usage, input.model), usage(second.usage, input.model));
  const content = typeof second.message.content === "string" && second.message.content.trim()
    ? second.message.content.slice(0, 12_000)
    : formatDeterministicPumpSummary(intelligence);
  return { content, intelligence, usage: combined };
}

export function formatDeterministicPumpSummary(value: PumpTokenIntelligence): string {
  const eligibility = value.researchEligibility;
  const blocked = eligibility?.checks.filter((check) => !check.passed).length ?? 0;
  const venue = value.venue.replace(/-/gu, " ");
  const concentration = value.top10ConcentrationPercent === null ? "unavailable" : `${value.top10ConcentrationPercent.toFixed(2)}%`;
  return `Finalized analysis for mint ${value.mint.slice(0, 6)}…${value.mint.slice(-6)} is complete. Verified venue: ${venue}. Top-10 non-venue holder concentration: ${concentration}. Research status: ${eligibility?.status ?? "blocked"}${blocked ? ` with ${blocked} checks not passed` : ""}. Review the evidence card for authority, reserve, price impact, and warnings. This analysis does not authorize a transaction.`;
}

type PumpToolCall = { id: string; type: "function"; function: { name: "pump_token_analysis"; arguments: string } };

function isPumpToolCall(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const call = value as { id?: unknown; type?: unknown; function?: { name?: unknown; arguments?: unknown } };
  return typeof call.id === "string" && call.type === "function" && call.function?.name === "pump_token_analysis" && typeof call.function.arguments === "string";
}

function parseToolArguments(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function openRouterRequest(
  input: { apiKey: string; model: string; maxTokens: number; temperature: number },
  body: Record<string, unknown>,
): Promise<{ message: { role: "assistant"; content?: unknown; tool_calls?: unknown }; usage?: unknown }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json", "X-Title": "Silfable Web" },
    body: JSON.stringify({ model: input.model, max_tokens: input.maxTokens, temperature: input.temperature, ...body }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json() as {
    choices?: Array<{ message?: { role?: unknown; content?: unknown; tool_calls?: unknown } }>;
    usage?: unknown;
    error?: { message?: unknown };
  };
  if (!response.ok) {
    const detail = typeof payload.error?.message === "string" ? payload.error.message.slice(0, 180) : `status ${response.status}`;
    throw new Error(`OpenRouter rejected the Pump analysis tool request (${detail}).`);
  }
  const message = payload.choices?.[0]?.message;
  if (!message) throw new Error("OpenRouter returned no Pump analysis tool message.");
  return { message: { role: "assistant", content: message.content, tool_calls: message.tool_calls }, usage: payload.usage };
}

function usage(value: unknown, model: string): Usage {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (entry: unknown) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0 ? entry : 0;
  const inputTokens = number(raw.prompt_tokens);
  const outputTokens = number(raw.completion_tokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: number(raw.total_tokens) || inputTokens + outputTokens,
    costUsd: raw.cost == null ? null : number(raw.cost),
    model,
  };
}

function combineUsage(first: Usage, second: Usage): Usage {
  return {
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
    totalTokens: first.totalTokens + second.totalTokens,
    costUsd: first.costUsd === null && second.costUsd === null ? null : (first.costUsd ?? 0) + (second.costUsd ?? 0),
    model: second.model,
  };
}

function emptyUsage(model: string): Usage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: null, model };
}
