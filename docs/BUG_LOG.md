# Bug Log

This document tracks significant bugs, their root causes, fixes, and lessons learned to build institutional memory for future development.

---

## BUG-2026-08-05-001: Non-browser-native photo originals were selected directly for admin source preview

**Symptoms:**
- Premium photo review jobs kept immutable HEIC, HEIF, DNG, TIF, and TIFF uploads in `PhotoJob.originalBlobUrl`, but the admin source pane and `kind=source` image route selected that original directly.
- Browser `<img>` rendering was unreliable because those originals are commonly uploaded as `application/octet-stream` and are not consistently browser-native image formats.
- Repointing `originalBlobUrl` at a converted image would have fixed display by breaking audit lineage and byte-identical original retention.

**Root Cause:**
The hosted photo-job work stored originals and review outputs separately, but had no separate browser-renderable derivative for the source pane. The review domain serialized `PhotoReviewJob.sourceUrl` from `originalBlobUrl`, and `getPhotoJobAssetReference(id, "source")` used the same immutable-original field without checking manifest metadata.

**Fix:**
- The photo pipeline now classifies non-browser-native supported extensions with lowercase normalization, copies the immutable original first, then writes an orientation-correct PNG source preview under the dedicated `source-previews/` prefix.
- The preview is persisted as optional `manifest.source_preview`, including needs-review and failed manifests when conversion has completed. JPG/JPEG/PNG sources continue without preview metadata.
- Blob-backed preview uploads use `.png` paths and `contentType: image/png`; originals remain separate and keep their original extension/content-type behavior.
- The review domain centralizes preview-first source selection so list serialization and direct authenticated image-route resolution cannot drift.
- Existing approved catalog-safe dedupe rows with non-browser-native sources and no preview generate only the missing preview metadata instead of silently returning a non-renderable legacy source.

**Files Modified:**
- `scripts/photo-pipeline/pipeline.mjs`
- `scripts/photo-pipeline/pipeline.test.mjs`
- `src/domain/photo-pipeline/manifest.ts`
- `src/domain/photo-pipeline/review.ts`
- `src/domain/photo-pipeline/review.test.ts`
- `src/app/api/admin/photo-jobs/[id]/route.test.ts`
- `photo-pipeline/config/manifest.schema.json`
- `docs/CHANGELOG.md`
- `docs/BUG_LOG.md`

**Prevention:**
- Keep immutable source storage and browser-renderable review assets as separate references; never reuse `originalBlobUrl` for a derivative.
- Any converted derivative must make its bytes, extension, persisted pathname, and Blob `contentType` agree.
- Source selection logic belongs in the review domain, not independently in the list API and image route.
- Dedupe/skip paths must be checked for new manifest-derived assets so legacy rows do not bypass newly required review plumbing.

**Lesson Learned:**
An audit-safe original is not automatically a browser-safe preview. If a UI needs to render a source asset, store a derivative reference beside the immutable original and make the selection contract explicit.

---

## BUG-2026-08-01-002: Hosted premium photo review images 404 because pipeline stored local paths

**Symptoms:**
- `/admin/photo-jobs` listed premium review jobs correctly in the hosted admin, but original, catalog-safe, and premium comparison images returned 404.
- The image proxy route worked only on the machine that had run the photo pipeline because the referenced files existed only in that local checkout.

**Root Cause:**
The photo pipeline wrote output files under the local `tripdar-product-images/` tree, then persisted `path.relative(REPO_ROOT, fullPath)` values in `PhotoJob.originalBlobUrl` and manifest output keys. The review image route already redirected `https://` references, but pipeline rows never contained URLs. In Vercel, `.gitignore` excludes the generated image tree, so the route fell through to `readFile()` and could not find the assets.

**Fix:**
- Added Vercel Blob uploads for original and generated review assets when `BLOB_READ_WRITE_TOKEN` is configured.
- Persisted returned public Blob URLs in `PhotoJob.originalBlobUrl`, `manifest.outputs`, and `manifest.catalog_safe_outputs` while preserving local files for operator working copies, validation, and local fallback rows.
- Required Blob upload capability before writing Prisma-backed `PhotoJob` rows, so hosted-admin rows do not silently regress to relative filesystem paths.
- Documented the env-file CLI invocation operators need for hosted review jobs and added a no-upload warning so filesystem/local runs announce that their image references will not render in hosted admin.
- Updated proof generation to report remote asset URLs instead of treating every manifest output as a local file.

