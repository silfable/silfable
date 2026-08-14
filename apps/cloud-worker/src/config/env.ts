import dotenv from "dotenv";

dotenv.config();

function requireEnvironmentVariable(name: "DATABASE_URL" | "REDIS_URL" | "WORKER_ENCRYPTION_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required; Silfable does not use production secret fallbacks.`);
  }
  return value;
}

function requireEncryptionKey(): string {
  const value = requireEnvironmentVariable("WORKER_ENCRYPTION_KEY");
  if (!/^[0-9a-fA-F]{64}$/u.test(value)) {
    throw new Error("WORKER_ENCRYPTION_KEY must be exactly 32 bytes encoded as 64 hexadecimal characters.");
  }
  return value;
}

export const config = {
  get databaseUrl(): string {
    return requireEnvironmentVariable("DATABASE_URL");
  },
  get redisUrl(): string {
    return requireEnvironmentVariable("REDIS_URL");
  },
  get workerEncryptionKey(): string {
    return requireEncryptionKey();
  },
  mode: "monitor-only" as const,
};
