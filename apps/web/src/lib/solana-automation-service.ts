import "server-only";

import { cloudDb } from "@/lib/cloud-db";
import { CreateSolanaAutomationSchema, decimalToRaw } from "@/lib/solana-automation-core";

export async function createOwnedSolanaAutomation(input: { userId: string; request: unknown }) {
  const parsed = CreateSolanaAutomationSchema.safeParse(input.request);
  if (!parsed.success) return { ok: false as const, issues: parsed.error.issues };
  const strategyInput = parsed.data;
  const session = await cloudDb.chatSession.findFirst({
    where: {
      id: strategyInput.common.sessionId,
      userId: input.userId,
      workspace: "solana",
      sessionWalletAddress: strategyInput.common.walletAddress,
    },
  });
  if (!session) return { ok: false as const, issues: [{ path: ["common", "sessionId"], message: "Choose a Solana session bound to this wallet." }] };

  const now = new Date();
  const strategy = await cloudDb.solanaAutomationStrategy.create({
    data: {
      userId: input.userId,
      sessionId: session.id,
      walletAddress: strategyInput.common.walletAddress,
      kind: strategyInput.kind,
      inputMint: strategyInput.common.input.mint,
      inputSymbol: strategyInput.common.input.symbol,
      inputDecimals: strategyInput.common.input.decimals,
      outputMint: strategyInput.common.output.mint,
      outputSymbol: strategyInput.common.output.symbol,
      outputDecimals: strategyInput.common.output.decimals,
      amountRaw: decimalToRaw(strategyInput.common.amount, strategyInput.common.input.decimals).toString(),
      intervalSeconds: strategyInput.kind === "DCA" ? strategyInput.intervalSeconds : null,
      maximumExecutions: strategyInput.kind === "DCA" ? strategyInput.maximumExecutions : null,
      entryPriceUsd: strategyInput.kind === "EXIT" ? strategyInput.entryPriceUsd : null,
      takeProfitPriceUsd: strategyInput.kind === "EXIT" ? strategyInput.takeProfitPriceUsd ?? null : null,
      stopLossPriceUsd: strategyInput.kind === "EXIT" ? strategyInput.stopLossPriceUsd ?? null : null,
      expiresAt: new Date(now.getTime() + strategyInput.common.expiresInDays * 86_400_000),
      nextWakeAt: strategyInput.kind === "DCA" ? new Date(now.getTime() + strategyInput.intervalSeconds * 1000) : now,
    },
    include: { proposals: true },
  });
  return { ok: true as const, strategy, input: strategyInput };
}
