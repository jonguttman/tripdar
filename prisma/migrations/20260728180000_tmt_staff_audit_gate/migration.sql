-- KEWL-2421 reconciliation for an orphan production migration.
--
-- This file is a reconstruction, not a byte-for-byte recovery of the original
-- migration. Production recorded `20260728180000_tmt_staff_audit_gate` as
-- applied, but no branch retained the migration file. Later KEWL-2335 history
-- documents the orphan's disputed effect as a bare listing override boolean on
-- StoreProductCatalog. Production catalog inspection also shows a surviving
-- research-only index that is not created by the later KEWL-2335 migration
-- (whose checked-in checksum exactly matches production).
--
-- KEWL-2335 superseded `listingOverrideActive` with reason-bearing audit columns
-- and drops that legacy column. Its `ADD COLUMN IF NOT EXISTS` statements also
-- tolerate the research-only columns being created here first.

ALTER TABLE "StoreProductCatalog" ADD COLUMN IF NOT EXISTS "researchOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreProductCatalog" ADD COLUMN IF NOT EXISTS "researchOnlyReason" TEXT;
ALTER TABLE "StoreProductCatalog" ADD COLUMN IF NOT EXISTS "listingOverrideActive" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "StoreProductCatalog_researchOnly_idx" ON "StoreProductCatalog"("researchOnly");
