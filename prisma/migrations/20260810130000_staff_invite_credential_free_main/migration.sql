-- KEWL-3405: re-derived credential-free staff-invite approval on top of origin/main.
--
-- This migration assumes the KEWL-2912/2950/3075 staff-review invite subsystem already
-- exists. It must be applied only after the upstream staff-review invite batch tables are
-- present; table collisions or missing upstream objects should fail loudly.
--
-- It does not mint, revoke, send, or mutate production data outside the schema shape
-- needed for token-free drafts and single shared staff-link approval.

ALTER TABLE "StaffReviewInviteBatch"
  ADD COLUMN "approvalDigest" TEXT,
  ADD COLUMN "approvalDigestVersion" TEXT,
  ADD COLUMN "requestedExpirySeconds" INTEGER NOT NULL DEFAULT 1814400,
  ALTER COLUMN "batchDigest" DROP NOT NULL;

CREATE TABLE "StaffReviewInviteBatchDraftRecipient" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "employeeId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "partnerScopeId" TEXT NOT NULL,
  "draftRecipientDigest" TEXT NOT NULL,
  "ccDigest" TEXT NOT NULL,
  "subjectTemplateDigest" TEXT NOT NULL,
  "htmlTemplateDigest" TEXT NOT NULL,
  "textTemplateDigest" TEXT NOT NULL,
  "sealedDraftCiphertext" TEXT NOT NULL,
  "sealedDraftIv" TEXT NOT NULL,
  "sealedDraftAuthTag" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffReviewInviteBatchDraftRecipient_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StaffReviewInviteBatchRecipient"
  ADD COLUMN "catalogAccessTokenId" TEXT,
  ADD COLUMN "draftRecipientDigest" TEXT,
  ADD COLUMN "invalidatedAt" TIMESTAMP(3),
  ALTER COLUMN "invitationId" DROP NOT NULL,
  ALTER COLUMN "invitationTokenHash" DROP NOT NULL,
  ALTER COLUMN "invitationStatusAtApproval" DROP NOT NULL,
  ALTER COLUMN "invitationIssuedAt" DROP NOT NULL,
  ALTER COLUMN "invitationExpiresAt" DROP NOT NULL;

CREATE UNIQUE INDEX "StaffReviewInviteBatch_approvalDigest_key"
  ON "StaffReviewInviteBatch"("approvalDigest");
CREATE INDEX "StaffReviewInviteBatch_approvalDigest_idx"
  ON "StaffReviewInviteBatch"("approvalDigest");
CREATE INDEX "StaffReviewInviteBatch_batchDigest_idx"
  ON "StaffReviewInviteBatch"("batchDigest");

CREATE UNIQUE INDEX "StaffReviewInviteBatchDraftRecipient_batchId_ordinal_key"
  ON "StaffReviewInviteBatchDraftRecipient"("batchId", "ordinal");
CREATE UNIQUE INDEX "StaffReviewInviteBatchDraftRecipient_batchId_emailNormalize_key"
  ON "StaffReviewInviteBatchDraftRecipient"("batchId", "emailNormalized");
CREATE INDEX "StaffReviewInviteBatchDraftRecipient_employeeId_idx"
  ON "StaffReviewInviteBatchDraftRecipient"("employeeId");

CREATE UNIQUE INDEX "StaffReviewInviteBatchRecipient_batchId_ordinal_key"
  ON "StaffReviewInviteBatchRecipient"("batchId", "ordinal");
CREATE INDEX "StaffReviewInviteBatchRecipient_catalogAccessTokenId_idx"
  ON "StaffReviewInviteBatchRecipient"("catalogAccessTokenId");

ALTER TABLE "StaffReviewInviteBatchDraftRecipient"
  ADD CONSTRAINT "StaffReviewInviteBatchDraftRecipient_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "StaffReviewInviteBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteBatchDraftRecipient"
  ADD CONSTRAINT "StaffReviewInviteBatchDraftRecipient_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteBatchRecipient"
  ADD CONSTRAINT "StaffReviewInviteBatchRecipient_catalogAccessTokenId_fkey"
  FOREIGN KEY ("catalogAccessTokenId") REFERENCES "CatalogAccessToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