**Files Modified:**
- `scripts/photo-pipeline/pipeline.mjs`
- `scripts/photo-pipeline/cli.mjs`
- `scripts/photo-pipeline/pipeline.test.mjs`
- `docs/photo-pipeline/operator-guide.md`
- `docs/CHANGELOG.md`
- `docs/BUG_LOG.md`

**Prevention:**
- Any persisted field with `BlobUrl` in its name must contain an actual URL in DB-backed production paths.
- Keep local processing paths separate from persisted review references; validation can use local files, but hosted UI manifests must not.
- Operator docs must include the exact env-loading command for any CLI path that depends on production-like environment variables; package scripts alone do not load `.env.local`.
- If a production route has both redirect and filesystem branches, tests must cover the branch intended for hosted deployment, not only local fallback.

**Lesson Learned:**
Blob-shaped naming is not Blob storage. A local path can pass pipeline and UI review locally while guaranteeing a hosted 404 once ignored artifacts are absent from the deployment. A correct code path is still incomplete if the documented operator command never supplies the environment needed to trigger it.

---

## BUG-2026-08-01-001: Photo pipeline reported unmeasured label fidelity and entered premium mode accidentally

**Symptoms:**
- Manifests reported a reassuring `0.94` or `0.82` label-fidelity score even though no label pixels or text had been compared.
- A whole `image_base64` response from a background-removal provider silently changed a catalog-safe run into a generative premium run.
- There was no CLI premium intent, no real negative control for dosage corruption, and no human approval surface writing `PhotoJob.approvedBy` / `approvedAt`.

**Root Cause:**
`processCatalogSafe()` assigned label fidelity from a ternary based on the provider response path. The shared hosted-response classifier treated a whole generated image as a valid background-removal result and assigned `processingMode: "premium"`, coupling mode selection to provider behavior rather than operator intent.

**Fix:**
- Catalog-safe accepts mask/cutout payloads only; whole-image payloads are rejected in that lane.
- Added explicit `--mode premium`, which uses the locked v1 prompt through the existing OpenRouter/Vercel AI Gateway transport and always routes to `needs_review`.
- Replaced the constant with measured label-region structural/perceptual similarity, OCR text diff, and container/cap geometry. Critical text deltas hard-flag, and missing OCR fails closed.
- Added a super-admin three-way comparison and explicit approve/reject gate that persists reviewer identity and time.
- Added positive, different-content, dosage-corruption, geometry-corruption, intentional-mode, cost, and catalog-safe byte-identity tests.

**Files Modified:**
- `scripts/photo-pipeline/cli.mjs`
- `scripts/photo-pipeline/pipeline.mjs`
- `scripts/photo-pipeline/label-fidelity.mjs`
- `scripts/photo-pipeline/*.test.mjs`
- `photo-pipeline/config/thresholds.json`
- `photo-pipeline/config/manifest.schema.json`
- `src/domain/photo-pipeline/manifest.ts`
- `src/domain/photo-pipeline/review.ts`
- `src/app/api/admin/photo-jobs/*`
- `src/app/admin/photo-jobs/*`
- `src/app/admin/layout.tsx`

**Prevention:**
- Processing mode must be explicit input, never inferred from a provider response shape.
- A semantic confidence field must be produced by a measurement of that semantic property; code-path constants may not be labeled as validation scores.
- Generative outputs always remain review-required, with hard critical-text signals visible to the human approver.
- Preserve Mode 1 output bytes in a cross-mode regression test whenever premium plumbing changes.

**Lesson Learned:**
A plausible confidence number is more dangerous than a missing one. Provider capability and operator intent are separate contracts: an endpoint returning a generated image does not authorize generative processing or prove label fidelity.

## BUG-2026-07-31-003: admin impersonation could write as the target or mutate an unbound target on read

**Symptoms:**
- The requested super-admin View-as feature had no safe identity boundary to reuse: admin routes read the session email directly, and writes would therefore either ignore the target or risk attributing target-scoped changes to the wrong person.
- The Myco admin GET calls `resolvePartnerForUser()`, which historically persisted the oldest active partner onto any user whose `partnerId` was null. Merely viewing an unbound user's Myco screen could permanently alter that real user's scope.

