# KEWL-2346 Recommendation Dose Ladder Basis - Architecture Review

Revision: 2026-07-28. Supersedes the recommendation-math portions of KEWL-2033 / KEWL-2341 where they imply an active-compound allowlist is enough to make `productUnitMg` safe for `suggestedUnits`.

## Recommended architecture

The basis of `CANONICAL_DOSE_LEVELS` is dried-mushroom-equivalent material mass in milligrams, not active psilocybin or psilocin milligrams.

Evidence:

- `src/domain/recommendation-engine/types.ts` defines L1 as `50-250` mg and L6 as `5000-7500` mg.
- `src/domain/dosing-guide/utils.ts` renders L2-L6 by rounding milligrams to quarter-gram boundaries and displaying grams. That is dried-mushroom dosing language.
- `src/domain/recommendation-engine/scoring.ts` currently divides the strain-adjusted ladder range by `adminConfig.productUnitMg` to produce `suggestedUnits`.

The scoring divisor must be like-for-like with the ladder. Therefore the current accepted design is incomplete: keeping `productUnitMg` as verified active-compound mg is correct for active-dose facts, but `productUnitMg` must not be used as the divisor for the existing canonical dried-mushroom-equivalent ladder.

Adopt an explicit dose-basis model before shipping KEWL-2341 scoring enforcement:

- Keep `StoreProductCatalog.productUnitMg` and `StrainRecommendationConfig.productUnitMg` as verified active-compound mg per consumer unit only.
- Add or reuse a separate mushroom-equivalent per-unit material divisor for the current ladder: `unitMaterialMassMg` on `StoreProductCatalog`, and `productUnitMaterialMassMg` on `StrainRecommendationConfig` if that legacy route remains recommendation-capable.
- Add a code-level basis constant for the ladder, for example `CANONICAL_DOSE_BASIS = "dried_mushroom_equivalent_mg"`, exported next to `CANONICAL_DOSE_LEVELS`.
- Pass divisor metadata into `scoreStrains`, not just a number. The product config should distinguish at least:
  - `active_compound_mg_per_unit`
  - `dried_mushroom_equivalent_mg_per_unit`
  - `material_mass_mg_per_unit`
  - `unknown`
- `scoring.ts` must build `product.suggestedUnits` only when the selected divisor basis equals the ladder basis. For the current ladder, that means use a dried-mushroom-equivalent or explicitly compatible material-mass divisor, not active-compound mg.
- Active-compound allowlisting is still required for active-dose display and readiness, but it must not be treated as permission to divide the dried-mushroom ladder by active-compound mg.
- If a row has only active-compound mg and no mushroom-equivalent/material divisor, suppress `product.suggestedUnits` for the current ladder and keep the product recommendation otherwise eligible only if the surface can omit unit counts safely.
- If a future active-compound ladder is introduced, select that ladder explicitly by dose basis and compound family, then divide it by verified active-compound mg. Do not silently reinterpret the existing ladder.

Minimum scoring guard:

```ts
if (
  adminConfig.productName &&
  adminConfig.productDoseDivisorMg &&
  adminConfig.productDoseDivisorMg > 0 &&
  adminConfig.productDoseDivisorBasis === CANONICAL_DOSE_BASIS
) {
  // safe like-for-like unit math
}
```

Rows with `productDoseDivisorBasis !== CANONICAL_DOSE_BASIS`, missing basis, unsupported basis, or missing divisor must not produce `suggestedUnits`.

## Risks

- Security: No new secrets, auth paths, sessions, or tokens are required for this design. Do not leak production catalog exports in issue comments.
- Data integrity: Dividing dried-mushroom mg by active-compound mg produces wrong non-zero unit counts in the overdose direction for true extracts. A 1 mg psilocin unit can become a four-digit L4 unit suggestion.
- Data integrity: Treating `unitMaterialMassMg` as automatically equivalent to dried mushroom is unsafe for extracts, proprietary blends, net edible weight, and unknown material. The divisor basis must be explicit, not inferred from a non-null material field.
- Operational: A fail-closed basis check may remove `suggestedUnits` from products that currently show counts. That is safer than wrong counts, but customer-facing copy must handle a product recommendation without unit math.
- Compatibility: Existing persisted `RecommendationResult.productUnits` stores only an integer high-unit count and has no basis metadata. Do not use historical `productUnits` for audit-quality dose reconstruction after this change.
- Compliance: No gram-to-active-compound conversion is allowed. No inferred psilocybin/psilocin potency from material mass, OCR, or product format.

## Migration impact

- Files affected by this design heartbeat:
  - `docs/architecture/2026-07-28-kewl-2346-dose-ladder-basis.md`
- Likely implementation files:
  - `src/domain/recommendation-engine/types.ts`
  - `src/domain/recommendation-engine/scoring.ts`
  - `src/domain/recommendation-engine/service.ts`
  - `src/domain/recommendation-engine/config.ts`
  - `src/domain/recommendation-engine/index.ts`
  - `src/domain/recommendation-engine/scoring.test.ts` or a new sibling test file
  - `src/domain/dosing-guide/utils.ts`
  - `src/domain/dosing-guide/utils.test.ts`
  - `src/domain/myco/readiness.ts`
  - `src/domain/myco/readiness.test.ts`
  - `src/domain/myco/candidates.ts`
  - `src/domain/myco/dose.ts`
  - `src/domain/myco/dose.test.ts`
  - `prisma/schema.prisma` only if KEWL-2341 has not already added the needed material/basis fields
  - `docs/architecture/2026-07-18-kewl-2033-package-material-mass.md`
  - `docs/architecture/2026-07-28-kewl-2341-package-material-mass-implementation-plan.md`
