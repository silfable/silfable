import "server-only";

import { cloudDb } from "@/lib/cloud-db";
import { CreateEvmAutomationSchema } from "@/lib/evm-automation-core";

export async function createOwnedEvmAutomation(input: { userId: string; request: unknown }) {
  const parsed = CreateEvmAutomationSchema.safeParse(input.request);
  if (!parsed.success) return { ok: false as const, issues: parsed.error.issues };
  const strategyInput = parsed.data;
  const session = await cloudDb.chatSession.findFirst({ where: { id: strategyInput.common.sessionId, userId: input.userId, workspace: "evm", chainKey: "robinhood", sessionWalletAddress: strategyInput.common.walletAddress } });
  if (!session) return { ok: false as const, issues: [{ path: ["common", "sessionId"], message: "Choose a Robinhood session bound to this EVM wallet." }] };
  const now = new Date();
  const strategy = await cloudDb.evmAutomationStrategy.create({
    data: {
      userId: input.userId, sessionId: session.id, walletAddress: strategyInput.common.walletAddress.toLowerCase(), kind: strategyInput.kind,
      inputToken: strategyInput.common.input.symbol, inputDecimals: strategyInput.common.input.decimals,
      outputToken: strategyInput.common.output.symbol, outputDecimals: strategyInput.common.output.decimals,
      amount: strategyInput.common.amount, intervalSeconds: strategyInput.kind === "DCA" ? strategyInput.intervalSeconds : null,
      maximumExecutions: strategyInput.kind === "DCA" ? strategyInput.maximumExecutions : null,
      entryPriceUsd: strategyInput.kind === "EXIT" ? strategyInput.entryPriceUsd : null,
      takeProfitPriceUsd: strategyInput.kind === "EXIT" ? strategyInput.takeProfitPriceUsd ?? null : null,
      stopLossPriceUsd: strategyInput.kind === "EXIT" ? strategyInput.stopLossPriceUsd ?? null : null,
      expiresAt: new Date(now.getTime() + strategyInput.common.expiresInDays * 86_400_000),
      nextWakeAt: strategyInput.kind === "DCA" ? new Date(now.getTime() + strategyInput.intervalSeconds * 1000) : now,
    }, include: { proposals: true },
  });
  return { ok: true as const, strategy, input: strategyInput };
}
