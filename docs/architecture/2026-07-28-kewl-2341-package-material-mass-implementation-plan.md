# KEWL-2341 Tripdar Package-Material Mass Split - Architecture Review

Revision: 2026-07-28, KEWL-2344 sequencing update.

Status: implementation plan and migration draft only. No production migration, data mutation, product activation, or dose-field clearing has been performed.

## Recommended architecture

Keep `StoreProductCatalog.productUnitMg` and `StoreProductCatalog.totalDoseMg` as verified active-compound dose fields only. They must represent milligrams of a verified active compound per consumer unit and per package, not mushroom weight, fruiting-body mass, extract mass, chocolate mass, gummy mass, or proprietary-blend mass.

Add separate material-mass columns to the catalog so package facts can be retained without entering psilocybin dose math:

- `packageMaterialMassMg Int?`: total package-level mushroom/material/blend mass in mg.
- `unitMaterialMassMg Int?`: per-unit mushroom/material/blend mass in mg.
- `materialMassBasis String?`: app-validated values: `fruiting_body`, `mushroom_material`, `whole_fruit_body_extract`, `proprietary_blend`, `net_edible_weight`, `unknown`.
- `materialMassSource String?`: app-validated/source-labeled values such as `package_ocr`, `vendor`, `human_verified_package`, `import_note`, `jon_ruling`, `unknown`.
- `activeCompound String @default("unknown")`: app-validated values: `psilocybin`, `psilocin`, `muscimol`, `functional-only`, `unknown`.
- `activeCompoundSource String?`: source label such as `jon_ruling`, `vendor`, `coa`, `human_verified_package`, `unknown`.

Add the same staging fields to `UnverifiedProduct` so customer/vendor submissions can carry structured package claims before promotion without forcing those claims into `dosageInfo` or `productUnitMg`.

Treat `StrainRecommendationConfig.productUnitMg` as legacy verified active-compound mg per unit only. Add legacy-safe companion fields prefixed with `product` for active compound and material mass. This avoids silently changing the meaning of existing WordPress/admin integrations while giving that surface a safe place to store package claims if it still accepts them.

Readiness and recommendation behavior must fail closed:

- Recommendation readiness requires `productUnitMg`, `unitsPerPack`, and `activeCompound` in the supported psilocybin-family set.
- Supported for the current psilocybin dose engine: `psilocybin`, `psilocin`.
- Blocked from psilocybin dose math: `unknown`, `functional-only`, `muscimol`, blank/missing, or any unrecognized value.
- A material-mass-only product can show factual package information in admin/review contexts, but it must not produce mg-based dose guidance or become recommendation-ready.
- Do not infer active psilocybin/psilocin mg from grams of mushroom, fruiting body, extract, blend, package text, or OCR.

## Risks

- Security: No new secrets are required. Keep production database URLs and env files out of comments and remediation exports.
- Data integrity: The schema migration is additive, but the later remediation is lossy if `productUnitMg` / `totalDoseMg` are cleared without an approved export. The remediation must be a separate approved mutation with exact row IDs and before/after values.
- Operational: Current admin create/edit code requires `productUnitMg` and auto-computes `totalDoseMg`. That must change before operators import material-mass-only review products, or the bad path will recur.
- Recommendation safety: Existing code can compute `mgLow` / `mgHigh` from any non-null `productUnitMg`. Candidate loading must also filter by supported `activeCompound`, not only by readiness text.
- Live outage risk: Because the draft migration defaults existing rows to `activeCompound='unknown'`, fail-closed candidate enforcement must not ship until existing active recommendation-eligible products have an explicit Jon-approved active-compound backfill, or the entire live catalog can be excluded from recommendations while product pages still render.
- Compatibility: Existing clients that read `productUnitMg` continue to work, but labels and API payloads need clarification so downstream surfaces do not display material mass as active dose.
- Cross-product separation: This plan is scoped to Tripdar. Do not reuse PsillyOps schema or production data paths.

## Migration impact

- Files affected by this planning heartbeat:
  - `docs/architecture/2026-07-28-kewl-2341-package-material-mass-implementation-plan.md`
  - `docs/migration-drafts/kewl-2341/package-material-mass-split.sql`
  - `docs/migration-drafts/kewl-2341/schema.prisma.patch`
