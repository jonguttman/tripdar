# KEWL-2327 Tripdar Live Token Dose Display - Architecture Review

Revision: 2026-07-28.

## Recommended architecture

Treat `StoreProductCatalog.productUnitMg`, `StoreProductCatalog.totalDoseMg`, and `StrainRecommendationConfig.productUnitMg` as verified active-compound milligram fields only. They must not store mushroom, fruiting-body, edible, extract-equivalent, or proprietary-blend material mass.

Read-only production audit on 2026-07-28T16:35:57Z found:

| Surface | Row | Current value | Classification |
|---|---|---:|---|
| `StrainRecommendationConfig` | `__global__` | `productUnitMg=null` | No product dose configured; no evidence of mushroom weight in this table. |
| `StoreProductCatalog` | `cmpxcfrph0002wsqtlf7sgu3n` / Fun Guy Chocolate Bar | `productUnitMg=444`, `unitsPerPack=8`, `totalDoseMg=3552`, `active=true` | Unverified active-compound dose; notes say Jon confirmed Fun Guy is psilocin extract, but 444 is almost certainly product/mushroom-equivalent weight. |
| `StoreProductCatalog` | `cmpxcwv4t00018wksu3ojvyyp` / Cubiq Microdose Gummies | `productUnitMg=140`, `unitsPerPack=25`, `totalDoseMg=3500`, `active=true` | Mushroom/material mass; notes say packaging states `0.14 g ground dried mushroom per gummy`. |

The narrow `StrainRecommendationConfig` audit is clean today: the only row is global settings with no product dose. That means the hand-entered legacy config table is not currently under-dosing recommendations.

The broader recommendation risk still exists because current code overlays active `StoreProductCatalog` rows into the legacy recommendation config map in `src/domain/recommendation-engine/service.ts`, and the product-first Myco recommendation path reads active catalog rows through `src/domain/myco/candidates.ts`. Both paths can treat G13/G17 catalog material-mass values as active-dose milligrams.

Interim `/t/[id]` display decision:

1. Suppress the plain `{product.productUnitMg}mg per unit` line unless the row is verified as active-compound dose.
2. Until KEWL-2033 schema fields exist, use a small server-side denylist for the two known live rows only:
   - `cmpxcfrph0002wsqtlf7sgu3n`
   - `cmpxcwv4t00018wksu3ojvyyp`
3. Do not relabel the existing value as "mushroom mg" on the public token page before schema support, because the value basis differs between rows and public copy could imply verified potency semantics.
4. Keep brand dose tiers visible because they express product-unit guidance rather than active-compound claims.

Readiness guard recalibration for KEWL-2033:

1. Add explicit basis fields from the KEWL-2033 design before making readiness truly basis-aware: `activeCompound`, `activeCompoundSource`, `unitMaterialMassMg`, `packageMaterialMassMg`, `materialMassBasis`, and `materialMassSource`.
2. Change the readiness missing label from `mg per unit` to `verified active-compound mg per unit`.
3. Block recommendation readiness when `activeCompound` is `unknown`, `functional-only`, or `muscimol` for the current psilocybin/psilocin engine.
4. Warn when a product has `productUnitMg` but lacks `activeCompoundSource`.
5. Warn or block when package/intake notes mention `g`, `gram`, `fruiting body`, `ground dried mushroom`, `mushroom`, `extract`, or `proprietary blend` while `productUnitMg` is populated and no active-compound source exists.
6. Keep the existing numeric outlier warnings, but do not rely on them as the main guard; G13 and G17 sit in the normal numeric band.

Live-row remediation consistent with KEWL-2033:

| Product | Remediation after Jon approval |
|---|---|
| Fun Guy Chocolate Bar | Set `activeCompound='psilocin'` and `activeCompoundSource='jon_ruling'`; clear `productUnitMg` and `totalDoseMg` until verified active psilocin mg exists; if 444 is retained, move it only to material/equivalent fields with a source note. Exclude from mg-based recommendation math while active-dose fields are blank. Preserve active status only if the public page and recommendation engine stop displaying/using the ambiguous mg value. |
| Cubiq Microdose Gummies | Move `140` to `unitMaterialMassMg`; set `packageMaterialMassMg=3500` if `unitsPerPack=25` remains authoritative; set `materialMassBasis='mushroom_material'` or `ground_dried_mushroom`; clear `productUnitMg` and `totalDoseMg`; set `activeCompound='unknown'` unless vendor/operator confirms compound. Exclude from mg-based recommendation math until verified. |

## Risks

- Security: `/t/[id]` is unauthenticated and `force-dynamic`; any dose wording there is public customer-facing product information.
- Data integrity: Suppressing display alone does not fix recommendation math. Current code can still use the same catalog values in dose guidance and unit calculations.
- Operational: A denylist is intentionally temporary and can miss newly activated ambiguous products; KEWL-2033 basis fields and readiness gates are the durable fix.
- Compliance: Publicly showing ambiguous mushroom weight as `mg per unit` can be read as a verified active-compound potency claim.

## Migration impact

- Files affected: none for this read-only audit/design pass.
- Downtime: no downtime for the proposed interim display suppressor; no schema migration required.
- Rollback plan:
  1. Revert the display suppressor if Jon rejects suppression.
  2. Restore the previous `/t/[id]` rendering behavior.
  3. Do not mutate product dose fields as part of rollback; data remediation remains separate and approval-gated.

For KEWL-2033 schema remediation, use the migration and rollback plan in `docs/architecture/2026-07-18-kewl-2033-package-material-mass.md`.

## Files likely affected

- `src/app/t/[id]/page.tsx`
- `src/domain/myco/readiness.ts`
- `src/domain/myco/readiness.test.ts`
- `src/domain/myco/candidates.ts`
- `src/domain/myco/dose.ts`
- `src/domain/recommendation-engine/service.ts`
- `src/domain/recommendation-engine/scoring.ts`
- `prisma/schema.prisma`
- `docs/architecture/2026-07-18-kewl-2033-package-material-mass.md`

## What must be tested

- Pre-deploy: Verify `/t/cmpxcfrph0002wsqtlf7sgu3n` and `/t/cmpxcwv4t00018wksu3ojvyyp` no longer render the ambiguous `444mg per unit` / `140mg per unit` line after the interim display change.
- Pre-deploy: Verify unaffected products with verified active-compound dose still render dose only if the approved verification flag or source exists.
- Pre-deploy: Verify Myco candidate readiness fails or warns for populated `productUnitMg` without active-compound basis once KEWL-2033 fields exist.
- Pre-deploy: Verify recommendation responses do not include mg ranges derived from material-mass rows.
- Post-deploy: Recheck the two public token URLs unauthenticated.
- Post-deploy: Run a read-only production query confirming G13/G17 still preserve photos, brand relationships, notes, flavors, active status, and Audrey-entered metadata.

## Approval gates

Jon must explicitly approve before:

- Suppressing or changing the public dose line on `/t/[id]`.
- Any mutation to G13/G17 structured fields.
- Any schema migration for basis/material-mass fields.
- Any recommendation-engine exclusion of live active products.
- Any public wording that labels the existing numbers as mushroom weight, material mass, psilocin, or psilocybin.

## Decision rationale

Chosen interim design: suppress ambiguous active-dose display for the two known live rows until basis fields exist.

Alternatives rejected:

- Leave `Xmg per unit` visible: rejected because it continues a public ambiguous potency claim.
- Relabel to `mushroom mg per unit`: rejected for the interim because the schema cannot encode source/basis and Fun Guy is psilocin extract with ambiguous 444 mg semantics.
- Convert mushroom grams to active-compound milligrams: rejected categorically; potency must not be inferred.
- Deactivate the products immediately: rejected for this pass because the task guardrails forbid production mutation or deactivation without Jon approval.