**Root Cause:**
Authentication, effective admin identity, and partner fallback were coupled inside individual routes. There was no central distinction between the authenticated actor and the read-only identity being observed, and the partner resolver treated a GET fallback as permission to write.

**Fix:**
- Added a signed, HttpOnly View-as target cookie plus `getAdminSession()`, which re-authenticates the actual database session and rechecks `super_admin` on every admin request before resolving a current `partner_admin` target.
- Routed every session-authenticated `/api/admin/**` handler through that helper, so role and partner ownership checks see the target only after the real-actor gate passes.
- Added an edge middleware guard that refuses non-read `/api/admin/**` methods while a valid View-as cookie is active.
- Passed explicit View-as state into the Myco partner resolver and suppressed its legacy default-partner write while observing another user.

**Files Modified:**
- `src/domain/auth/viewAs.ts`
- `src/domain/auth/adminSession.ts`
- `src/app/api/view-as/route.ts`
- `src/app/admin/layout.tsx`
- `src/app/admin/AdminShell.tsx`
- `src/middleware.ts`
- session-authenticated routes under `src/app/api/admin/`
- `src/app/api/admin/myco/route.ts`

**Prevention:**
- Impersonation state may select a read identity, never grant authority. Revalidate the real actor on every request and keep both identities explicit.
- Enforce observation-only behavior at a route-family boundary so a newly added admin mutation is denied automatically.
- GET fallbacks must not persist identity or ownership defaults when the request is observational.

**Lesson Learned:**
Safe View as is not session substitution. It is a separately authenticated, read-only projection with the real actor preserved and every hidden read-side write disabled.

---

## BUG-2026-07-31-002: Resend initialization made local Next.js builds require a runtime secret

**Symptoms:**
- `next build` failed during page-data collection when `RESEND_API_KEY` was unset.
- Importing the brand-portal route evaluated the shared email module even though the build was not sending email.

**Root Cause:**
`src/lib/email.ts` constructed `Resend` at module scope. The Resend constructor rejects a missing key, so merely importing the module turned a runtime email configuration requirement into a build-time requirement.

**Fix:**
- Added a cached lazy client factory that constructs `Resend` on the first call to `sendEmail`.
- Preserved fail-fast behavior on a real send; no placeholder API key is used.
- Added a regression test proving the first send still rejects when `RESEND_API_KEY` is unset.

**Files Modified:**
- `src/lib/email.ts`
- `src/lib/email.test.ts`
- `docs/CHANGELOG.md`
- `docs/BUG_LOG.md`

**Prevention:**
- Construct SDK clients that validate runtime-only credentials at the operation boundary when their modules are statically imported by Next.js routes.
- Test both sides of the boundary: secret-free module/build evaluation and a loud failure when the configured operation is attempted.

**Lesson Learned:**
Module-scope initialization can make runtime-only dependencies part of Next.js build evaluation. Lazy construction keeps the configuration check at the first operation without weakening it.

---

## BUG-2026-07-31-003: ESLint unused-binding false positive broke production build

**Symptoms:**
- Vercel production build for PR #55 failed with `Type error: Expected 0 arguments, but got 1`.
- The first surfaced failure was `src/app/api/admin/strains/[id]/route.ts`, where handlers still called `requireAuth(request)` after `requireAuth` had been changed to accept no arguments.
- The same mismatch existed in `src/app/api/admin/strains/image/route.ts` and `src/app/api/admin/strains/route.ts`.

**Root Cause:**
`eslint.config.mjs` enabled `@typescript-eslint/no-unused-vars` without honoring the repo's standard leading-underscore convention. Intentionally-unused parameters like `_request` were reported as lint errors, and the earlier lint-gate cleanup removed those parameters instead of configuring the rule correctly. Some call sites still passed the request object, so the tooling-driven edit became a TypeScript build failure.

**Fix:**
- Configured `@typescript-eslint/no-unused-vars` with `argsIgnorePattern`, `varsIgnorePattern`, and `caughtErrorsIgnorePattern` set to `^_`.
- Restored intentionally-unused request parameters on strain admin routes.
- Restored omitted catch bindings as underscore-prefixed values in the admin layout, admin strains page, and partner API routes.

