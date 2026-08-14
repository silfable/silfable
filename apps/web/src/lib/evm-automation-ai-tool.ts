import "server-only";

import { createOwnedEvmAutomation } from "@/lib/evm-automation-service";
import { parseEvmAutomationText } from "@/lib/evm-automation-core";
import { resolveRobinhoodTokenReference, type RobinhoodToken } from "@/lib/robinhood-token";

function number(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function describeResolution(reference: string, result: Awaited<ReturnType<typeof resolveRobinhoodTokenReference>>): string {
  if (result.status === "ambiguous") {
    const choices = result.candidates.map((token) => `${token.symbol} · ${token.address}`).join("\n• ");
    return `Multiple validated Robinhood Chain contracts match ${reference}. Resend the automation request with one exact contract address:\n• ${choices}`;
  }
  return `Token ${reference} could not be validated on Robinhood Chain. Provide its exact ERC-20 contract address.`;
}

async function resolveToken(reference: string): Promise<{ token?: RobinhoodToken; error?: string }> {
  const result = await resolveRobinhoodTokenReference(reference);
  return result.status === "resolved"
    ? { token: result.token }
    : { error: describeResolution(reference, result) };
}

// Token addresses and metadata are resolved by deterministic application code;
// the language model never invents a contract or decimals value.
export async function runEvmAutomationAiTool(input: { userId: string; sessionId: string; walletAddress: string; text: string }) {
  const text = input.text;
  const parsed = parseEvmAutomationText(text);
  if (!parsed) {
    return { created: false, content: "Specify the amount and pair. Example: Create DCA 0.005 ETH to WETH every 2 hours for 10 cycles. For an unrecognized token, include its exact Robinhood Chain contract address." };
  }

  const [inputResolution, outputResolution] = await Promise.all([
    resolveToken(parsed.inputReference),
    resolveToken(parsed.outputReference),
  ]);
  if (!inputResolution.token) return { created: false, content: inputResolution.error! };
  if (!outputResolution.token) return { created: false, content: outputResolution.error! };
  const inputToken = inputResolution.token;
  const outputToken = outputResolution.token;
  if (inputToken.address === outputToken.address) return { created: false, content: "Input and output assets must differ." };

  const common = {
    sessionId: input.sessionId,
    walletAddress: input.walletAddress,
    input: inputToken,
    output: outputToken,
    amount: parsed.amount,
    expiresInDays: 30,
  };
  const isExit = /\b(?:tp|sl|take[ -]?profit|stop[ -]?loss)\b/iu.test(text);
  const request = isExit
    ? (() => {
      const entry = number(/\bentry\s*\$?([\d.]+)/iu.exec(text)?.[1]);
      const takeProfit = number(/\b(?:tp|take[ -]?profit)\s*\$?([\d.]+)/iu.exec(text)?.[1]);
      const stopLoss = number(/\b(?:sl|stop[ -]?loss)\s*\$?([\d.]+)/iu.exec(text)?.[1]);
      return { kind: "EXIT" as const, common, entryPriceUsd: entry, takeProfitPriceUsd: takeProfit, stopLossPriceUsd: stopLoss };
    })()
    : { kind: "DCA" as const, common, intervalSeconds: parsed.intervalSeconds, maximumExecutions: parsed.maximumExecutions };

  const created = await createOwnedEvmAutomation({ userId: input.userId, request });
  if (!created.ok) return { created: false, content: `Robinhood automation was not created: ${created.issues.map((issue) => issue.message).join(" ")}` };
  return created.input.kind === "DCA"
    ? { created: true, content: `Robinhood DCA ${inputToken.symbol} → ${outputToken.symbol} created: ${common.amount} ${inputToken.symbol} every ${created.input.intervalSeconds} seconds, up to ${created.input.maximumExecutions} cycles. Contracts were validated on Robinhood Chain. Each due cycle creates a review card; MetaMask/Rabby must approve every transaction.` }
    : { created: true, content: `Robinhood TP/SL ${inputToken.symbol} → ${outputToken.symbol} created. Contracts were validated on Robinhood Chain. It only creates a review card when a trigger is observed; MetaMask/Rabby must approve every transaction.` };
}
