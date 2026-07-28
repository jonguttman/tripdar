ALTER TABLE "Brand" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Brand" ADD COLUMN "artworkUrl" TEXT;
ALTER TABLE "Brand" ADD COLUMN "primaryColor" TEXT;
ALTER TABLE "Brand" ADD COLUMN "secondaryColor" TEXT;
ALTER TABLE "Brand" ADD COLUMN "accentColor" TEXT;
ALTER TABLE "Brand" ADD COLUMN "shortDescription" TEXT;
ALTER TABLE "Brand" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "Brand" ADD COLUMN "supportEmail" TEXT;
ALTER TABLE "Brand" ADD COLUMN "socialHandles" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "ProductPhoto" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "ProductPhoto" ADD COLUMN "submissionSource" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "ProductPhoto" ADD COLUMN "rejectedBy" TEXT;
ALTER TABLE "ProductPhoto" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "ProductPhoto" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "ProductPhoto" ADD COLUMN "brandSubmissionId" TEXT;

CREATE TABLE "CatalogAccessToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "partnerId" TEXT NOT NULL,
    "brandId" TEXT,
    "catalogItemId" TEXT,
    "issuedToType" TEXT NOT NULL,
    "issuedToId" TEXT,
    "issuedToEmail" TEXT,
    "issuedBy" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revocationReason" TEXT,
    "regeneratedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogAccessToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MycoEmployeeReviewAssignment" ADD COLUMN "accessTokenId" TEXT;

CREATE TABLE "BrandSubmission" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "accessTokenId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submitterName" TEXT NOT NULL,
    "submitterRole" TEXT NOT NULL,
    "contactPermission" BOOLEAN NOT NULL DEFAULT false,
    "preferredContactMethod" TEXT,
    "contactHandle" TEXT,
    "consentToContactAt" TIMESTAMP(3),
    "imageUsageGrant" BOOLEAN NOT NULL DEFAULT false,
    "imageUsageGrantedAt" TIMESTAMP(3),
    "imageUsageGrantedBy" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "BrandSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogFieldChange" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "previousValue" JSONB,
    "submittedValue" JSONB,
    "actorType" TEXT NOT NULL,
    "actorIdentity" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "disposition" TEXT NOT NULL DEFAULT 'pending',
    "dispositionBy" TEXT,
    "dispositionAt" TIMESTAMP(3),
    "dispositionReason" TEXT,
    "brandSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogFieldChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogFieldVerificationState" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'unreviewed',
    "requiredConfirmations" INTEGER NOT NULL DEFAULT 1,
    "confirmationsCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedValue" JSONB,
    "lastAcceptedChangeId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogFieldVerificationState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogFieldVerificationRule" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "fieldName" TEXT NOT NULL,
    "requiredConfirmations" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogFieldVerificationRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogAccessToken_tokenHash_key" ON "CatalogAccessToken"("tokenHash");
CREATE INDEX "CatalogAccessToken_partnerId_purpose_status_idx" ON "CatalogAccessToken"("partnerId", "purpose", "status");
CREATE INDEX "CatalogAccessToken_brandId_status_idx" ON "CatalogAccessToken"("brandId", "status");
CREATE INDEX "CatalogAccessToken_catalogItemId_purpose_idx" ON "CatalogAccessToken"("catalogItemId", "purpose");
CREATE INDEX "CatalogAccessToken_expiresAt_idx" ON "CatalogAccessToken"("expiresAt");
CREATE UNIQUE INDEX "MycoEmployeeReviewAssignment_accessTokenId_key" ON "MycoEmployeeReviewAssignment"("accessTokenId");

CREATE INDEX "BrandSubmission_partnerId_createdAt_idx" ON "BrandSubmission"("partnerId", "createdAt");
CREATE INDEX "BrandSubmission_brandId_status_idx" ON "BrandSubmission"("brandId", "status");
CREATE INDEX "BrandSubmission_catalogItemId_status_idx" ON "BrandSubmission"("catalogItemId", "status");
CREATE INDEX "BrandSubmission_accessTokenId_idx" ON "BrandSubmission"("accessTokenId");

CREATE INDEX "CatalogFieldChange_catalogItemId_fieldName_createdAt_idx" ON "CatalogFieldChange"("catalogItemId", "fieldName", "createdAt");
CREATE INDEX "CatalogFieldChange_catalogItemId_disposition_idx" ON "CatalogFieldChange"("catalogItemId", "disposition");
CREATE INDEX "CatalogFieldChange_actorType_createdAt_idx" ON "CatalogFieldChange"("actorType", "createdAt");
CREATE INDEX "CatalogFieldChange_brandSubmissionId_idx" ON "CatalogFieldChange"("brandSubmissionId");

