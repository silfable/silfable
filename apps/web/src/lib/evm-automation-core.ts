import { z } from "zod";

export const ROBINHOOD_NATIVE_ETH = "0x0000000000000000000000000000000000000000";
export const ROBINHOOD_USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

const TokenSchema = z.object({
  symbol: z.enum(["ETH", "USDG"]),
  decimals: z.number().int().refine((value) => value === 18 || value === 6),
});

const CommonSchema = z.object({
  sessionId: z.string().regex(/^[0-9a-f]{24}$/iu),
  walletAddress: z.string().regex(/^0x[0-9a-f]{40}$/iu),
  input: TokenSchema,
  output: TokenSchema,
  amount: z.string().regex(/^\d+(?:\.\d+)?$/u),
  expiresInDays: z.number().int().min(1).max(365).default(30),
}).superRefine((value, context) => {
  if (value.input.symbol === value.output.symbol) context.addIssue({ code: "custom", path: ["output"], message: "Input and output assets must differ" });
  if (Number(value.amount) <= 0) context.addIssue({ code: "custom", path: ["amount"], message: "Amount must be positive" });
});

export const CreateEvmAutomationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("DCA"), common: CommonSchema, intervalSeconds: z.number().int().min(60).max(31_536_000), maximumExecutions: z.number().int().min(1).max(365) }),
  z.object({ kind: z.literal("EXIT"), common: CommonSchema, entryPriceUsd: z.number().positive(), takeProfitPriceUsd: z.number().positive().optional(), stopLossPriceUsd: z.number().positive().optional() }).superRefine((value, context) => {
    if (value.takeProfitPriceUsd == null && value.stopLossPriceUsd == null) context.addIssue({ code: "custom", path: ["takeProfitPriceUsd"], message: "Set a take-profit or stop-loss price" });
    if (value.takeProfitPriceUsd != null && value.takeProfitPriceUsd <= value.entryPriceUsd) context.addIssue({ code: "custom", path: ["takeProfitPriceUsd"], message: "Take-profit must be above entry" });
    if (value.stopLossPriceUsd != null && value.stopLossPriceUsd >= value.entryPriceUsd) context.addIssue({ code: "custom", path: ["stopLossPriceUsd"], message: "Stop-loss must be below entry" });
  }),
]);

export function evmToken(symbol: "ETH" | "USDG") {
  return symbol === "ETH" ? { symbol, decimals: 18, address: ROBINHOOD_NATIVE_ETH } : { symbol, decimals: 6, address: ROBINHOOD_USDG };
}
