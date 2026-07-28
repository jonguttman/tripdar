# KEWL-2033 Tripdar Package Material Mass + Active Compound - Architecture Review

Revision: 2026-07-28, updated after Jon's parent-ticket rulings.

## Recommended architecture

`StoreProductCatalog.productUnitMg` and `totalDoseMg` must remain active-compound dose fields only: milligrams of the verified active compound per consumer unit, and total active-compound milligrams for the package. They must not store mushroom, fruiting-body, chocolate, gummy, extract, or proprietary-blend mass.

Jon's 2026-07-28 ruling inverts the default assumption: most products do not isolate psilocybin, and potency is estimated by whole mushroom weight. Therefore, the new material-mass fields are the common path for this catalog; `productUnitMg` is the exception path and requires explicit active-compound proof.

Add separate nullable factual-material fields:

- `packageMaterialMassMg Int?` on `StoreProductCatalog`: total package-level mushroom/material/blend mass claimed by packaging or vendor. Example: "4 g per pack" becomes `4000`.
- `unitMaterialMassMg Int?` on `StoreProductCatalog`: per-serving/per-piece mushroom/material/blend mass claimed by packaging or vendor. Example: "10 gummies, 400 mg each" becomes `400`.
- `materialMassBasis String?` on `StoreProductCatalog`: application-enforced values such as `fruiting_body`, `mushroom_material`, `whole_fruit_body_extract`, `proprietary_blend`, `net_edible_weight`, or `unknown`.
- `materialMassSource String?` on `StoreProductCatalog`: short source label such as `package_ocr`, `vendor`, `human_verified_package`, or `import_note`.
- `activeCompound String @default("unknown")` on `StoreProductCatalog`: application-enforced values `psilocybin`, `psilocin`, `muscimol`, `functional-only`, `unknown`.
- `activeCompoundSource String?` on `StoreProductCatalog`: short source label such as `jon_ruling`, `vendor`, `coa`, `human_verified_package`, or `unknown`.

There is no separate review/import staging model for these 21 products in the current schema; inactive/in-review products are already stored directly in `StoreProductCatalog`. The closest staging table is `UnverifiedProduct`, which has only free-text `dosageInfo`. Add the same material and compound fields to `UnverifiedProduct` if customer/vendor-submitted products can carry structured package or compound claims before promotion.

`StrainRecommendationConfig.productUnitMg` shares the same ambiguity risk. It is a legacy strain-to-product mapping field, and current comments do not say "psilocybin". Keep it as active-compound mg per unit only, update the comment, and add legacy-safe material fields only if that surface remains capable of accepting package claims:

- `productUnitMg Int? // mg of verified active compound per consumer unit; never package/material mass`
- `productActiveCompound String @default("unknown")`
- `productActiveCompoundSource String?`
- `productPackageMaterialMassMg Int?`
- `productUnitMaterialMassMg Int?`
- `productMaterialMassBasis String?`
- `productMaterialMassSource String?`

Recommendation readiness must require both a verified `productUnitMg` and a supported `activeCompound`. `unknown`, `functional-only`, and `muscimol` must block activation and exclude the record from the psilocybin recommendation engine unless a muscimol-specific engine is implemented. A product with only material-mass fields must remain not recommendation-ready for mg-based guidance unless brand dose tiers can be shown without active-compound mg display.

Package/OCR text is not sufficient to infer compound semantics. The audit found one `psilocyb*` OCR hit across all 23 packages, and that G06 text uses "psilocybin" to mean 0.40 g of mushroom weight. Source precedence for dose/compound remediation is:

1. Jon/operator ruling recorded in `StoreProductCatalog.notes` or the audit change log.
2. Vendor or COA documentation.
3. Package text only as raw factual text, not as automatic dose semantics.

## Proposed migration SQL - do not run without Jon approval

```sql
-- Proposal only. Do not apply until Jon approves the schema and remediation plan.

ALTER TABLE "StoreProductCatalog"
  ADD COLUMN "packageMaterialMassMg" INTEGER,
  ADD COLUMN "unitMaterialMassMg" INTEGER,
  ADD COLUMN "materialMassBasis" TEXT,
  ADD COLUMN "materialMassSource" TEXT,
  ADD COLUMN "activeCompound" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "activeCompoundSource" TEXT;

ALTER TABLE "UnverifiedProduct"
  ADD COLUMN "packageMaterialMassMg" INTEGER,
  ADD COLUMN "unitMaterialMassMg" INTEGER,
  ADD COLUMN "materialMassBasis" TEXT,
  ADD COLUMN "materialMassSource" TEXT,
  ADD COLUMN "activeCompound" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "activeCompoundSource" TEXT;

ALTER TABLE "StrainRecommendationConfig"
  ADD COLUMN "productPackageMaterialMassMg" INTEGER,
  ADD COLUMN "productUnitMaterialMassMg" INTEGER,
  ADD COLUMN "productMaterialMassBasis" TEXT,
  ADD COLUMN "productMaterialMassSource" TEXT,
  ADD COLUMN "productActiveCompound" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "productActiveCompoundSource" TEXT;
```