- Files likely affected when implementation is approved:
  - `prisma/schema.prisma`
  - generated Prisma client
  - `src/domain/myco/readiness.ts`
  - `src/domain/myco/readiness.test.ts`
  - `src/domain/myco/candidates.ts`
  - `src/domain/myco/dose.ts`
  - `src/domain/myco/dose.test.ts`
  - `src/domain/myco/scoring.ts`
  - `src/domain/recommendation-engine/scoring.ts`
  - `src/domain/recommendation-engine/service.ts`
  - `src/app/api/admin/myco/route.ts`
  - `src/app/api/admin/myco/[id]/route.ts`
  - `src/app/api/admin/myco/[id]/duplicate/route.ts`
  - `src/app/admin/myco/page.tsx`
  - `src/app/api/myco/product-review/[token]/route.ts`
  - `src/app/t/[id]/page.tsx`
  - `src/app/api/v1/admin/recommend/strains/[slug]/config/route.ts`
  - `src/app/api/v1/admin/recommend/strains/route.ts`
  - `wordpress-plugin/tripdar-recommendation-engine/admin/class-admin.php`
- Downtime: no expected downtime for nullable column adds and defaulted string columns on the current Postgres schema. Schedule normally because the generated client and app code must roll forward with the migration.
- Draft migration location: `docs/migration-drafts/kewl-2341/package-material-mass-split.sql`. It is intentionally outside `prisma/migrations/` and is not deployable until copied into a timestamped migration after approval.
- Rollback plan:
  1. Before migration, verify `_prisma_migrations` exists and migration deploy is not using any replay/sync script that can re-run historical migrations.
  2. If schema-only deploy fails before app rollout, restore the previous app build and do not run data remediation.
  3. If new columns must be removed, first stop all code paths writing new fields, export rows where any new column is non-null, then drop only the new columns.
  4. If remediation later clears dose fields, rollback requires the approved pre-mutation export. Do not rehydrate `productUnitMg` / `totalDoseMg` from material fields or package grams.

## Implementation sequence

1. Create a fresh `request_confirmation` for Jon covering the schema migration only, referencing this plan revision and the exact SQL draft. This approval does not authorize fail-closed recommendation enforcement or any data backfill.
2. After approval, move the SQL into a normal timestamped Prisma migration directory and apply the matching `schema.prisma` changes from `docs/migration-drafts/kewl-2341/schema.prisma.patch`.
3. Update generated Prisma client in the implementation branch.
4. Add centralized app validators/constants for:
   - active compounds: `psilocybin`, `psilocin`, `muscimol`, `functional-only`, `unknown`.
   - supported psilocybin dose compounds: `psilocybin`, `psilocin`.
   - material bases and source labels.
5. Update create/edit/admin review APIs to accept material fields, active-compound fields, and inactive/in-review products without `productUnitMg`.
6. Update readiness copy/diagnostics so missing text says `verified active-compound mg per unit`, and blocked compounds add explicit missing/blocker messages. During this compatibility phase, do not wire `activeCompound='unknown'` into the production recommendation candidate exclusion path for existing active rows.
7. Add tests for material-mass-only, unknown compound, muscimol, functional-only, psilocybin, and psilocin cases, including one regression test that demonstrates defaulted existing active rows would be excluded once enforcement is enabled unless they are backfilled first.
8. Create a second fresh `request_confirmation` for Jon covering the active customer-facing catalog backfill only. This confirmation must include the exact export/update set for currently active, unarchived products that are recommendation-eligible under the pre-KEWL-2341 rules.
9. Only after Jon approves the active-catalog backfill, run a transactional backfill that changes only `activeCompound` and `activeCompoundSource` for the exact approved active row IDs. Do not clear dose fields, infer active mg from gram/package/material mass, activate products, change photos, brands, notes, ingredients, flavors, vibe profiles, strength offsets, or alter the G23 research-only restriction.
10. Verify the active-catalog backfill before enforcement:
    - approved row count equals updated row count exactly.
    - every active, unarchived pre-existing product that remains recommendation-eligible has `activeCompound IN ('psilocybin', 'psilocin')` or is explicitly listed as a known exclusion with a reason.
    - a direct production read of the existing active catalog returns a non-zero count of products that satisfy `active=true`, `archivedAt IS NULL`, legacy readiness inputs, and supported `activeCompound`.