CREATE UNIQUE INDEX "CatalogFieldVerificationState_catalogItemId_fieldName_key" ON "CatalogFieldVerificationState"("catalogItemId", "fieldName");
CREATE INDEX "CatalogFieldVerificationState_catalogItemId_state_idx" ON "CatalogFieldVerificationState"("catalogItemId", "state");
CREATE INDEX "CatalogFieldVerificationState_fieldName_state_idx" ON "CatalogFieldVerificationState"("fieldName", "state");

CREATE UNIQUE INDEX "CatalogFieldVerificationRule_partnerId_fieldName_key" ON "CatalogFieldVerificationRule"("partnerId", "fieldName");
CREATE INDEX "CatalogFieldVerificationRule_fieldName_active_idx" ON "CatalogFieldVerificationRule"("fieldName", "active");
CREATE INDEX "ProductPhoto_catalogItemId_status_idx" ON "ProductPhoto"("catalogItemId", "status");
CREATE INDEX "ProductPhoto_brandSubmissionId_idx" ON "ProductPhoto"("brandSubmissionId");

ALTER TABLE "CatalogAccessToken" ADD CONSTRAINT "CatalogAccessToken_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogAccessToken" ADD CONSTRAINT "CatalogAccessToken_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogAccessToken" ADD CONSTRAINT "CatalogAccessToken_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "StoreProductCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogAccessToken" ADD CONSTRAINT "CatalogAccessToken_regeneratedFromId_fkey" FOREIGN KEY ("regeneratedFromId") REFERENCES "CatalogAccessToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MycoEmployeeReviewAssignment" ADD CONSTRAINT "MycoEmployeeReviewAssignment_accessTokenId_fkey" FOREIGN KEY ("accessTokenId") REFERENCES "CatalogAccessToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BrandSubmission" ADD CONSTRAINT "BrandSubmission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandSubmission" ADD CONSTRAINT "BrandSubmission_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandSubmission" ADD CONSTRAINT "BrandSubmission_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "StoreProductCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandSubmission" ADD CONSTRAINT "BrandSubmission_accessTokenId_fkey" FOREIGN KEY ("accessTokenId") REFERENCES "CatalogAccessToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductPhoto" ADD CONSTRAINT "ProductPhoto_brandSubmissionId_fkey" FOREIGN KEY ("brandSubmissionId") REFERENCES "BrandSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CatalogFieldChange" ADD CONSTRAINT "CatalogFieldChange_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "StoreProductCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogFieldChange" ADD CONSTRAINT "CatalogFieldChange_brandSubmissionId_fkey" FOREIGN KEY ("brandSubmissionId") REFERENCES "BrandSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CatalogFieldVerificationState" ADD CONSTRAINT "CatalogFieldVerificationState_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "StoreProductCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogFieldVerificationState" ADD CONSTRAINT "CatalogFieldVerificationState_lastAcceptedChangeId_fkey" FOREIGN KEY ("lastAcceptedChangeId") REFERENCES "CatalogFieldChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CatalogFieldVerificationRule" ADD CONSTRAINT "CatalogFieldVerificationRule_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_catalog_field_change_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CatalogFieldChange is append-only; insert a new entry instead';
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."catalogItemId" IS DISTINCT FROM NEW."catalogItemId"
    OR OLD."fieldName" IS DISTINCT FROM NEW."fieldName"
    OR OLD."previousValue" IS DISTINCT FROM NEW."previousValue"
    OR OLD."submittedValue" IS DISTINCT FROM NEW."submittedValue"
    OR OLD."actorType" IS DISTINCT FROM NEW."actorType"
    OR OLD."actorIdentity" IS DISTINCT FROM NEW."actorIdentity"
    OR OLD."source" IS DISTINCT FROM NEW."source"
    OR OLD."brandSubmissionId" IS DISTINCT FROM NEW."brandSubmissionId"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'CatalogFieldChange history columns are immutable; insert a new entry instead';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CatalogFieldChange_no_update"
BEFORE UPDATE ON "CatalogFieldChange"
FOR EACH ROW EXECUTE FUNCTION prevent_catalog_field_change_mutation();

CREATE TRIGGER "CatalogFieldChange_no_delete"
BEFORE DELETE ON "CatalogFieldChange"
FOR EACH ROW EXECUTE FUNCTION prevent_catalog_field_change_mutation();