**Files Modified:**
- `eslint.config.mjs`
- `src/app/api/admin/strains/[id]/route.ts`
- `src/app/api/admin/strains/image/route.ts`
- `src/app/api/admin/strains/route.ts`
- `src/app/api/admin/strains/visualizations/route.ts`
- `src/app/admin/layout.tsx`
- `src/app/admin/strains/page.tsx`
- `src/app/api/admin/partners/[id]/route.ts`
- `src/app/api/admin/partners/route.ts`
- `docs/CHANGELOG.md`
- `docs/BUG_LOG.md`

**Prevention:**
- Configure lint rules to match the codebase's intentional-unused naming convention before making mechanical cleanup edits.
- When changing a helper signature, search for and update all call sites in the same commit, then run the production build or typecheck gate that exercises route handlers.
- Treat leading-underscore bindings as an explicit author signal; do not delete them just to satisfy a default lint rule.

**Lesson Learned:**
Lint gates should encode established project conventions. If the rule is misconfigured, changing shipped code to appease it can turn a style false positive into a production build failure.

---

## BUG-2026-07-31-001: concurrent brand-link mints could hide an unrecoverable live credential

**Symptoms:**
- While one brand-link mint request was in flight, every other brand row remained enabled.
- A second successful mint replaced the first brand's raw URL in the single result card. Because the API stores only a SHA-256 hash, the first live URL could not be recovered and had to be rotated.

**Root Cause:**
`busyBrandId` disabled only the row whose request was running, while the page kept one shared `minted` result slot. React state also updates after the event handler returns, leaving a small same-render window where even globally disabled buttons alone would not stop two rapid mutations from starting.

**Fix:**
- Every brand row's mint, regenerate, and revoke action is disabled while any link mutation is running.
- A synchronous `useRef` guard rejects a second mutation before React renders the disabled state.
- Mint and revoke share the same guard so their reloads and token lifecycle writes cannot overlap from this screen.

**Files Modified:**
- `src/app/admin/myco/brand-links/page.tsx`
- `docs/CHANGELOG.md`
- `docs/BUG_LOG.md`

**Prevention:**
One-shot credential surfaces must serialize mutations at both layers of the UI: visible disabled state for the operator and a synchronous handler guard for events that arrive before the next render.

**Lesson Learned:**
Per-row loading state is unsafe when every row writes to one shared, non-recoverable result slot. The serialization boundary has to match the shared resource, not the row that launched the request.

---

## BUG-2026-07-29-001: staff-link mints were not serialised across the script and the admin route

**Symptoms:**
- Two concurrent mints (one via `scripts/mint-staff-link.mjs`, one via `POST /api/admin/myco/staff-links`) could both succeed, leaving two `active` `staff_review` `CatalogAccessToken` rows for the same partner. Under a shared unbound token the roster query *is* the access control, so a second live link is a second live door.
- Alternatively, an operator running the script with `--revoke-existing` after inspecting token A could revoke token B — a link minted concurrently by the admin route that the operator was never shown — while the script's success output read as "replaced A".

**Root Cause:**
Both entry points ran the same unguarded check-then-act: read the partner's active token, decide, then revoke and create. Nothing serialised the two sequences against each other, and `CatalogAccessToken` carries no uniqueness rule for "one active `staff_review` token per partner" (`@@index([partnerId, purpose, status])` is non-unique and enforces nothing). Separately, the script's revoke `updateMany` was conditioned only on partner/purpose/status, never on the id of the token the operator had actually inspected — so whatever was live at write time got revoked.

**The first fix was wrong, and why (this is the important part):**
The initial fix (`b784f26`) moved the read inside `$transaction` and asserted that "SQLite/Turso's single-writer serialisation" made the sequence atomic. **This database is PostgreSQL (Neon)** — see `datasource db` in `prisma/schema.prisma`. Under Postgres' default Read Committed isolation, a transaction boundary serialises nothing here, because the contended state is the *absence* of a row: two transactions can both read "no active link" and both proceed to create. The fix shipped green tests on top of a false premise about the database.

The premise came from somewhere real: `prisma/schema.prisma` still carried a top-of-file note reading `// Note: SQLite does not support enums`, a leftover from an earlier SQLite datasource that read as a statement about the current database. That note has been corrected in place.

That first attempt also left the revoke unconditioned, and its test asserted that revoking the uninspected replacement was "consistent" — encoding the defect as correct behaviour. A test can lock a bug in as a requirement; that one did.