Prisma note: this schema currently documents that SQLite does not support enums and enum validation is enforced in application logic. Use `String` columns plus centralized validators, not a Prisma enum, unless the database/provider strategy changes.

Application follow-up after approval:

- Rename admin labels from "mg per unit" to "verified active compound mg per unit" where writing `productUnitMg`.
- Add separate admin/import controls for package material mass and per-unit material mass.
- Allow creation of inactive/in-review products without `productUnitMg`; current POST requires it and pushes importers toward misuse.
- Change readiness missing text from "mg per unit" to "verified active-compound mg per unit".
- Add readiness blockers for `activeCompound='unknown'`, `activeCompound='functional-only'`, and `activeCompound='muscimol'`.
- Update `src/domain/recommendation-engine/scoring.ts` and product-first candidate code so only supported active compounds enter psilocybin dose math.
- Add a warning/error when a submitted dose note contains `g`, `gram`, `fruiting body`, `blend`, `mushroom`, or `extract` but tries to populate `productUnitMg`.

## Data-remediation policy

Classify each existing value from authoritative operator/vendor evidence only:

- `verified active-compound dose`: keep `productUnitMg` / `totalDoseMg`; optionally add material fields if the package separately claims material mass.
- `package/material mass`: move the factual material values into `packageMaterialMassMg` / `unitMaterialMassMg`, then clear `productUnitMg` and `totalDoseMg`.
- `unknown`: clear dose fields or leave blank, set `activeCompound='unknown'`, keep inactive/in-review, and quarantine pending Audrey/vendor/human confirmation.

Never infer psilocybin milligrams from mushroom grams, fruiting-body mass, chocolate mass, gummy count, extract mass, or proprietary blend mass.

## Remediation table

Read-only evidence source: `StoreProductCatalog.notes` and `~/.openclaw/workspace/projects/tripdar/catalog-gap-audit-2026-07-18.md` change log after Jon's 2026-07-28 rulings. No data was mutated by this design pass.

