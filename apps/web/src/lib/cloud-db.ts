import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  dbUrl: string | undefined;
};

export function isDbConfigured(): boolean {
  const url = process.env.DATABASE_URL || "";
  return Boolean(
    url &&
      (url.startsWith("mongodb://") || url.startsWith("mongodb+srv://"))
  );
}

export function getPrismaClient(): PrismaClient {
  const currentUrl = process.env.DATABASE_URL || "";
  if (!globalForPrisma.prisma || globalForPrisma.dbUrl !== currentUrl) {
    globalForPrisma.dbUrl = currentUrl;
    globalForPrisma.prisma = new PrismaClient({
      datasources: {
        db: {
          url: isDbConfigured()
            ? currentUrl
            : "mongodb://127.0.0.1:27017/silfable_dummy?replicaSet=rs0",
        },
      },
      log: ["error"],
    });
  }
  return globalForPrisma.prisma;
}

// Proxy cloudDb so it dynamically reads the latest process.env.DATABASE_URL
export const cloudDb = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const val: unknown = Reflect.get(client, prop);
    if (typeof val === "function") {
      return val.bind(client);
    }
    return val;
  },
});

/**
 * Safely executes a database query. If DATABASE_URL is missing or the database connection
 * times out / fails, it catches the error cleanly and returns the fallback value.
 */
export async function safeDbQuery<T>(queryFn: () => Promise<T>, fallback: T): Promise<T> {
  if (!isDbConfigured()) {
    return fallback;
  }
  try {
    return await queryFn();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[CloudDB] Database query skipped (unreachable database connection):", message);
    return fallback;
  }
}
