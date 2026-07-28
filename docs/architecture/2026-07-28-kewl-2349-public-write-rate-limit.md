# KEWL-2349 Public Write Rate Limiter - Architecture Review

## Recommended architecture

Use the existing Neon Postgres database as the shared store for Myco public write rate limits.

The limiter writes one row per bucket in `PublicWriteRateLimitBucket`, keyed by a hashed identifier. Public write submissions check two buckets before loading or mutating review data:

- per IP: `BRAND_PUBLIC_IP_LIMIT = 20` per minute
- per token: `BRAND_PUBLIC_TOKEN_LIMIT = 12` per minute

Each increment uses a single Postgres `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement, so all Vercel Fluid instances share the same counter and instance recycling does not reset limits. Store errors fail closed with `503` and `Retry-After`, because this protects an unauthenticated write path.

Alternatives rejected:

- Vercel WAF / Firewall rate limiting: platform-level and good for coarse IP controls, but less direct for token-scoped dual buckets and may require plan/config changes outside the repo.
- Vercel BotID: useful bot signal, but not a durable per-token write counter.
- Upstash Redis: technically sound shared store, but it adds a new external service and possible paid provisioning. Neon is already provisioned for Tripdar.

## Risks

- Security: rate-limit keys must not store raw review tokens. The implementation stores SHA-256 hashes of IP/token values.
- Data integrity: the bucket table is intentionally operational state only. It must not be joined into review/business analytics as a source of truth.
- Operational: if Neon is unavailable, public review submissions fail closed. This can temporarily block legitimate submissions, but avoids fail-open abuse on an unauthenticated endpoint.

## Migration impact

- Files affected:
  - `prisma/schema.prisma`
  - `prisma/migrations/20260728101000_public_write_rate_limit/migration.sql`
- Downtime: no expected downtime. The migration creates one small standalone table and one index.
- Rollback plan:
  1. Revert route usage of `checkPublicWriteRateLimit`.
  2. Revert `src/domain/myco/publicWriteRateLimit.ts` and tests if no other endpoint depends on them.
  3. Drop `PublicWriteRateLimitBucket` after confirming no deployed public write route references it.

## Files likely affected

- `src/domain/myco/publicWriteRateLimit.ts`
- `src/app/api/myco/product-review/[token]/route.ts`
- Future KEWL-2331 `/b/<token>` write routes should call `checkPublicWriteRateLimit` before reading request bodies or mutating data.

## What must be tested

- Pre-deploy:
  - `npx vitest run --no-cache src/domain/myco/publicWriteRateLimit.test.ts 'src/app/api/myco/product-review/[token]/route.test.ts'`
  - `set -a; source .env.local; set +a; npx vitest run --no-cache src/domain/myco/publicWriteRateLimit.integration.test.ts` (verifies two independent limiter instances sharing one SQL table both observe the same bucket)
  - `set -a; source .env.local; set +a; npx prisma validate`
  - `npx tsc --noEmit`
- Post-deploy:
  - Confirm migration applied and `PublicWriteRateLimitBucket` exists.
  - Submit 20 public writes from one test IP-equivalent path and confirm the 21st receives `429`.
  - Temporarily force a store error in a non-production environment and confirm the route returns `503`, not fail-open.

## Approval gates

Jon must explicitly approve applying the schema migration to production. No new paid service or external provisioning is required.

## Decision rationale

Neon Postgres is the conservative choice because it uses existing infrastructure, gives atomic shared counters, keeps per-IP and per-token policy in application code, and fails closed on store outage. It avoids provisioning/configuration risk from a new marketplace Redis and avoids relying on platform-only IP controls that do not cover token-scoped abuse.