**Fix (KEWL-2491):**
Two independent fixes, because neither closes the hole alone — a lock without the compare-and-swap still revokes the wrong token, and a compare-and-swap without the lock still lets two mints both create:

1. **Serialisation.** A new shared helper, `src/domain/myco/staffLinkMintLock.ts`, takes `pg_advisory_xact_lock` keyed on partner id + purpose. **Both** entry points call it, inside their transaction and *before* the active-token read. Transaction-scoped (`_xact_`) so it releases on COMMIT and ROLLBACK alike — a refusal that throws mid-transaction cannot leak a held lock onto a pooled connection. An advisory lock rather than a partial unique index because it needs no DDL against live data that may already violate the constraint.
2. **Compare-and-swap.** The script captures the inspected token id *before* the transaction, and inside the locked section refuses — writing nothing — if the live token id differs, including the "nothing inspected, something appeared" case. The revoke `where` carries that id **alongside** the partner/purpose/status predicate, so the id is the CAS and the predicate remains the KEWL-2480 blast-radius guard.

The admin route takes the lock **only**. Its `updateMany` supersede-all is deliberately unconditional — it is an authenticated admin action with no inspected-token premise, and its documented contract is that a forwarded old link stops working the moment a new one is minted. A CAS there would let a forwarded link survive a re-mint, which is a security regression, not symmetry.

**Files Modified:**
- `src/domain/myco/staffLinkMintLock.ts` (new) — the one lock helper both entry points share; FNV-1a key derivation into signed int32 (what `pg_advisory_xact_lock(int, int)` requires).
- `src/domain/myco/staffLinkMintLock.test.ts` (new) — key determinism (the load-bearing property: if the two callers ever derived different keys, both would look locked while blocking nobody), int32 range, and that the lock is awaited before returning.
- `scripts/mint-staff-link.lib.mjs` — lock before the read; `planTokenAction` gained the CAS branch; revoke scoped to the inspected id; the false SQLite/Turso comment deleted.
- `scripts/mint-staff-link.lib.test.mjs` — the "revoking the replacement is consistent" test inverted to assert a refusal; added the no-token-inspected case, lock-ordering cases, and the refuse-path lock case.
- `src/app/api/admin/myco/staff-links/route.ts` — takes the shared lock; supersede-all unchanged.
- `src/app/api/admin/myco/staff-links/route.test.ts` (new) — proves the route takes the *same* key the script does, and pins the deliberate absence of a CAS on this path.
- `prisma/schema.prisma` — corrected the stale "SQLite does not support enums" note that made the first fix's premise look true.

**Verification:**
Each fix was mutation-tested independently against the full suite: removing the script's lock fails 4 tests, removing the route's lock fails 3, reverting the CAS fails 5. No production token was minted or revoked to verify this.

**Lesson:**
Two lessons, and the second is the one that cost a review cycle.

1. Check-then-act on shared mutable state needs a contention point. A transaction is not one by itself — under Read Committed there is nothing to contend on when the answer is "no row exists". Either a lock or a uniqueness constraint has to create the thing that conflicts.
2. **Verify which database you are reasoning about before reasoning about isolation.** The fix was argued from a comment in the schema file rather than from the `datasource` block eight lines above it, and the tests were written to match the reasoning instead of the behaviour — so they passed. A stale comment is a live hazard: when you find one, fix it in the same change, or the next person repeats the mistake.

---

## BUG-2026-07-28-001: Dose ladder divided by active-compound mg produced overdose-direction unit counts

**Symptoms:**
- A product with a verified 1 mg psilocin unit could render a four-digit `suggestedUnits` suggestion (e.g. `1500-3500 capsules`) at Level 4.
- A 5 mg psilocybin unit produced `300-700` unit suggestions.
- Counts were wrong in the overdose direction and looked plausible enough to ship.

**Root Cause:**
`CANONICAL_DOSE_LEVELS` is expressed in **dried-mushroom-equivalent milligrams** (L1 `50-250`, L6 `5000-7500`; the dosing guide renders L2-L6 as quarter-gram boundaries). `scoring.ts` divided that ladder by `adminConfig.productUnitMg`, which KEWL-2033 defines as **verified active-compound milligrams**. The two quantities are on different bases, so the division was never like-for-like — it silently reinterpreted a gram-scale mushroom ladder as an active-compound ladder.

An active-compound allowlist alone does **not** fix this: passing the compound gate says "this is psilocybin", not "this mass is comparable to dried mushroom mass".

