import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

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

/**
 * Web Crypto SHA-256. Runs in Edge Runtime, Node 18+, and the browser.
 * The Node `crypto` module is deliberately not used here: this module is
 * pulled into the Edge middleware bundle, where `node:crypto` does not exist
 * and importing it throws at module init (KEWL-2367).
 */
async function hashIdentifier(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function publicWriteIdentifier(
  scope: PublicWriteRateLimitScope,
  value: string
): Promise<string> {
  return `myco:public-write:${scope}:${await hashIdentifier(value)}`;
}

function quotePgIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid Postgres identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

/**
 * Prisma's `resetAt` column is `timestamp(3)` — *without* time zone — holding a
 * UTC instant. Handing a JS `Date` to the driver (in either direction) would let
 * the session/host time zone reinterpret it and silently skew `retry-after`, so
 * we cross the boundary in an explicitly UTC-anchored form:
 *   - write: naive-UTC literal (no `Z`) cast to `::timestamp`
 *   - read:  `EXTRACT(EPOCH FROM ...)`, which Postgres evaluates as if the
 *            naive timestamp were UTC
 */
function toNaiveUtcLiteral(value: Date): string {
  return value.toISOString().replace("Z", "");
}

export function createNeonPublicWriteRateLimitStore(
  tableName = "PublicWriteRateLimitBucket",
  connectionString?: string
): PublicWriteRateLimitStore {
  const table = quotePgIdentifier(tableName);

  // Created lazily and memoized: `neon()` throws when no connection string is
  // available, and this module is imported by unit tests that never touch a DB.
  let sql: NeonQueryFunction<false, false> | undefined;
  function client(): NeonQueryFunction<false, false> {
    if (!sql) {
      const url = connectionString ?? process.env.DATABASE_URL;
      if (!url) {
        throw new Error("DATABASE_URL is not set; public write rate limiter has no store");
      }
      sql = neon(url);
    }
    return sql;
  }

  return {
    async increment(key, windowMs, now) {
      const resetAt = toNaiveUtcLiteral(new Date(now.getTime() + windowMs));
      const nowLiteral = toNaiveUtcLiteral(now);

      const rows = (await client().query(
        `
          INSERT INTO ${table} ("key", "count", "resetAt", "updatedAt")
          VALUES ($1, 1, $2::timestamp, $3::timestamp)
          ON CONFLICT ("key") DO UPDATE SET
            "count" = CASE
              WHEN ${table}."resetAt" <= $3::timestamp THEN 1
              ELSE ${table}."count" + 1
            END,
            "resetAt" = CASE
              WHEN ${table}."resetAt" <= $3::timestamp THEN $2::timestamp
              ELSE ${table}."resetAt"
            END,
            "updatedAt" = $3::timestamp
          RETURNING "count", (EXTRACT(EPOCH FROM "resetAt") * 1000) AS "resetAtMs"
        `,
        [key, resetAt, nowLiteral]
      )) as Array<{ count: number | string; resetAtMs: number | string }>;

      const row = rows[0];
      if (!row) {
        throw new Error("Rate limit store did not return an updated bucket");
      }
      // `count` is int4 and `resetAtMs` is numeric — pg-types hands numerics back
      // as strings, so both are normalised here rather than trusted.
      return { count: Number(row.count), resetAt: new Date(Number(row.resetAtMs)) };
    },
  };
}

export const neonPublicWriteRateLimitStore = createNeonPublicWriteRateLimitStore();

function retryAfterSeconds(resetAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
}

export async function checkPublicWriteRateLimit({
  ip,
  token,
  store = neonPublicWriteRateLimitStore,
  now = new Date(),
}: {
  ip: string;
  token: string;
  store?: PublicWriteRateLimitStore;
  now?: Date;
}): Promise<PublicWriteRateLimitResult> {
  try {
    const ipBucket = await store.increment(
      await publicWriteIdentifier("ip", ip || "unknown"),
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
      await publicWriteIdentifier("token", token),
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
