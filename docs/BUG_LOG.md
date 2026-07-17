# Bug Log

This document tracks significant bugs, their root causes, fixes, and lessons learned to build institutional memory for future development.

---

## BUG-2026-07-17-001: Phase 1 guide described unsafe metadata-free mixed-product intake

**Symptoms:**
- The operator guide said products from different brands could be processed together and that missing metadata only made filenames less readable.
- The actual batch CLI correctly requires `--sku` and `--product` and applies that single identity to every image in the invocation.

**Root Cause:**
The human-facing guide described the intended ease of use rather than the shipped worker boundary. It omitted the required package-identity grouping stage between an immutable raw drop and the single-identity batch worker.

**Fix:**
- Rewrote the guide around the safe flow: immutable Desktop raw drop → package-visible grouping → human confirmation for ambiguity/near variants → one explicit-metadata worker invocation per confirmed group.
- Added the `group` pre-processor, traceable source hashes/copies, exact-once coverage checks, and variant confirmation flags.

**Files Modified:**
- `docs/photo-pipeline/operator-guide.md`
- `docs/photo-pipeline/README.md`
- `scripts/photo-pipeline/README.md`
- `scripts/photo-pipeline/cli.mjs`
- `scripts/photo-pipeline/grouping.mjs`
- `scripts/photo-pipeline/grouping.test.mjs`

**Prevention:**
Dry-run documented CLI examples before promising unattended intake. A batch option that accepts one identity must never be documented as safe for unknown mixed products.

**Lesson Learned:**
Fail closed at catalog identity boundaries. Automation may propose package groups, but visible variant ambiguity requires human confirmation before metadata reaches persistent product records.

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
