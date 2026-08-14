import { config } from "./config/env.js";
import { prisma } from "./services/db.js";
import { redisConnection } from "./services/queue.js";

async function main() {
  console.log("==================================================");
  console.log("Starting Silfable Cloud Monitor");
  console.log(`Mode: ${config.mode}`);
  console.log("==================================================");

  try {
    const pong = await redisConnection.ping();
    console.log(`[Redis Cloud] Connection successful: ${pong}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown Redis error";
    console.error(`[Redis Cloud] Connection failed: ${message}`);
  }

  console.log("[Execution] Signing and Mainnet broadcast are disabled.");
  console.log("[Schedulers] DCA, TP/SL, and autonomous discovery execution are frozen.");

  const http = await import("node:http");
  const port = Number(process.env.PORT || 8080);
  const server = http.createServer((_, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      service: "silfable-cloud-worker",
      mode: config.mode,
      executionEnabled: false,
    }));
  });
  server.listen(port, () => {
    console.log(`[Health Check] HTTP Server listening on port ${port}`);
  });

  async function shutdown() {
    console.log("Shutting down cloud monitor...");
    server.close();
    await redisConnection.quit();
    await prisma.$disconnect();
  }

  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  console.error("Fatal error starting Cloud Monitor:", message);
  process.exit(1);
});
