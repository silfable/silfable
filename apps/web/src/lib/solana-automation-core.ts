import { z } from "zod";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const TokenSchema = z.object({
  mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u, "Invalid Solana mint"),
  symbol: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase()),
  decimals: z.number().int().min(0).max(18),
});

const CommonSchema = z.object({
  sessionId: z.string().regex(/^[0-9a-f]{24}$/iu),
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u),
  input: TokenSchema,
  output: TokenSchema,
  amount: z.string().trim().regex(/^\d+(?:\.\d+)?$/u),
  expiresInDays: z.number().int().min(1).max(365).default(30),
}).superRefine((value, context) => {
  if (value.input.mint === value.output.mint) {
    context.addIssue({ code: "custom", path: ["output", "mint"], message: "Input and output tokens must differ" });
  }
  try {
    if (decimalToRaw(value.amount, value.input.decimals) <= 0n) throw new Error();
  } catch {
    context.addIssue({ code: "custom", path: ["amount"], message: "Amount cannot be represented with the selected token decimals" });
  }
});

export const CreateSolanaAutomationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("DCA"),
    common: CommonSchema,
    intervalSeconds: z.number().int().min(60).max(31_536_000),
    maximumExecutions: z.number().int().min(1).max(365),
  }),
  z.object({
    kind: z.literal("EXIT"),
    common: CommonSchema,
    entryPriceUsd: z.number().positive().max(1_000_000_000),
    takeProfitPriceUsd: z.number().positive().max(1_000_000_000).optional(),
    stopLossPriceUsd: z.number().positive().max(1_000_000_000).optional(),
  }).superRefine((value, context) => {
    if (value.takeProfitPriceUsd == null && value.stopLossPriceUsd == null) {
      context.addIssue({ code: "custom", path: ["takeProfitPriceUsd"], message: "Set at least one take-profit or stop-loss trigger" });
    }
    if (value.takeProfitPriceUsd != null && value.takeProfitPriceUsd <= value.entryPriceUsd) {
      context.addIssue({ code: "custom", path: ["takeProfitPriceUsd"], message: "Take-profit must be above entry price" });
    }
    if (value.stopLossPriceUsd != null && value.stopLossPriceUsd >= value.entryPriceUsd) {
      context.addIssue({ code: "custom", path: ["stopLossPriceUsd"], message: "Stop-loss must be below entry price" });
    }
  }),
]);

export type AutomationEvaluationInput = {
  kind: "DCA" | "EXIT";
  status: string;
  expiresAt: Date;
  nextWakeAt: Date | null;
  completedExecutions: number;
  maximumExecutions: number | null;
  takeProfitPriceUsd: number | null;
  stopLossPriceUsd: number | null;
};

export function evaluateAutomation(input: AutomationEvaluationInput, now: Date, observedPriceUsd?: number): "EXPIRED" | "DCA_DUE" | "TAKE_PROFIT" | "STOP_LOSS" | null {
  if (input.status !== "ACTIVE") return null;
  if (input.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  if (input.kind === "DCA") {
    if (input.maximumExecutions != null && input.completedExecutions >= input.maximumExecutions) return "EXPIRED";
    return input.nextWakeAt && input.nextWakeAt.getTime() <= now.getTime() ? "DCA_DUE" : null;
  }
  if (observedPriceUsd == null || !Number.isFinite(observedPriceUsd) || observedPriceUsd <= 0) return null;
  if (input.stopLossPriceUsd != null && observedPriceUsd <= input.stopLossPriceUsd) return "STOP_LOSS";
  if (input.takeProfitPriceUsd != null && observedPriceUsd >= input.takeProfitPriceUsd) return "TAKE_PROFIT";
  return null;
}

export function decimalToRaw(value: string, decimals: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error("Too many decimal places");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function rawToDecimal(value: string, decimals: number): string {
  const raw = BigInt(value);
  if (decimals === 0) return raw.toString();
  const padded = raw.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
