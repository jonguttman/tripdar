export interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface PublicWriteRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function checkPublicWriteRateLimit(
  store: Map<string, RateLimitBucket>,
  identifier: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): PublicWriteRateLimitResult {
  const bucket = store.get(identifier);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(identifier, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }
  if (bucket.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, limit, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

export function publicWriteIdentifier(input: {
  ip: string | null;
  tokenHash: string | null;
  scope: "ip" | "token";
}): string {
  if (input.scope === "token" && input.tokenHash) return `brand-token:${input.tokenHash}`;
  return `brand-ip:${input.ip ?? "unknown"}`;
}