| Record id | Product | Current structured values | Source note | Classification | Recommended action |
|---|---|---:|---|---|---|
| `cmrpmzul80002gnao3eac8c3v` | Nocturnal Farms Genetics Microdose Capsules | unit `200`, units `20`, total `4000` | Jon retracted the earlier active-dose clearance: 200 mg is mushroom weight. | package/material mass | Set `unitMaterialMassMg=200`, `packageMaterialMassMg=4000`, `materialMassBasis='mushroom_material'`, `activeCompound='unknown'` unless separately verified; clear `productUnitMg` and `totalDoseMg`; keep inactive. |
| `cmrpmzwak0009gnaovfba9898` | Waves Social Dose Shot | unit `5`, units `1`, total `5` | Jon confirmed 5 mg active for the whole 1 oz bottle; 1 g is mushroom weight. | verified active-compound dose | Keep dose fields; set `activeCompound='psilocybin'`, `packageMaterialMassMg=1000`, `materialMassBasis='mushroom_material'`, source `jon_ruling`; keep inactive until other readiness gaps clear. |
| `cmrpmzxg8000ggnaouoe8kfrt` | Urth Roots Bloom Dose | unit `500`, units `10`, total `5000` | Jon: each capsule is 1/2 g; 10 capsules = 5 g pack. | package/material mass | Set `unitMaterialMassMg=500`, `packageMaterialMassMg=5000`, `materialMassBasis='mushroom_material'`, `activeCompound='unknown'`; clear dose fields; keep inactive. |
| `cmrpmzyoi000ngnaowz4h3e89` | Waves Micro Dose Tablet | unit `1`, units `20`, total `20` | Jon confirmed Waves tablet is active psilocin. | verified active-compound dose | Keep dose fields; set `activeCompound='psilocin'`, source `jon_ruling`; keep inactive until other readiness gaps clear. |
| `cmrpn004q000ugnaohfm86ffy` | DRONFLY Medicines Heal + Flow Gummies | unit `250`, units `24`, total `6000` | "6 g fruiting body + 480 mg CBD total"; "0.25 g fruiting body + 20 mg CBD per piece" | package/material mass | Set `unitMaterialMassMg=250`, `packageMaterialMassMg=6000`, `materialMassBasis='fruiting_body'`; clear psilocybin dose fields; preserve CBD note in `notes`; keep inactive. |
| `cmrpn01lf0011gnaob7uwuezy` | Psilly's Single Source Magic Mushroom Gummies | unit `400`, units `10`, total `4000` | Jon resolved the replacement-package count: 10 pieces, 4 g total, PE blend inherits PE vibes for now. | package/material mass | Set `unitMaterialMassMg=400`, `packageMaterialMassMg=4000`, `materialMassBasis='mushroom_material'`, `activeCompound='unknown'` unless separately verified; clear dose fields; preserve PE blend note; keep inactive. |
| `cmrpn03i00018gnao1zpgrpvz` | Neau Tropics Gummies | unit `250`, units `16`, total `4000` | Jon confirmed 250 mg is mushroom weight and Neau Tropics compound is psilocybin. | package/material mass | Set `unitMaterialMassMg=250`, `packageMaterialMassMg=4000`, `materialMassBasis='fruiting_body'`, `activeCompound='psilocybin'`; clear dose fields; keep inactive. |
| `cmrpn04v6001fgnao8j6fl7e6` | West Coast Gold Caps Mini Mushroom Chocolates | unit `300`, units `2`, total `600` | Jon checkmark confirmed number and mushroom-weight semantics; strain Bluey Vuitton. | package/material mass | Set `unitMaterialMassMg=300`, `packageMaterialMassMg=600`, `materialMassBasis='mushroom_material'`, `activeCompound='unknown'`; clear dose fields; keep inactive. |
| `cmrpn065s001mgnaobi5plqst` | Captain Shroomz Magical Mushroom Chocolate Bar | unit `2000`, units `1`, total `2000` | G09 has no OCR coverage and Jon placed it on activation hold because compound is unverified. | unknown / compound hold | Set `activeCompound='unknown'`; clear dose fields or quarantine unchanged until execution export is approved; do not populate material fields until vendor/operator confirms what 2000 mg means; keep inactive. |
| `cmrpn0795001tgnaoe00pxf5q` | Micro Mind Mushroom Gummies | unit `400`, units `10`, total `4000` | Jon checkmark confirmed number and mushroom-weight semantics; nootropic blend is not a compound claim. | package/material mass | Set `unitMaterialMassMg=400`, `packageMaterialMassMg=4000`, `materialMassBasis='mushroom_material'`, `activeCompound='unknown'` unless separately verified; clear dose fields; keep inactive. |
| `cmrpn08oc0020gnaoraj4niht` | Micro Mind Macrodose Gummies | unit `1200`, units `5`, total `6000` | Jon checkmark confirmed number and mushroom-weight semantics; nootropic blend is not a compound claim. | package/material mass | Set `unitMaterialMassMg=1200`, `packageMaterialMassMg=6000`, `materialMassBasis='mushroom_material'`, `activeCompound='unknown'` unless separately verified; clear dose fields; keep inactive. |
| `cmrpn0anp0027gnao8rk8j8n6` | Fun Guy Vegan Fruit Chews | unit null, units `10`, total null | Fun Guy products are psilocin extract per Jon; no per-unit dose captured for this record. | unknown dose, verified compound family | Set `activeCompound='psilocin'`; keep dose fields blank; keep inactive pending vendor/human dose confirmation. |
| `cmrpn0dki002jgnaodah54f2o` | Micro Mind Vegan Mushroom Chocolate Bar | unit `333`, units `12`, total `4000` | Ten-product unreviewed set; prior package note says 4 g per bar / 12 squares. | unreviewed, presumed material until proven otherwise | Set `activeCompound='unknown'`; clear dose fields or quarantine unchanged until operator/vendor confirms; if confirmed as material, set `unitMaterialMassMg=333`, `packageMaterialMassMg=4000`; keep inactive. |
| `cmrpn0eow002qgnao4an8rnbz` | Neau Tropics Dark Chocolate | unit null, units null, total `6000` | Neau Tropics compound confirmed psilocybin; package material count/servings still incomplete. | package/material mass, verified compound family | Set `packageMaterialMassMg=6000`, `materialMassBasis='fruiting_body'`, `activeCompound='psilocybin'`; clear `totalDoseMg`; keep inactive pending unit count/dose details. |
| `cmrpn0fpr002xgnaoejymq4me` | West Coast Gold Caps Mushroom Chocolate Bar | unit `3500`, units `1`, total `3500` | Ten-product unreviewed set; prior package note says 3.5 g per bar plus net weight. | unreviewed, presumed material until proven otherwise | Set `activeCompound='unknown'`; clear dose fields or quarantine unchanged until operator/vendor confirms; if confirmed as material, set `unitMaterialMassMg=3500`, `packageMaterialMassMg=3500`; keep inactive. |
| `cmrpn0ic80039gnaosu65izr3` | Micro Mind Mushroom Drink Mix | unit `1000`, units `4`, total `4000` | Ten-product unreviewed set; prior package note says 4 g per box / 1 g stick packs. | unreviewed, presumed material until proven otherwise | Set `activeCompound='unknown'`; clear dose fields or quarantine unchanged until operator/vendor confirms; if confirmed as material, set `unitMaterialMassMg=1000`, `packageMaterialMassMg=4000`; keep inactive. |
| `cmrpn0jie003ggnaocwkxyrxv` | Psilly's Premium Belgian Mushroom Chocolate | unit null, units null, total `2000` | Ten-product unreviewed set; prior package note says 2 g total; piece count not reliable. | unreviewed, presumed material until proven otherwise | Set `activeCompound='unknown'`; clear `totalDoseMg` or quarantine unchanged until operator/vendor confirms; if confirmed as material, set `packageMaterialMassMg=2000`; keep inactive. |
| `cmrpn0krp003ngnaoaewpvk72` | Neau Tropics Milk Chocolate Crunch | unit null, units null, total `2000` | Neau Tropics compound confirmed psilocybin; package material count/servings still incomplete. | package/material mass, verified compound family | Set `packageMaterialMassMg=2000`, `materialMassBasis='fruiting_body'`, `activeCompound='psilocybin'`; clear `totalDoseMg`; keep inactive pending unit count/dose details. |
| `cmrpn0m0h003ugnaopcbowa53` | Micro Mind Mushroom Chocolate Bar | unit `333`, units `12`, total `4000` | Ten-product unreviewed set; prior package note says 4 g per bar / 12 squares. | unreviewed, presumed material until proven otherwise | Set `activeCompound='unknown'`; clear dose fields or quarantine unchanged until operator/vendor confirms; if confirmed as material, set `unitMaterialMassMg=333`, `packageMaterialMassMg=4000`; keep inactive. |
| `cmrpn0n6x0041gnao82b47l97` | Captain Shroomz Mushroom Chocolate Bar | unit `2000`, units `4`, total `8000` | Ten-product unreviewed set; prior package note says 8 g total / 2000 mg proprietary blend per serving. | unreviewed, presumed material until proven otherwise | Set `activeCompound='unknown'`; clear dose fields or quarantine unchanged until operator/vendor confirms; if confirmed as material, set `unitMaterialMassMg=2000`, `packageMaterialMassMg=8000`, `materialMassBasis='proprietary_blend'`; keep inactive. |
| `cmrpn0oaf0048gnaojjs9wpqo` | Lady Hyphae Isolated Solution | unit null, units null, total null | 10 mL isolated solution; research/microscopy use only; not for human consumption. | unknown / restricted | Set `activeCompound='unknown'`; keep all dose and material fields blank unless inventory needs non-consumption metadata elsewhere; preserve G23/research-only restriction; keep inactive and excluded. |

