import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  BRAND_PUBLIC_IP_LIMIT,
  checkPublicWriteRateLimit,
  createPrismaPublicWriteRateLimitStore,
} from "./publicWriteRateLimit";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const tableName = `PublicWriteRateLimitBucketKewl2349${process.pid}`;

const runIfDatabase = hasDatabase ? describe : describe.skip;

runIfDatabase("Prisma public write rate-limit store", () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "${tableName}" (
        "key" TEXT NOT NULL,
        "count" INTEGER NOT NULL DEFAULT 0,
        "resetAt" TIMESTAMP(3) NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "${tableName}_pkey" PRIMARY KEY ("key")
      )
    `);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}"`);
    await prisma.$disconnect();
  });

  it("shares one SQL counter across independent limiter callers", async () => {
    const callerAStore = createPrismaPublicWriteRateLimitStore(tableName);
    const callerBStore = createPrismaPublicWriteRateLimitStore(tableName);
    const now = new Date("2026-07-28T17:30:00Z");

    const callerA = (token: string) =>
      checkPublicWriteRateLimit({ ip: "198.51.100.7", token, store: callerAStore, now });
    const callerB = (token: string) =>
      checkPublicWriteRateLimit({ ip: "198.51.100.7", token, store: callerBStore, now });

    for (let i = 0; i < BRAND_PUBLIC_IP_LIMIT; i++) {
      const result = i % 2 === 0 ? await callerA(`token-a-${i}`) : await callerB(`token-b-${i}`);
      expect(result.allowed).toBe(true);
    }

    await expect(callerB("token-over-limit")).resolves.toMatchObject({
      allowed: false,
      reason: "ip",
    });
  });
});
