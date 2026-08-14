import { Worker, type Job } from "bullmq";

import { prisma } from "../services/db.js";
import { redisConnection } from "../services/queue.js";
import { evaluateMonitorAuthority } from "../authority/guard.js";

export type TradingJobPayload = {
  sessionId: string;
  targetMint?: string;
  amountLamports?: number;
  side?: "buy" | "sell";
};

/**
 * Legacy queue consumer retained only to drain old jobs safely.
 *
 * It deliberately has no signer, RPC transaction builder, or broadcast path.
 * The production entrypoint does not start this worker while cloud execution is
 * frozen. If it is started manually, every job is acknowledged as blocked.
 */
export function startTradingWorker() {
  const worker = new Worker<TradingJobPayload>(
    "trading-queue",
    async (job: Job<TradingJobPayload>) => {
      const session = await prisma.agentSession.findUnique({
        where: { id: job.data.sessionId },
        select: { id: true, status: true, user: { select: { walletAddress: true } } },
      });

      if (!session) {
        console.warn(`[Execution Frozen] Ignoring job ${job.id}: session not found.`);
        return { status: "blocked", reason: "SESSION_NOT_FOUND" };
      }

      const [authority, safetyState] = await Promise.all([
        prisma.delegatedAuthority.findFirst({
          where: {
            walletAddress: session.user.walletAddress,
            status: "ACTIVE",
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.walletSafetyState.findUnique({
          where: { walletAddress: session.user.walletAddress },
        }),
      ]);
      const authorityDecision = evaluateMonitorAuthority({
        policy: authority?.policy ?? null,
        status: authority?.status ?? null,
        expiresAt: authority?.expiresAt ?? null,
        revokedAt: authority?.revokedAt ?? null,
        killSwitchEngaged: safetyState?.killSwitchEngaged ?? false,
      });

      console.warn(
        `[Execution Frozen] Ignoring job ${job.id} for session ${session.id}; authority=${authorityDecision.reason}; cloud signing and Mainnet broadcast are disabled.`,
      );
      return {
        status: "blocked",
        reason: "CLOUD_EXECUTION_FROZEN",
        authority: authorityDecision.reason,
        executionAttempted: false,
      };
    },
    {
      connection: redisConnection,
      concurrency: 1,
    },
  );

  worker.on("failed", (job, error) => {
    console.error(`[Execution Frozen] Queue job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  return worker;
}