11. Only after step 10 passes, update candidate loading and dose guidance so unsupported or unknown active compounds never enter psilocybin dose math even if legacy `productUnitMg` is non-null.
12. Deploy the fail-closed enforcement and immediately run the non-zero candidate-count post-deploy check against the existing active catalog.
13. Create a third fresh `request_confirmation` for Jon before inactive review-record remediation. This confirmation must include the exact export/update set and must reference the KEWL-2033 per-record table.
14. Only after that third approval, run a transactional remediation script against the approved inactive review row set. Keep all 21 review products inactive/in-review, preserve photos, brands, notes, package evidence, Audrey-entered active records outside the approved active-compound metadata backfill, and the G23 research-only restriction.

## Active-catalog backfill plan

This backfill exists only to prevent a recommendation outage caused by the schema default plus fail-closed enforcement. It must happen after the schema exists and before candidate filtering treats `unknown` as excluding existing active products.

Source set:

- Active, unarchived `StoreProductCatalog` rows for the affected partner/catalog that are recommendation-eligible under the current production rules before KEWL-2341 enforcement.
- Export by `id`, `partnerId`, `productName`, `active`, `archivedAt`, `intakeStatus`, `productUnitMg`, `unitsPerPack`, `totalDoseMg`, `activeCompound`, `activeCompoundSource`, `brand`, `brandId`, `strainSlug`, `notes`, `photoUrl`, `ingredients`, `flavors`, `updatedAt`, plus related readiness records used by the candidate path.

Classification rules:

- Set `activeCompound='psilocybin'` or `activeCompound='psilocin'` only where the existing active-dose field is already verified as that active compound by approved catalog provenance, package evidence, COA/vendor evidence, or Jon ruling.
- If evidence is insufficient, leave `activeCompound='unknown'`, list the row as an intentional recommendation exclusion, and do not ship fail-closed enforcement until Jon accepts the resulting candidate-count impact.
- Do not infer active compound or active mg from mushroom grams, material mass, extract mass, blend weight, package size, or OCR text.
- Touch only `activeCompound` and `activeCompoundSource` in this active-catalog batch.

Rollback for active-catalog backfill:

- Use the pre-backfill export as the only rollback source.
- Restore only `activeCompound` and `activeCompoundSource` for the exact approved active row IDs.
- Re-run the non-zero candidate-count check after rollback if fail-closed enforcement has already deployed.

## Inactive review-record remediation execution plan

Use the KEWL-2033 per-record table in `docs/architecture/2026-07-18-kewl-2033-package-material-mass.md` as the source of the proposed update set. That table is not itself permission to mutate production.

Pre-mutation checks:

- Export the exact target rows by `id`, including `active`, `intakeStatus`, `archivedAt`, `productUnitMg`, `unitsPerPack`, `totalDoseMg`, all new compound/material fields, `brand`, `brandId`, `strainSlug`, `notes`, `photoUrl`, `ingredients`, `flavors`, and `updatedAt`.
- Export related `ProductPhoto`, `ProductVibeProfile`, `ProductStrengthOffset`, and `MycoEmployeeProductReview` rows for the same catalog IDs.
- Verify all 21 review products are still `active=false` or otherwise not customer-facing before batch remediation.
- Separately verify G13/G17 live remediation remains tracked by KEWL-2327 and is not included in the inactive-record batch.
- Verify no planned update sets `active=true`, changes `archivedAt`, deletes photos, changes `brandId`, rewrites notes without preserving prior text, or touches G23 consumption metadata beyond preserving the research-only restriction.

Mutation rules after explicit approval:

- `verified active-compound dose`: keep `productUnitMg` / `totalDoseMg`; set `activeCompound` and source fields from approved evidence; optionally add factual material mass if separately evidenced.
- `package/material mass`: move factual mass into material fields; clear `productUnitMg` and `totalDoseMg`; set `activeCompound` to `unknown` unless separately verified; keep inactive.
- `unknown`: set `activeCompound='unknown'`; keep dose fields blank or clear them exactly as approved; do not populate material fields without package/vendor/operator evidence; keep inactive.
- Never calculate psilocybin or psilocin mg from gram/package/material mass.

Post-mutation checks:

- Compare affected row count to the approved update set exactly.
- Verify all 21 review products remain inactive/in-review and `archivedAt IS NULL` unless already archived before the export.
- Verify every row with `productUnitMg IS NOT NULL` has `activeCompound IN ('psilocybin', 'psilocin')` or is documented as a temporary exception.
- Verify every row with only material mass has `productUnitMg IS NULL` and `totalDoseMg IS NULL`.
- Verify G23 remains inactive and notes still preserve research/microscopy-only restriction.
- Verify photos, brands, notes, package evidence, Audrey-entered active records, ingredients, flavors, vibe profile, and strength offset are unchanged except for approved fields.