- Downtime: none for a pure scoring/code guard. If new basis fields are added to Prisma beyond KEWL-2341, use the KEWL-2341 additive nullable-column migration sequence; expected downtime remains no.
- Rollback plan:
  1. If only code changes ship, revert the scoring/service changes to the previous build.
  2. If nullable basis fields ship, stop writers for the new fields before rollback.
  3. Export rows where new basis fields are non-null.
  4. Drop only the new nullable fields after all deployed readers are reverted.
  5. Do not repopulate active-compound fields from material mass or material fields from active-compound dose.

## Files likely affected

- `src/domain/recommendation-engine/types.ts`
- `src/domain/recommendation-engine/scoring.ts`
- `src/domain/recommendation-engine/service.ts`
- `src/domain/recommendation-engine/scoring.test.ts`
- `src/domain/dosing-guide/utils.ts`
- `src/domain/dosing-guide/utils.test.ts`
- `src/domain/myco/readiness.ts`
- `src/domain/myco/candidates.ts`
- `src/domain/myco/dose.ts`
- `prisma/schema.prisma`
- `docs/migration-drafts/kewl-2341/schema.prisma.patch`
- `docs/architecture/2026-07-28-kewl-2341-package-material-mass-implementation-plan.md`

## What must be tested

- Pre-deploy:
  - Unit test that asserts `CANONICAL_DOSE_LEVELS` has basis `dried_mushroom_equivalent_mg` and that dose-card formatting still presents L2-L6 as grams.
  - Regression test that a 1 mg psilocin / active-compound row does not produce four-digit `suggestedUnits`; expected behavior is no `product.suggestedUnits` unless an active-compound ladder is explicitly selected.
  - Regression test that a 5 mg psilocybin / active-compound row does not produce 300-700 unit L4 suggestions under the dried-mushroom ladder.
  - Positive test that a basis-compatible dried-mushroom-equivalent row such as 140 mg or 444 mg can produce bounded unit counts when its divisor basis is explicitly compatible.
  - Test that active-compound allowlist alone is insufficient: `activeCompound='psilocin'` plus `productDoseDivisorBasis='active_compound_mg_per_unit'` must fail the `suggestedUnits` gate for the current ladder.
  - Service test that active catalog overlays pass both divisor amount and divisor basis to scoring.
  - Readiness/candidate tests that unsupported compounds stay blocked from psilocybin active-dose readiness without accidentally authorizing `suggestedUnits`.
- Post-deploy:
  - Spot-check a known active-compound row returns no `suggestedUnits` under the current dried-mushroom ladder.
  - Spot-check a known dried-mushroom-equivalent row returns sane `suggestedUnits` only when the row's divisor basis is explicit.
  - Verify recommendation results remain non-zero for the scoped partner after candidate filtering and basis gating.
  - Verify no rows changed active status, dose fields, material fields, notes, photos, brands, or G23 research-only metadata as part of this scoring-only guard.

## Approval gates

Jon must explicitly approve before:

- Any schema migration for basis fields if KEWL-2341's current field set is insufficient.
- Any production migration command.
- Any data mutation that moves values among `productUnitMg`, `unitMaterialMassMg`, `packageMaterialMassMg`, active-compound fields, or basis/source fields.
- Any active-catalog backfill that classifies existing products by dose basis.
- Shipping an active-compound ladder or any conversion table from active-compound mg to mushroom-equivalent mg.
- Customer-facing behavior that recommends a product while suppressing unit counts, if Product/Frontend wants that shown differently.
- Any activation/readiness override for KEWL-2032 records. All 21 records stay inactive/in-review, and G23 remains research-only.

## Decision rationale

Chosen design: keep the canonical ladder as dried-mushroom-equivalent mg and require an explicit same-basis divisor before emitting `suggestedUnits`.

This preserves the existing public dosing semantics while preventing active-compound rows from producing absurd unit counts. It also leaves `productUnitMg` with the clean active-compound meaning required by KEWL-2033 / KEWL-2341, instead of overloading it again.

Alternatives rejected:

- Divide the existing ladder by `productUnitMg` after an active-compound allowlist: rejected because it compares dried-mushroom mg to active-compound mg and is the exact defect in KEWL-2346.
- Revert `productUnitMg` to mushroom-weight semantics: rejected because KEWL-2033 / KEWL-2341 correctly need a verified active-compound field for active-dose facts and labels.
- Automatically convert mushroom grams to psilocybin/psilocin mg: rejected because potency is batch/material dependent and cannot be inferred.
- Add only an active-compound ladder now: rejected as the sole fix because most products are not verified active-compound isolates; this would solve extracts while dropping the common mushroom-weight path.
- Block every product suggestion whenever divisor basis differs: accepted as the fallback behavior, but rejected as the full architecture because basis-compatible material rows can safely support the current ladder when explicitly classified.
- Store basis only in free-text notes: rejected because scoring needs deterministic, testable gating and audit queries need structured fields.
