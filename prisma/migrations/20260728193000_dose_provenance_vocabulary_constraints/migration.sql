ALTER TABLE "StoreProductCatalog"
  ADD CONSTRAINT "StoreProductCatalog_activeCompound_vocabulary_check"
    CHECK ("activeCompound" IS NULL OR "activeCompound" IN ('psilocybin', 'psilocin', 'muscimol', 'functional-only', 'unknown')),
  ADD CONSTRAINT "StoreProductCatalog_materialMassBasis_vocabulary_check"
    CHECK ("materialMassBasis" IS NULL OR "materialMassBasis" IN ('dried_mushroom_equivalent_mg', 'fruiting_body', 'mushroom_material'));

ALTER TABLE "UnverifiedProduct"
  ADD CONSTRAINT "UnverifiedProduct_activeCompound_vocabulary_check"
    CHECK ("activeCompound" IS NULL OR "activeCompound" IN ('psilocybin', 'psilocin', 'muscimol', 'functional-only', 'unknown')),
  ADD CONSTRAINT "UnverifiedProduct_materialMassBasis_vocabulary_check"
    CHECK ("materialMassBasis" IS NULL OR "materialMassBasis" IN ('dried_mushroom_equivalent_mg', 'fruiting_body', 'mushroom_material'));