Rollback for data remediation:

- Use the pre-mutation export as the only rollback source for cleared dose fields.
- Restore only approved columns for the exact rows in the remediation batch.
- Do not repopulate active dose fields from material mass.
- Re-run post-mutation checks after rollback and attach the before/after diff to the issue.

## What must be tested

- Pre-deploy:
  - SQL diff is additive-only.
  - `_prisma_migrations` exists in the target database.
  - No migration/sync script can replay all historical migrations.
  - Prisma schema validates after applying the draft patch locally.
  - Admin create/edit accepts inactive/in-review products with blank active dose.
  - Admin create/edit shows separate material mass fields and labels `productUnitMg` as verified active-compound mg.
  - Readiness blocks material-mass-only products.
  - Readiness blocks `unknown`, `functional-only`, `muscimol`, missing, and unrecognized active compounds.
  - Recommendation candidates exclude unsupported compounds independently of UI readiness display after the active-catalog backfill gate is complete.
  - A test or scripted check proves the default `unknown` state would produce zero or reduced candidates before active-catalog backfill, so the sequencing guard cannot regress silently.
  - Dose guidance omits active mg text when no verified active-compound mg exists.
- Post-deploy:
  - New columns exist on `StoreProductCatalog`, `UnverifiedProduct`, and `StrainRecommendationConfig`.
  - No catalog rows changed during schema-only migration except default `activeCompound` / `productActiveCompound` values created by the database.
  - The 21 review products remain inactive/in-review.
  - Existing active customer-facing product pages still render.
  - Recommendation results do not include products with unsupported active compounds.
  - Recommendation candidate count for the existing active catalog is non-zero after fail-closed enforcement; attach the count query, partner scope, timestamp, and result to the issue.
  - Admin can save material mass without writing `productUnitMg`.
  - Migration entry appears exactly once in `_prisma_migrations`.

## Approval gates

Jon must explicitly approve:

- Copying the draft SQL into `prisma/migrations/` or applying any schema migration.
- Any production migration command.
- Any data mutation that clears, backfills, or changes `productUnitMg`, `totalDoseMg`, material-mass fields, or active-compound fields.
- The exact active-catalog `activeCompound` / `activeCompoundSource` backfill export/update set before fail-closed recommendation enforcement can ship.
- Shipping fail-closed candidate enforcement if the active-catalog backfill leaves any currently recommendable active products intentionally excluded.
- The exact inactive review-record remediation export/update set derived from the KEWL-2033 table.
- Any customer-facing remediation for G13/G17, which remains separately tracked by KEWL-2327.
- Any product activation or readiness override after remediation.
- Any change to auth/session/token behavior, if later implementation accidentally touches those paths.

## Decision rationale

Chosen design: additive nullable material-mass fields plus explicit active-compound/source fields, with fail-closed application validation.

Chosen sequencing: ship schema and compatibility validators first, then require a separate Jon-approved active-catalog backfill before fail-closed candidate enforcement, then handle inactive review-record remediation under its own approval gate.

Alternatives rejected:

- Reusing `productUnitMg` / `totalDoseMg` for mushroom/package mass: rejected because those fields already drive dose math and customer-facing mg labels.
- Converting grams of mushroom to psilocybin mg: rejected because potency varies by material and batch; there is no safe deterministic conversion.
- A JSON-only package claims blob: rejected because remediation, readiness gating, and audit queries need indexed/queryable scalar fields.
- Prisma enums: rejected for this repo because the schema comments already document app-enforced enum validation due SQLite compatibility history; strings match current local convention.
- Migrating only `StoreProductCatalog`: rejected because `UnverifiedProduct` and legacy `StrainRecommendationConfig` can ingest or expose the same ambiguous claims.
- Grandfathering currently active rows inside candidate loading: rejected as the primary path because it preserves ambiguous dose math for the most customer-facing records and creates a hidden permanent exception unless separately sunsetted.
- Shipping fail-closed enforcement before active-catalog backfill: rejected because `activeCompound='unknown'` is the schema default for existing rows and would exclude the live recommendation catalog.
- Folding active-catalog backfill into the schema approval: rejected because the approval gates require exact data-mutation export/update sets, and schema approval must not imply approval to mutate production catalog rows.
