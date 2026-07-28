import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import {
  BRAND_PUBLIC_IP_LIMIT,
  checkPublicWriteRateLimit,
  createNeonPublicWriteRateLimitStore,
} from "./publicWriteRateLimit";

const databaseUrl = process.env.DATABASE_URL;
const tableName = `PublicWriteRateLimitBucketKewl2349${process.pid}`;

const runIfDatabase = databaseUrl ? describe : describe.skip;

runIfDatabase("Neon public write rate-limit store", () => {
  const sql = neon(databaseUrl ?? "");

  beforeAll(async () => {
    await sql.query(`
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
    await sql.query(`DROP TABLE IF EXISTS "${tableName}"`);
  });

  it("shares one SQL counter across independent limiter callers", async () => {
    const callerAStore = createNeonPublicWriteRateLimitStore(tableName);
    const callerBStore = createNeonPublicWriteRateLimitStore(tableName);
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
