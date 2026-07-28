import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  BRAND_PUBLIC_IP_LIMIT,
  checkPublicWriteRateLimit,
  publicWriteIdentifier,
  type PublicWriteRateLimitStore,
} from "./publicWriteRateLimit";

class SharedCounterStore implements PublicWriteRateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: Date }>();

  async increment(key: string, windowMs: number, now: Date) {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const next = { count: 1, resetAt: new Date(now.getTime() + windowMs) };
      this.buckets.set(key, next);
      return next;
    }

    existing.count += 1;
    return existing;
  }
}

describe("publicWriteIdentifier", () => {
  // Regression guard for KEWL-2367/KEWL-2370: this hash must come from Web Crypto,
  // not node:crypto, or the Edge middleware bundle throws at module init and every
  // brand-portal write fails closed with a 429.
  it("produces the same SHA-256 digest node:crypto did, so live buckets keep their keys", async () => {
    const expected = createHash("sha256").update("203.0.113.10").digest("hex");
    await expect(publicWriteIdentifier("ip", "203.0.113.10")).resolves.toBe(
      `myco:public-write:ip:${expected}`
    );
  });

  it("namespaces by scope so ip and token buckets never collide", async () => {
    const [ip, token] = await Promise.all([
      publicWriteIdentifier("ip", "same-value"),
      publicWriteIdentifier("token", "same-value"),
    ]);
    expect(ip.startsWith("myco:public-write:ip:")).toBe(true);
    expect(token.startsWith("myco:public-write:token:")).toBe(true);
    expect(ip).not.toBe(token);
  });
});

describe("checkPublicWriteRateLimit", () => {
  it("fails closed when the shared store throws", async () => {
    const store: PublicWriteRateLimitStore = {
      increment: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };

    await expect(
      checkPublicWriteRateLimit({
        ip: "203.0.113.10",
        token: "token-1",
        store,
        now: new Date("2026-07-28T17:00:00Z"),
      })
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 60, reason: "store_error" });
  });

  it("enforces one shared IP counter across independent callers", async () => {
    const store = new SharedCounterStore();
    const now = new Date("2026-07-28T17:00:00Z");

    for (let i = 0; i < BRAND_PUBLIC_IP_LIMIT; i++) {
      await expect(
        checkPublicWriteRateLimit({
          ip: "203.0.113.20",
          token: `token-${i}`,
          store,
          now,
        })
      ).resolves.toMatchObject({ allowed: true });
    }

    await expect(
      checkPublicWriteRateLimit({
        ip: "203.0.113.20",
        token: "token-final",
        store,
        now,
      })
    ).resolves.toMatchObject({ allowed: false, reason: "ip" });
  });
});
