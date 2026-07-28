# CLAUDE.md - AI Assistant Guide for PsillyOps / Tripdar

This document provides guidance for AI assistants working with this codebase.

---

## AI Instructions (IMPORTANT)

### Version Control & Change Log

**After completing any code changes, update `/docs/CHANGELOG.md`:**

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added / Changed / Fixed
- Description
```

**Versioning Rules (Semantic Versioning):**
- **MAJOR (X)**: Breaking changes, major feature overhauls
- **MINOR (Y)**: New features, non-breaking enhancements
- **PATCH (Z)**: Bug fixes, small improvements

Check the current version at the top of `/docs/CHANGELOG.md` before incrementing.

### Bug Log & Learning

**CRITICAL: ALWAYS check `/docs/BUG_LOG.md` BEFORE writing any code!**

Before implementing features involving pagination, dynamic dropdowns, API integrations, or caching — search the bug log for similar patterns.

**When fixing a bug, document it in `/docs/BUG_LOG.md`** with: Symptoms, Root Cause, Fix, Files Modified, Prevention, Lesson Learned.

**Key Lessons from Past Bugs:**
- **Pagination**: Dynamic filters must fetch ALL data for counting, not just first page
- **Cache**: Always separate display queries (paginated) from aggregation queries (full dataset)
- **WordPress**: Cache clearing doesn't help if the bug is in query logic, not stale data

### Working Guidelines

1. **Read before writing** - Always read existing code before modifying
2. **Check the bug log** - Review past bugs before implementing similar features
3. **Log every change** - Update CHANGELOG.md with version bump after changes
4. **Document bugs thoroughly** - Future AI sessions depend on this knowledge

### Anti-Patterns (DO NOT)

- Never use `any` type — use proper interfaces or Prisma-generated types
- Never use `prisma` directly in components — all DB logic goes through `/lib/services/`
- Never skip auth checks in API routes — every route must call `auth()` first
- Never fetch without pagination — large lists must use `limit`/`offset`
- Never import server code in client components
- Never hardcode IDs or secrets — use environment variables
- Never delete batches/orders — use soft delete for audit trail
- Never bypass RBAC — always use `hasPermission()`
- Never commit `.env` files

### Security Checklist

Before completing any API route or mutation:
- Authentication: Route calls `auth()` and checks `session.user`
- Authorization: Uses `hasPermission()` or role check
- Input validation: Validated with Zod or explicit checks
- Ownership verification: User can only access their own data
- Partner Isolation: Partner users must ONLY see data belonging to their `partnerId`

### Domain Knowledge (Business Rules)

**Inventory & Allocation:**
- FIFO allocation (oldest inventory first)
- Available = `quantityOnHand - quantityReserved`
- Never manually adjust reserved quantities

**Batches & Production:**
- Cannot delete once `RELEASED` (regulatory)
- Batch codes are immutable after creation
- Production orders auto-create from order shortages via MRP

**Orders:**
- Auto-allocate on creation
- Flow: `DRAFT -> SUBMITTED -> APPROVED -> IN_FULFILLMENT -> SHIPPED`
- Cancelled orders must release allocations

**QR Tokens & Seals:**
- One-time-print (traceability requirement)
- Revoked tokens cannot be un-revoked
- `TripdarToken` is public-facing (separate from internal `QRToken`)

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 15+** | React framework with App Router |
| **TypeScript** | Type safety (strict mode) |
| **PostgreSQL (Neon)** | Serverless database |
| **Prisma 6** | ORM |
| **NextAuth.js v5** | Authentication (JWT) |
| **Tailwind CSS 3** | Styling |

## Project Structure

```
/app                    # Next.js App Router pages and API routes
  /api                  # REST API endpoints
  /ops                  # Operations dashboard
  /partner              # Partner portal
/components             # React components
/lib                    # Shared libraries
  /auth                 # Authentication (auth.ts, rbac.ts)
  /db                   # Prisma client singleton
  /services             # ALL business logic
  /utils                # Helpers (cn, formatters, validators)
/prisma                 # Database schema + seed
/wordpress-plugin       # Tripdar WordPress plugin (separate from Next.js app)
/docs                   # Documentation (CHANGELOG.md, BUG_LOG.md)
```

## API Route Pattern

```typescript
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ... business logic via service layer
}
```

## User Roles

ADMIN, ANALYST, PRODUCTION, WAREHOUSE, REP, PARTNER_ADMIN, PARTNER_OPERATOR

## Key Services

| Service | Purpose |
|---------|---------|
| `inventoryService.ts` | Stock management |
| `allocationService.ts` | FIFO order allocation |
| `productionService.ts` | Production orders and batches |
| `mrpService.ts` | Material requirements planning |
| `orderService.ts` | Retailer order management |
| `qrTokenService.ts` | QR code token management |

## One-off TypeScript Scripts (probes, verification, maintenance)

**This repo has no `tsx`.** `node --import tsx ...` fails with `Cannot find package 'tsx'`
— that is expected, do not install it. Use Node's native type-stripping:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/<name>.mts
```

Copy `scripts/check-myco-strain-slug-drift.mts` as the template (npm script:
`npm run check:myco-strain-drift`). Three rules that make it work:

1. `import { PrismaClient } from "@prisma/client"` — resolves normally.
2. Import project source with a **relative path and an explicit `.ts` extension**:
   `import { normalizeStrainSlug } from "../src/domain/strain/data.ts"`.
3. The `@/*` tsconfig alias does **not** resolve — strip-types does no tsconfig path
   mapping. `import ... from "@/domain/strain/data.ts"` fails `ERR_MODULE_NOT_FOUND`.

For env vars, do not use `node --env-file=`; reuse the template's `loadDotenvFile()`
helper. If a script needs enums, namespaces, or param properties, swap
`--experimental-strip-types` for `--experimental-transform-types`.

## Deployment

Vercel + Neon. Build: `prisma generate && next build`

## Additional Resources

- `/docs/BUG_LOG.md` - Bug history and prevention
- `/docs/CHANGELOG.md` - Version history
- `/docs/USER_MANUAL.md` - End-user docs
- `/SYSTEM_MAP.md` - System architecture
