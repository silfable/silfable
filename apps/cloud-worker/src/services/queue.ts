import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config/env.js";

export const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const tradingQueue = new Queue("trading-queue", {
  connection: redisConnection,
});
