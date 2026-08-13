import "server-only";

import { createOwnedEvmAutomation } from "@/lib/evm-automation-service";
import { evmToken } from "@/lib/evm-automation-core";

function number(value: string | undefined) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }

// This is an application-owned AI tool boundary: it accepts only the released
// Robinhood pair and turns a natural-language instruction into typed data.
export async function runEvmAutomationAiTool(input: { userId: string; sessionId: string; walletAddress: string; text: string }) {
  const text = input.text;
  const pair = /\b(ETH|USDG)\b\s*(?:ke|to|→|->)\s*\b(ETH|USDG)\b/iu.exec(text);
  const amount = /(?:dca\s+|buat\s+dca\s+|for\s+)?(\d+(?:\.\d+)?)\s*(ETH|USDG)\b/iu.exec(text);
  if (!pair || !amount) return { created: false, content: "To create Robinhood automation, specify an amount and pair. Example: Create DCA 0.005 ETH to USDG every 2 hours for 10 cycles." };
  const inputSymbol = pair[1]!.toUpperCase() as "ETH" | "USDG";
  const outputSymbol = pair[2]!.toUpperCase() as "ETH" | "USDG";
  if (inputSymbol === outputSymbol) return { created: false, content: "Input and output assets must differ." };
  const common = { sessionId: input.sessionId, walletAddress: input.walletAddress, input: evmToken(inputSymbol), output: evmToken(outputSymbol), amount: amount[1]!, expiresInDays: 30 };
  const isExit = /\b(?:tp|sl|take[ -]?profit|stop[ -]?loss)\b/iu.test(text);
  const request = isExit
    ? (() => {
      const entry = number(/\bentry\s*\$?([\d.]+)/iu.exec(text)?.[1]);
      const takeProfit = number(/\b(?:tp|take[ -]?profit)\s*\$?([\d.]+)/iu.exec(text)?.[1]);
      const stopLoss = number(/\b(?:sl|stop[ -]?loss)\s*\$?([\d.]+)/iu.exec(text)?.[1]);
      return { kind: "EXIT" as const, common, entryPriceUsd: entry, takeProfitPriceUsd: takeProfit, stopLossPriceUsd: stopLoss };
    })()
    : (() => {
      const interval = /(?:every|setiap)\s+(\d+(?:\.\d+)?)\s*(minute|minutes|min|menit|hour|hours|jam|day|days|hari)/iu.exec(text);
      const units = interval?.[2]?.toLowerCase() ?? "";
      const multiplier = /hour|jam/u.test(units) ? 3600 : /day|hari/u.test(units) ? 86_400 : 60;
      const intervalSeconds = Math.round((number(interval?.[1]) ?? 0) * multiplier);
      const cycles = number(/(?:for|selama|sebanyak|maximum|max)\s+(\d+)\s*(?:cycles?|kali)?/iu.exec(text)?.[1]);
      return { kind: "DCA" as const, common, intervalSeconds, maximumExecutions: cycles };
    })();
  const created = await createOwnedEvmAutomation({ userId: input.userId, request });
  if (!created.ok) return { created: false, content: `Robinhood automation was not created: ${created.issues.map((issue) => issue.message).join(" ")}` };
  return created.input.kind === "DCA"
    ? { created: true, content: `Robinhood DCA ${inputSymbol} → ${outputSymbol} created: ${common.amount} ${inputSymbol} every ${created.input.intervalSeconds} seconds, up to ${created.input.maximumExecutions} cycles. Each due cycle creates a review card; MetaMask/Rabby must approve every transaction.` }
    : { created: true, content: `Robinhood TP/SL ${inputSymbol} → ${outputSymbol} created. It only creates a review card when a trigger is observed; MetaMask/Rabby must approve every transaction.` };
}
