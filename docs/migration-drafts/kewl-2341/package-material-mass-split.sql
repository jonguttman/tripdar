-- KEWL-2341 draft migration only.
-- Status: NOT APPLIED.
-- Do not copy into prisma/migrations/ or run against production until Jon
-- explicitly approves the exact schema migration.
--
-- Scope: additive-only package/material mass split for Tripdar myco catalog
-- records. This migration intentionally does not clear, backfill, activate,
-- archive, or otherwise mutate existing catalog rows.

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
