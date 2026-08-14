import "server-only";

import { Queue } from "bullmq";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL?.trim();
if (!REDIS_URL) {
  throw new Error("REDIS_URL is required; Silfable does not use a source-code Redis fallback.");
}

const globalForRedis = globalThis as unknown as {
  redisConnection: Redis | undefined;
  tradingQueue: Queue | undefined;
};

export const redisConnection =
  globalForRedis.redisConnection ??
  new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

export const tradingQueue =
  globalForRedis.tradingQueue ??
  new Queue("trading-queue", {
    connection: redisConnection,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisConnection = redisConnection;
  globalForRedis.tradingQueue = tradingQueue;
}