### Live-product exception table

These two records sit outside the inactive-record guardrail but already expose the same defect customer-side. They need a separately approved live remediation step before or alongside the inactive batch.

| Product | Current structured values | Source note | Risk | Recommended action |
|---|---:|---|---|---|
| G13 Fun Guy Chocolate Bar | unit `444`, units `8`, total approx. `3552` | Jon confirmed Fun Guy products are psilocin extract; audit says 444 is product/mushroom-equivalent weight, not active dose. | Live customer-facing dose label and recommendation math can under-count units. | Create a dedicated live-data remediation child issue. Set `activeCompound='psilocin'`; remove `productUnitMg`/`totalDoseMg` until verified active psilocin mg exists; preserve active status only if product is excluded from mg recommendation math during remediation. |
| G17 Cubiq Microdose Gummies | unit `140`, units unknown here, total unknown here | Intake notes state 0.14 g ground dried mushroom per gummy. | Live customer-facing dose label and recommendation math can under-count units. | Create a dedicated live-data remediation child issue. Move 140 to `unitMaterialMassMg`, clear active-dose fields, set `activeCompound='unknown'` unless vendor/operator confirms compound, and exclude from recommendations until verified. |

## Risks

- Security: The repo contains live-looking `.env.local` / `production` database URLs. Treat this as a credential exposure and keep it on the pre-launch rotation list. Do not paste secrets into issue comments.
- Data integrity: Clearing `productUnitMg` will make most records fail readiness, which is correct. Do not backfill psilocybin dose from grams.
- Operational: Current create/edit code auto-computes `totalDoseMg` from `productUnitMg * unitsPerPack`; remediation must update code before any importer/human repeats the same mistake.
- Pharmacology: `activeCompound='unknown'` and `muscimol` must not pass through psilocybin dose curves. Muscimol has unrelated onset, duration, and dose-response behavior.
- Compliance: Active-compound dose claims require vendor/lab/human verification. Package material mass is not a substitute.

