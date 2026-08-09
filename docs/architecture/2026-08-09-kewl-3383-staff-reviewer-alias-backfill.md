# KEWL-3383 Staff Reviewer Alias Backfill — Architecture Review

## Recommended architecture

Backfill exactly the five verified TMT `StaffReviewerIdentityAlias` rows that bridge legacy `@themushroomtop.internal` reviewer rows to the corresponding real-email `MycoEmployee` rows. Do not create aliases for Adrienne or Sage because each has only one verified side of the identity pair.

`computeFieldStates()` remains the canonical field-gate replay boundary. It must receive partner-scoped aliases anywhere `CatalogFieldChange` rows are replayed so Tier-B distinct-reviewer counting uses the canonical real-email employee id.

Ruling for `MycoEmployeeReviewAssignment`: alias-awareness must extend there before new assignment work is built. The current `@@unique([catalogItemId, employeeId])` protects only raw employee ids and would allow two assignment rows for one human when the legacy and real rows both exist. Assignment creation should resolve the canonical reviewer id before checking or inserting assignments, and any product-level "already assigned" query should check both the canonical employee id and its known legacy aliases.

## Risks

- Security: Low direct risk; aliases do not grant access by themselves. The risk is incorrect identity folding if an unverified alias is inserted.
- Data integrity: High if omitted. One human can prospectively satisfy a two-distinct-reviewer gate alone by using both employee rows.
- Operational: Medium. The backfill must run before KEWL-3379 sends shared-link PIN drafts, otherwise new legacy-row activity can create mixed-identity history.

## Migration impact

- Files affected: no schema migration. Production data change only in `StaffReviewerIdentityAlias`.
- Downtime: no.
- Rollback plan:
  1. Read back the five inserted ids for `partnerId = 13720283-cb0d-4368-be0e-016638d859a9`.
  2. Delete only those five rows by exact `(partnerId, legacyEmployeeId, employeeId)` tuple if a mapping is proven wrong.
  3. Recompute affected catalog field states from `CatalogFieldChange` if any writes happened after the bad alias was introduced.

## Files likely affected

- `src/domain/myco/staffReviewService.test.ts`
- `src/domain/myco/staffFieldVerification.ts`
- `src/app/api/myco/staff-review/[token]/products/route.ts`
- `src/app/api/myco/staff-review/[token]/products/[productId]/route.ts`
- Future assignment work: `MycoEmployeeReviewAssignment` creation/query paths.

## What must be tested

- Pre-deploy: focused regression test for `computeFieldStates()` with one legacy and one real submission on the same Tier-B field.
- Production pre-write: verify all ten mapped employee ids exist under the TMT partner, verify names/emails match the intended humans, verify zero existing alias rows for the five pairs, and verify no Adrienne or Sage alias exists.
- Production post-write: read back exactly five TMT alias rows for the requested mappings and assert no Adrienne/Sage alias row exists.

## Approval gates

Jon must explicitly approve the production data insert because it changes live identity canonicalization for staff review gates. No schema migration is involved.

Before future assignment work ships, Jon must approve the alias-aware assignment invariant because it affects whether duplicate assignment rows are permitted or folded.

## Decision rationale

This design preserves the append-only `CatalogFieldChange` log and avoids rewriting reviewer history. Rewriting historical `actorIdentity` values was rejected because it weakens auditability and would make it harder to reconstruct which link/roster path produced a change. Adding aliases for everyone was rejected because Adrienne and Sage do not have verified counterpart rows. Leaving assignments raw-id keyed was rejected because it repeats the same identity split in a write model whose uniqueness constraint is not human-canonical.
