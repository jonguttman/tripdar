import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const BRAND_PUBLIC_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const BRAND_PUBLIC_IP_LIMIT = 20;
export const BRAND_PUBLIC_TOKEN_LIMIT = 12;

type PublicWriteRateLimitScope = "ip" | "token";

export interface PublicWriteRateLimitStore {
  increment(
    key: string,
    windowMs: number,
    now: Date
  ): Promise<{ count: number; resetAt: Date }>;
}

export interface PublicWriteRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  reason?: "ip" | "token" | "store_error";
}

function hashIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function publicWriteIdentifier(scope: PublicWriteRateLimitScope, value: string): string {
  return `myco:public-write:${scope}:${hashIdentifier(value)}`;
}

function quotePgIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid Postgres identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

export function createPrismaPublicWriteRateLimitStore(
  tableName = "PublicWriteRateLimitBucket"
): PublicWriteRateLimitStore {
  const table = quotePgIdentifier(tableName);

  return {
    async increment(key, windowMs, now) {
      const resetAt = new Date(now.getTime() + windowMs);
      const rows = await prisma.$queryRawUnsafe<Array<{ count: number; resetAt: Date }>>(
        `
          INSERT INTO ${table} ("key", "count", "resetAt", "updatedAt")
          VALUES ($1, 1, $2, $3)
          ON CONFLICT ("key") DO UPDATE SET
            "count" = CASE
              WHEN ${table}."resetAt" <= $3 THEN 1
              ELSE ${table}."count" + 1
            END,
            "resetAt" = CASE
              WHEN ${table}."resetAt" <= $3 THEN $2
              ELSE ${table}."resetAt"
            END,
            "updatedAt" = $3
          RETURNING "count", "resetAt"
        `,
        key,
        resetAt,
        now
      );

      const row = rows[0];
      if (!row) {
        throw new Error("Rate limit store did not return an updated bucket");
      }
      return row;
    },
  };
}

export const prismaPublicWriteRateLimitStore = createPrismaPublicWriteRateLimitStore();

function retryAfterSeconds(resetAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
}

export async function checkPublicWriteRateLimit({
  ip,
  token,
  store = prismaPublicWriteRateLimitStore,
  now = new Date(),
}: {
  ip: string;
  token: string;
  store?: PublicWriteRateLimitStore;
  now?: Date;
}): Promise<PublicWriteRateLimitResult> {
  try {
    const ipBucket = await store.increment(
      publicWriteIdentifier("ip", ip || "unknown"),
      BRAND_PUBLIC_RATE_LIMIT_WINDOW_MS,
      now
    );
    if (ipBucket.count > BRAND_PUBLIC_IP_LIMIT) {
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(ipBucket.resetAt, now),
        reason: "ip",
      };
    }

    const tokenBucket = await store.increment(
      publicWriteIdentifier("token", token),
      BRAND_PUBLIC_RATE_LIMIT_WINDOW_MS,
      now
    );
    if (tokenBucket.count > BRAND_PUBLIC_TOKEN_LIMIT) {
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(tokenBucket.resetAt, now),
        reason: "token",
      };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  } catch (error) {
    console.error("[myco] public write rate-limit store failed:", error);
    return { allowed: false, retryAfterSeconds: 60, reason: "store_error" };
  }
}