**Fix:**
- Added `CANONICAL_DOSE_BASIS` next to `CANONICAL_DOSE_LEVELS` so the ladder's basis is explicit in code.
- Added `src/domain/recommendation-engine/doseBasis.ts` holding two independent, fail-closed dose-output gates: the active-compound gate and the ladder-basis gate. Neither gate removes the product itself from candidacy.
- `suggestedUnits` is emitted only when an explicit same-basis divisor exists (`unitMaterialMassMg` + `materialMassBasis`). A non-null material mass alone is never sufficient — extracts, proprietary blends, and net edible weight are explicitly rejected.
- Made `suggestedUnits` optional and split product eligibility from unit emission so unsupported/unknown compounds and incompatible bases keep the name/photo/link while all dose output fails closed.

**Files Modified:**
- `src/domain/recommendation-engine/doseBasis.ts` (new)
- `src/domain/recommendation-engine/types.ts`
- `src/domain/recommendation-engine/scoring.ts`
- `src/domain/recommendation-engine/service.ts`
- `src/domain/myco/candidates.ts`
- `wordpress-plugin/tripdar-recommendation-engine/assets/js/recommendation-engine.js`

**Prevention:**
- Any division of a dose ladder must assert that numerator and denominator share a basis. Store the basis as a structured field, never infer it from a non-null magnitude.
- When a field's meaning is narrowed (here `productUnitMg` → active-compound only), audit every existing arithmetic consumer of it in the same change; the column can be correct while its readers are wrong.
- Suppressing a derived value should degrade the surface, not delete the whole object — gate the smallest unsafe part.

**Lesson Learned:**
Two milligram values are not interchangeable just because both are milligrams. A unit mismatch between a ladder and its divisor produces confident, plausible, wrong numbers rather than an obvious failure — and in dose math the failure direction was toward overdose.

---

## BUG-2026-07-25-001: Myco product strain typos silently dropped canonical strain data

**Symptoms:**
- A `StoreProductCatalog` product stored `strainSlug` as `"Golden Teacher"` instead of `"golden-teacher"`.
- Customer-facing strain enrichment failed silently because the join expected the canonical strain id.

**Root Cause:**
The Myco admin form historically allowed free-text strain entry, and server write routes persisted that text without resolving it against the canonical strain catalog.

**Fix:**
- Added shared `normalizeStrainSlug()` / `isValidStrainSlug()` helpers in `src/domain/strain/data.ts`.
- Myco create, update, and duplicate write paths normalize valid strain names/ids to canonical ids and reject unresolved non-empty values with HTTP 400.
- Admin create/edit forms use the existing strain dropdown with a blank "none" option.
- Added a drift check script for non-null `StoreProductCatalog.strainSlug` values.

**Files Modified:**
- `src/domain/strain/data.ts`
- `src/app/api/admin/myco/route.ts`
- `src/app/api/admin/myco/[id]/route.ts`
- `src/app/api/admin/myco/[id]/duplicate/route.ts`
- `src/app/api/v1/dosing-guide/[token]/route.tsx`
- `src/app/admin/myco/page.tsx`
- `scripts/check-myco-strain-slug-drift.mts`
- `package.json`

**Prevention:**
- Catalog-like fields must resolve through the domain owner before persistence; UI dropdowns are guardrails, not the source of truth.
- Read paths should warn on non-null lookup misses so drift becomes visible before users report missing data.

**Lesson Learned:**
Free-text joins against a fixed catalog fail quietly unless writes normalize and unresolved values are rejected at the boundary.

---

## BUG-2026-06-12-001: Product-scoped Myco admin routes missing partner ownership checks

**Symptoms:**
- No user-visible symptom — found during the flavor/recipe design review.
- `/api/admin/myco/[id]` (PATCH), `[id]/duplicate`, `[id]/photos` (POST), and `[id]/photos/[photoId]` (PATCH/DELETE) only checked that *a* session existed, then operated on any product ID.
- A partner admin with another partner's product ID could read its full data (via duplicate — the copy landed under their view), modify it, or delete its photos.
- The photo PATCH/DELETE additionally never verified the photo belonged to the product in the URL.

**Root Cause:**
The main `/api/admin/myco` route gained ownership resolution when BUG-2026-06-09-001 was fixed, but the product-scoped sub-routes were written with only `requireAuth()` (session presence) and were never retrofitted. Authorization lived in one route instead of a shared helper, so every new sub-route silently shipped without it.

