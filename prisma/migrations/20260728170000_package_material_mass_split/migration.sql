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
