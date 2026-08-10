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
`npm run check:myco-strain-drift`). The rules that make it work:

1. `import { PrismaClient } from "@prisma/client"` — resolves normally.
2. Import project source with a **relative path and an explicit `.ts` extension**:
   `import { normalizeStrainSlug } from "../src/domain/strain/data.ts"`.

   **This only works if the module you import is a *leaf*** — i.e. it has no relative
   *value* imports of its own (`import type` is fine, type-stripping erases it). The
   `.ts` extension you write fixes *your* import; it does nothing for the imports
   *inside* that module, and all **223 relative imports under `src/` are extensionless**
   — that is the declared project convention (`tsconfig.json`: `moduleResolution:
   "bundler"`, `allowImportingTsExtensions: true`). Node's ESM resolver never adds `.ts`,
   so a non-leaf chain dies with `ERR_MODULE_NOT_FOUND` on a path that looks like a
   missing file but is not. `src/domain/strain/data.ts` happens to be a leaf; e.g.
   `reviewerEnrollment.ts` and `staffFieldVerification.ts` are not.
   **Rule 2b — non-leaf chain → run the script through vite-node**, which applies the
   project's own resolver:

   ```bash
   node --env-file=.env.local node_modules/vite-node/vite-node.mjs scripts/<name>.mjs -- [args]
   ```

   The `--` before the script's own arguments is required; vite-node consumes everything
   before it. vite-node is already in `node_modules` — do not install anything.
   Exemplar: `scripts/mint-staff-link.mjs` (also `scripts/seed-qa-staff-review.mjs`,
   which is on the unmerged `kewl2475-qa-staff-review-sandbox` branch — not on `main`
   yet, so don't grep for it here and conclude it is missing).

   **Do not resolve this by adding `.ts` extensions to imports inside `src/`.** It would
   make those files deviate from a 223/223 convention `tsconfig.json` explicitly
   declares, and it only fixes today's import graph — the next script hits the same wall
   one module over. (KEWL-2480; registry entry KEWL-2411.)
3. The `@/*` tsconfig alias does **not** resolve — strip-types does no tsconfig path
   mapping. `import ... from "@/domain/strain/data.ts"` fails `ERR_MODULE_NOT_FOUND`.
   Under vite-node it *does* resolve, via `vite.config.ts`'s `resolve.alias`.

For env vars in the **strip-types** form, do not use `node --env-file=`; reuse the
template's `loadDotenvFile()` helper. That caveat does not apply to rule 2b: under
vite-node, `node` loads `--env-file=.env.local` before vite-node starts, so it works
(verified 2026-07-29, KEWL-2480). If a script needs enums, namespaces, or param properties, swap
`--experimental-strip-types` for `--experimental-transform-types`.

### Staff-review invite-batch operators

Staff invite batch provider-send execution is retired. Prepare credential-free drafts and
record approval only through the checked-in npm scripts, which use the repo-local
`vite-node` resolver. Do not use `tsx` and do not install it:

```bash
npm run staff-review:prepare-invite-batch -- --partner-id <id> --template-file <path> --from <email> --reply-to <email> --rendered-by <email> --expires-in-days <days> --provider <name> --provider-credential-fingerprint <sha256> --source-issue-id <id> --source-comment-id <id>
npm run staff-review:record-invite-batch-approval -- --partner-id <id> --batch-id <id> --approved-interaction-id <id> --approved-by <email>
```

## Staff catalog review — verifying the screens (QA sandbox)

The staff catalog review screens (`/staff/catalog/<token>`) sit behind a shared partner
link plus a per-reviewer PIN. **Never claim one of The Mushroom Top's unclaimed reviewer
identities to get in.** Setting a PIN for Adrienne, Clay, Dani, Devon or Eddie takes that
person's name permanently until Jon clears it by hand, on a link real reviewers are using
(KEWL-2474). Use the QA sandbox instead: its own partner, its own single reviewer, its own
catalog fixtures, its own link — structurally unable to reach TMT's roster or link.

**Getting the QA link and PIN — re-mint, don't look them up.** Only the token's sha256 hash
and a hashed PIN are stored, so neither is recoverable from the database, and the
`QA_STAFF_REVIEW_URL` / `QA_STAFF_REVIEW_PIN` Vercel env vars **read back as empty strings**
(`vercel env pull` yields `""` on both Production and Preview — verified 2026-07-30, while
every other var in the same pull carries a real value). Do not try to read them; do not
store the link or PIN in a ticket comment either. The QA link is cheap to re-mint on an
inactive partner with fixture-only data, so re-minting *is* the retrieval path:

```bash
cd ~/dev/tripdar && node --env-file=.env.local \
  node_modules/vite-node/vite-node.mjs scripts/seed-qa-staff-review.mjs -- \
  --remint --pin=NNNN
```

It revokes and re-mints **only the QA partner's** link and prints the URL once. Pass a
4-digit `--pin` you choose so the value is known rather than generated-and-lost. The
`--remint` flag is what handles a lost raw token; without it the script leaves the existing
link alone. It is partner-scoped throughout and cannot touch TMT's link, roster or
enrollment window.

`QA_STAFF_REVIEW_PARTNER_ID` is different — it **is** read at runtime by
`staffReviewRoster.ts` and must be set in the target environment, or the QA reviewer is
admitted nowhere and the QA link fails closed with `410 roster_empty`. That is the first
thing to check if the QA link 410s.

Also:

- Production is **`www.tripd.ar`** (apex 307s to www; `tripdar.com` is an unrelated parked
  lander that 200s on every path).
- A token page can return 200 with a shell for a well-formed but unknown token — check
  `GET /api/myco/staff-review/<token>` or the rendered text, not the status code.
- **Do not run `scripts/mint-staff-link.mjs`** for verification. It hardcodes the TMT
  partner lookup and revokes the current live link before minting a new one, cutting off
  reviewers mid-pilot.
- The QA link's `enrollmentOpen` stays `true` even though its one identity already holds a
  PIN — the seed writes `pinHash` directly and never calls
  `closeEnrollmentIfRosterComplete`. Inert (enrollment is compare-and-set on
  `pinHash IS NULL`). **Do not hand-flip the flag.**

## Deployment

Vercel + Neon. Build: `prisma generate && next build`

## Additional Resources

- `/docs/BUG_LOG.md` - Bug history and prevention
- `/docs/CHANGELOG.md` - Version history
- `/docs/USER_MANUAL.md` - End-user docs
- `/SYSTEM_MAP.md` - System architecture