**Fix:**
- Added `resolveProductForAdmin(email, productId)` (`src/domain/myco/adminAccess.ts`): role check first, then partner-ownership comparison; super admins pass, partner admins must own the product's partner. Returns 404 (not 403) for foreign products so existence isn't leaked.
- Applied to all five product-scoped handlers.
- Photo PATCH/DELETE now scope by `{ id: photoId, catalogItemId: id }` so a photo from another product 404s.

**Files Modified:**
- `src/domain/myco/adminAccess.ts` (new)
- `src/app/api/admin/myco/[id]/route.ts`
- `src/app/api/admin/myco/[id]/duplicate/route.ts`
- `src/app/api/admin/myco/[id]/photos/route.ts`
- `src/app/api/admin/myco/[id]/photos/[photoId]/route.ts`

**Prevention:**
- Ownership verification belongs in a shared domain helper, not inline in one route — sub-routes inherit it by calling the helper, not by remembering to copy the pattern.
- When adding any `[id]`-scoped admin route, the checklist is: auth → `resolveProductForAdmin` → operation scoped by both ids.

**Lesson Learned:**
Fixing an authorization bug in one route (BUG-2026-06-09-001) does not fix the class of bug. Audit sibling routes for the same gap while the failure mode is fresh — this one sat unnoticed in four handlers.

---

## BUG-2026-06-09-001: Myco partner admin sees "Create an active partner" despite assigned partner

**Symptoms:**
- Audrey could log in to `/admin/myco`, but the UI showed "Create an active partner before configuring Myco products."
- Production data still had an active `Partner` for The Mushroom Top and Audrey's `User.partnerId` still pointed at it.
- This blocked product entry even though the partner setup itself was intact.

**Root Cause:**
The Myco GET route trusted any `partnerId` query param before checking the logged-in user's assigned partner. If a partner admin arrived with a stale/bad `partnerId` value, `resolvePartnerForUser()` returned `null` instead of falling back to the user's `partnerId`, which made the frontend render the no-partner empty state. This was also a partner-isolation hole: a partner admin could request another partner's id.

**Fix:**
- Changed `resolvePartnerForUser()` so partner admins are pinned to their assigned `User.partnerId` first.
- Super admins can still select a requested partner by query param.
- Bad requested partner ids now fall back to the active default instead of stranding the UI.
- Product creation now verifies partner admins can only create under their assigned partner.

**Files Modified:**
- `src/app/api/admin/myco/route.ts`
- `docs/CHANGELOG.md`
- `docs/BUG_LOG.md`

**Prevention:**
- Never let partner-scoped request params override the authenticated user's ownership scope for partner_admin users.
- For partner admin routes, auth/role check comes first, ownership resolution second, user-supplied ids last and only for super_admin selection.

**Lesson Learned:**
An empty-state message can be an authorization-resolution bug, not missing data. Verify the DB first, then check whether request parameters can bypass the user's assigned ownership scope.

---

## BUG-2026-06-03-001: Myco photo upload returns HTTP 500 (Next.js 16 async params)

**Symptoms:**
- Uploading a product photo in the Myco admin (`/admin/myco`) always failed with a red banner "Failed to upload product photo"
- Affected both the create-product pending-photo flow and the per-product "Add photo" uploader
- Zero photos ever made it into the DB across all products
- Product creation worked fine; only the photo routes (and other dynamic `[id]` routes) failed

**Root Cause:**
The project was upgraded to Next.js 16 (commit 03069fd, Dec 31), which changed route-handler `params` from a synchronous object to a `Promise`. Most routes were migrated to `params: Promise<{...}>` + `await params`, but the newer Myco routes were written with the OLD synchronous signature `{ params }: { params: { id: string } }`. In Next 16, accessing `params.id` synchronously returns `undefined`, so `prisma.storeProductCatalog.findUnique({ where: { id: undefined } })` threw `PrismaClientValidationError: Argument 'where' needs at least one of 'id' arguments`. The route caught it and returned a generic 500.

**How it was found:**
Reproduced the upload in a real browser session against production, then captured the actual server exception via `vercel logs <deployment-id>` streamed to a file while triggering the upload. The log showed `id: undefined` in the Prisma call — the decisive clue. (Earlier indirect theories — stale blob token, missing env var, body-size limit — were all disproven: the blob token worked from Node, the env var had existed since Feb, and the full path ran clean locally.)

