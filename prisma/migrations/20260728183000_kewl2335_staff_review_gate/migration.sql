-- KEWL-2335: staff catalog review surface + listing gate
--
-- Three additive changes. No table is dropped, no column is repurposed, and the
-- KEWL-2332 provenance tables are extended in place rather than duplicated.

-- 1. Reviewer PIN (deterrence-grade, slow-hashed, per-reviewer lockout).
ALTER TABLE "MycoEmployee" ADD COLUMN IF NOT EXISTS "pinHash" TEXT;
ALTER TABLE "MycoEmployee" ADD COLUMN IF NOT EXISTS "pinSetAt" TIMESTAMP(3);
ALTER TABLE "MycoEmployee" ADD COLUMN IF NOT EXISTS "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MycoEmployee" ADD COLUMN IF NOT EXISTS "pinLockedUntil" TIMESTAMP(3);
ALTER TABLE "MycoEmployee" ADD COLUMN IF NOT EXISTS "pinLastUsedAt" TIMESTAMP(3);

-- 2. Listing gate: research-only exclusion + Jon-only force-list override.
ALTER TABLE "StoreProductCatalog" ADD COLUMN IF NOT EXISTS "researchOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreProductCatalog" ADD COLUMN IF NOT EXISTS "researchOnlyReason" TEXT;
ALTER TABLE "StoreProductCatalog" ADD COLUMN IF NOT EXISTS "listingOverrideAt" TIMESTAMP(3);
ALTER TABLE "StoreProductCatalog" ADD COLUMN IF NOT EXISTS "listingOverrideBy" TEXT;
ALTER TABLE "StoreProductCatalog" ADD COLUMN IF NOT EXISTS "listingOverrideReason" TEXT;

-- 3. The approved required-field set becomes config data on the KEWL-2332 rule table.
ALTER TABLE "CatalogFieldVerificationRule" ADD COLUMN IF NOT EXISTS "tier" TEXT NOT NULL DEFAULT 'A';
ALTER TABLE "CatalogFieldVerificationRule" ADD COLUMN IF NOT EXISTS "requiresDistinctReviewers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CatalogFieldVerificationRule" ADD COLUMN IF NOT EXISTS "gateRequired" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CatalogFieldVerificationRule" ADD COLUMN IF NOT EXISTS "readinessKey" TEXT;
ALTER TABLE "CatalogFieldVerificationRule" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "CatalogFieldVerificationRule" ADD COLUMN IF NOT EXISTS "helpText" TEXT;
ALTER TABLE "CatalogFieldVerificationRule" ADD COLUMN IF NOT EXISTS "inputType" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "CatalogFieldVerificationRule" ADD COLUMN IF NOT EXISTS "allowsConfirmedAbsent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CatalogFieldVerificationRule" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "CatalogFieldVerificationRule_tier_active_idx"
  ON "CatalogFieldVerificationRule"("tier", "active");
ALTER TABLE "CatalogFieldVerificationRule" ADD COLUMN IF NOT EXISTS "catalogColumn" TEXT;
ALTER TABLE "CatalogFieldVerificationRule" ADD COLUMN IF NOT EXISTS "gateSatisfyingValues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 4. Remove the silent-boolean override left behind by an abandoned run.
--
-- An interrupted KEWL-2335 attempt applied `20260728180000_tmt_staff_audit_gate` straight
-- to Neon; that migration never reached the repo and its work is superseded here. It added
-- `listingOverrideActive`, a bare boolean — precisely the "never a silent boolean" the
-- approved spec forbids, since it can flip a product live with no reason and no actor.
-- The reason-bearing columns above replace it. Verified empty before dropping:
-- all 27 rows were `false` and no row carried an override reason.
ALTER TABLE "StoreProductCatalog" DROP COLUMN IF EXISTS "listingOverrideActive";