## Migration impact

- Files affected: `prisma/schema.prisma`; generated Prisma client; admin Myco API and UI; importer/review ingestion code; recommendation candidate/scoring code; tests for readiness/dose guidance.
- Downtime: no expected downtime for nullable column adds on Neon Postgres, but schedule as a normal migration with backout window.
- Rollback plan:
  1. Stop new importer/admin writes that target the new material fields.
  2. Export rows where new material fields are non-null.
  3. Drop the new nullable columns only if no deployed code reads them.
  4. Restore the prior app version.
  5. Do not restore cleared `productUnitMg` / `totalDoseMg` without the approved remediation export.

## Files likely affected

- `prisma/schema.prisma`
- `src/app/api/admin/myco/route.ts`
- `src/app/api/admin/myco/[id]/route.ts`
- `src/app/admin/myco/page.tsx`
- `src/domain/myco/readiness.ts`
- `src/domain/myco/dose.ts`
- `src/domain/myco/candidates.ts`
- `src/domain/myco/scoring.ts`
- `src/domain/recommendation-engine/scoring.ts`
- `src/app/api/v1/admin/recommend/strains/[slug]/config/route.ts`
- `wordpress-plugin/tripdar-recommendation-engine/admin/views/strain-config.php`
- `wordpress-plugin/tripdar-recommendation-engine/admin/class-admin.php`
- `wordpress-plugin/tripdar-recommendation-engine/assets/js/admin.js`

## What must be tested

- Pre-deploy: Prisma migration diff is additive-only; `_prisma_migrations` is present; no production sync script replays historical migrations; product create/edit accepts inactive review products with blank active dose; readiness blocks products with material mass but no verified active dose; readiness blocks unknown/unsupported active compounds; dose guidance does not display material mass as mg dose.
- Post-deploy: Verify columns exist; verify all 21 review products remain `active=false` and `archivedAt IS NULL`; verify affected rows have cleared dose fields after approved remediation; verify photos, `brandId`, notes, flavors, and G23/research-only notes remain unchanged; verify recommendation candidate query excludes all remediated review records and any `activeCompound` outside supported psilocybin/psilocin handling.

## Approval gates

Jon must explicitly approve before:

- Applying the schema migration.
- Running any update that clears `productUnitMg` / `totalDoseMg` or backfills material fields.
- Backfilling `activeCompound` for any product from notes/vendor/operator knowledge.
- Changing admin/import validation around dose fields.
- Allowing any remediated product to become active/recommendation-ready.
- Deciding whether any ambiguous "1 mg" / "5 mg" claims are verified active-compound dose.
- Touching the two live affected products G13/G17, because customer-facing state changes are outside the original inactive-record guardrail.

## Decision rationale

Chosen design: separate integer milligram fields for package-level and unit-level material mass, plus an explicit active-compound field with source tracking.

Alternatives rejected:

- `packageWeightG Decimal?`: rejected because "package weight" conflates total edible net weight, mushroom material, extract, and proprietary blend; decimals add no value over integer mg for source claims.
- Reusing `totalDoseMg`: rejected because it is already active-compound dose and feeds recommendation math.
- Single JSON blob: rejected because remediation and validation need queryable, auditable fields.
- Trusting label/OCR text: rejected because the only captured `psilocyb*` label mention in the package set uses the compound word to mean mushroom weight.
- Treating all mushroom products as psilocybin: rejected because nootropic-blend wording can conceal psilocybin, muscimol, or functional-only products, and the current scoring engine only models psilocybin/psilocin-style dose curves.
- Automatic gram-to-psilocybin conversion: rejected categorically; potency varies by material and batch and must never be inferred.