**Fix:**
Changed all 4 Myco dynamic routes to `params: Promise<{...}>` and `await params`:
- `src/app/api/admin/myco/[id]/photos/route.ts`
- `src/app/api/admin/myco/[id]/photos/[photoId]/route.ts`
- `src/app/api/admin/myco/[id]/route.ts`
- `src/app/api/admin/myco/[id]/duplicate/route.ts`

**Prevention:**
- When adding a new dynamic API route, copy the `params: Promise<...>` + `await params` pattern from an existing route — never the bare sync object.
- A generic catch-all `catch (error) { return 500 "Failed to..." }` hides the real exception. When debugging, get the actual error from `vercel logs <deployment-id>` (stream to a file — the CLI buffers and won't flush through a pipe) rather than guessing.

**Lesson Learned:**
A framework major-version upgrade can leave a mix of old/new route signatures. Don't trust "but editing works" as proof a shared mechanism is fine — the working route (product PATCH) read its id differently than the broken one. Always capture the real server-side error before theorizing.

---

## BUG-2026-02-16-001: WordPress vibe filter showing only 4 vibes instead of 7-9

**Symptoms:**
- WordPress plugin vibe filter dropdown showed only 4 options (bright, clear, playful, social) instead of expected 7-9 popular vibes
- Issue persisted even after clearing WordPress cache and configuring API authentication
- Dynamic vibe generation code appeared correct but wasn't working as intended

**Root Cause:**
The vibe counting logic in `class-shortcodes.php` (lines 727-740) was analyzing only the **first page of paginated results** (12 strains) instead of the full catalog (25 strains). Since the filter was set to show vibes appearing in 3+ strains, only vibes common in that first-page subset were displayed.

**Technical Details:**
```php
// BEFORE (line 718):
$response = $this->api_client->get_strains(1, intval($atts['per_page']), $filters);
$strains = $response['data']['strains'] ?? [];

// Vibe counting used $strains (only 12 items)
foreach ($strains as $strain) {
    // ... count vibes
}
```

The code fetched strains with `per_page=12` for display pagination, then used that same limited dataset to build the vibe filter options.

**Fix:**
Added a separate API call to fetch all strains (pageSize=100) specifically for vibe frequency counting, while keeping the paginated response for card display:

```php
// Fetch ALL strains to count vibes across entire catalog
$all_strains_response = $this->api_client->get_strains(1, 100, $filters);
$all_strains = ($all_strains_response && isset($all_strains_response['success']) && $all_strains_response['success'])
    ? ($all_strains_response['data']['strains'] ?? [])
    : $strains;

// Use $all_strains for vibe counting
foreach ($all_strains as $strain) {
    // ... count vibes across full dataset
}
```

**Files Modified:**
- `wordpress-plugin/tripdar-strain-explorer/includes/class-shortcodes.php` (lines 718-729)
- `wordpress-plugin/tripdar-strain-explorer/tripdar-strain-explorer.php` (version bump to 1.3.5)
- `docs/CHANGELOG.md` (added 1.3.5 entry)

**Prevention:**
When building filter dropdowns or summary statistics from paginated data:
1. **Always fetch the complete dataset** for counting/aggregation, not just the first page
2. **Separate concerns**: Use one query for display (paginated), another for filters/stats (unpaginated)
3. **Test with pagination**: If you only test with `per_page=100`, you won't catch pagination bugs
4. **Document assumptions**: If code assumes all data is present, add a comment or assertion

### Lesson Learned
Dynamic filters must operate on the complete dataset, not a paginated subset. When implementing client-side filtering (like the vibe dropdown), always ensure the aggregation logic sees all records, even if the UI displays them in pages. This is especially critical when the filter threshold (3+ appearances) depends on global frequency across the entire catalog.

**Debugging Notes:**
- Initially suspected cache issues since problem persisted after cache clear
- WordPress transient cache was correctly cleared (verified with SQL query)
- Issue was architectural: correct data in cache, but wrong subset used for counting
- Browser network inspection would have revealed the API was returning correct data with full vibe arrays
- The fallback hardcoded vibes on line 744 (9 vibes) were never triggered, confirming some vibes were being counted - just from wrong dataset
