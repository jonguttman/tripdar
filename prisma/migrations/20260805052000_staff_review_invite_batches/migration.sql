-- KEWL-2950: approval snapshots and send/no-send audit for staff-review invite batches.
--
-- Additive only. This migration creates durable approval evidence for exact invite-email
-- batches; it does not send email, revoke invitations, regenerate links, or alter
-- Jon-approved copy. Rollback must disable the executor before dropping these tables, and
-- must not drop rows that constitute send/no-send evidence.

CREATE TABLE "StaffReviewInviteBatch" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "renderedBy" TEXT NOT NULL,
  "renderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceIssueId" TEXT,
  "sourceCommentId" TEXT,
  "sourceCardId" TEXT,
  "approvedInteractionId" TEXT,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "provider" TEXT NOT NULL,
  "providerCredentialFingerprint" TEXT NOT NULL,
  "fromAddress" TEXT NOT NULL,
  "replyToAddress" TEXT,
  "rendererVersion" TEXT NOT NULL,
  "rosterDigest" TEXT NOT NULL,
  "batchDigest" TEXT NOT NULL,
  "sealKeyFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffReviewInviteBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffReviewInviteBatchRecipient" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "invitationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "invitationTokenHash" TEXT NOT NULL,
  "invitationStatusAtApproval" TEXT NOT NULL,
  "invitationIssuedAt" TIMESTAMP(3) NOT NULL,
  "invitationExpiresAt" TIMESTAMP(3) NOT NULL,
  "invitationRevokedAt" TIMESTAMP(3),
  "partnerScopeId" TEXT NOT NULL,
  "recipientIdentityDigest" TEXT NOT NULL,
  "linkDigest" TEXT NOT NULL,
  "subjectDigest" TEXT NOT NULL,
  "htmlDigest" TEXT NOT NULL,
  "textDigest" TEXT NOT NULL,
  "sealedPayloadCiphertext" TEXT NOT NULL,
  "sealedPayloadIv" TEXT NOT NULL,
  "sealedPayloadAuthTag" TEXT NOT NULL,
  "providerIdempotencyKey" TEXT NOT NULL,
  "sendStatus" TEXT NOT NULL DEFAULT 'pending',
  "claimId" TEXT,
  "claimedAt" TIMESTAMP(3),
  "sendAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastValidatedAt" TIMESTAMP(3),
  "validationFailureCode" TEXT,
  "validationFailureEvidence" JSONB,
  "providerMessageId" TEXT,
  "providerError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffReviewInviteBatchRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffReviewInviteBatch_approvedInteractionId_key"
  ON "StaffReviewInviteBatch"("approvedInteractionId");
CREATE UNIQUE INDEX "StaffReviewInviteBatch_batchDigest_key"
  ON "StaffReviewInviteBatch"("batchDigest");
CREATE INDEX "StaffReviewInviteBatch_partnerId_status_idx"
  ON "StaffReviewInviteBatch"("partnerId", "status");
CREATE INDEX "StaffReviewInviteBatch_approvedInteractionId_idx"
  ON "StaffReviewInviteBatch"("approvedInteractionId");
CREATE INDEX "StaffReviewInviteBatch_createdAt_idx"
  ON "StaffReviewInviteBatch"("createdAt");

CREATE UNIQUE INDEX "StaffReviewInviteBatchRecipient_providerIdempotencyKey_key"
  ON "StaffReviewInviteBatchRecipient"("providerIdempotencyKey");
CREATE UNIQUE INDEX "StaffReviewInviteBatchRecipient_providerMessageId_key"
  ON "StaffReviewInviteBatchRecipient"("providerMessageId");
CREATE UNIQUE INDEX "StaffReviewInviteBatchRecipient_batchId_emailNormalized_key"
  ON "StaffReviewInviteBatchRecipient"("batchId", "emailNormalized");
CREATE UNIQUE INDEX "StaffReviewInviteBatchRecipient_batchId_invitationId_key"
  ON "StaffReviewInviteBatchRecipient"("batchId", "invitationId");
CREATE INDEX "StaffReviewInviteBatchRecipient_batchId_sendStatus_idx"
  ON "StaffReviewInviteBatchRecipient"("batchId", "sendStatus");
CREATE INDEX "StaffReviewInviteBatchRecipient_employeeId_idx"
  ON "StaffReviewInviteBatchRecipient"("employeeId");
CREATE INDEX "StaffReviewInviteBatchRecipient_invitationId_idx"
  ON "StaffReviewInviteBatchRecipient"("invitationId");
CREATE INDEX "StaffReviewInviteBatchRecipient_validationFailureCode_idx"
  ON "StaffReviewInviteBatchRecipient"("validationFailureCode");

ALTER TABLE "StaffReviewInviteBatch"
  ADD CONSTRAINT "StaffReviewInviteBatch_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteBatchRecipient"
  ADD CONSTRAINT "StaffReviewInviteBatchRecipient_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "StaffReviewInviteBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteBatchRecipient"
  ADD CONSTRAINT "StaffReviewInviteBatchRecipient_invitationId_fkey"
  FOREIGN KEY ("invitationId") REFERENCES "StaffReviewInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteBatchRecipient"
  ADD CONSTRAINT "StaffReviewInviteBatchRecipient_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
