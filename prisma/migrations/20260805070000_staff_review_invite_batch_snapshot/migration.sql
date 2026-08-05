-- KEWL-2972 / KEWL-2948
-- Additive approval-time employee-review invite batch snapshots, per-recipient
-- provider send audit, and durable fail-closed no-send evidence.

CREATE TABLE "StaffReviewInviteBatch" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'approved',
  "approvedBy" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceCommentId" TEXT,
  "sourceCardId" TEXT,
  "approvedInteractionId" TEXT,
  "expiresInDays" INTEGER NOT NULL,
  "rosterDigest" TEXT NOT NULL,
  "sender" TEXT NOT NULL,
  "subjectDigest" TEXT NOT NULL,
  "htmlDigest" TEXT NOT NULL,
  "textDigest" TEXT NOT NULL,
  "providerCredentialFingerprint" TEXT NOT NULL,
  "totalRecipients" INTEGER NOT NULL,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "blockedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffReviewInviteBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffReviewInviteRecipient" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "accessTokenId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "accessTokenHash" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientEmailNormalized" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "link" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "linkDigest" TEXT NOT NULL,
  "subjectDigest" TEXT NOT NULL,
  "htmlDigest" TEXT NOT NULL,
  "textDigest" TEXT NOT NULL,
  "rosterDigest" TEXT NOT NULL,
  "sender" TEXT NOT NULL,
  "providerCredentialFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "providerMessageId" TEXT,
  "sentAt" TIMESTAMP(3),
  "blockedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffReviewInviteRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffReviewInviteNoSendEvidence" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "recipientId" TEXT,
  "assignmentId" TEXT,
  "employeeId" TEXT,
  "accessTokenId" TEXT,
  "partnerId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "detail" JSONB NOT NULL DEFAULT '{}',
  "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffReviewInviteNoSendEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffReviewInviteBatch_partnerId_status_idx"
  ON "StaffReviewInviteBatch"("partnerId", "status");
CREATE INDEX "StaffReviewInviteBatch_catalogItemId_status_idx"
  ON "StaffReviewInviteBatch"("catalogItemId", "status");
CREATE INDEX "StaffReviewInviteBatch_approvedAt_idx"
  ON "StaffReviewInviteBatch"("approvedAt");

CREATE UNIQUE INDEX "StaffReviewInviteRecipient_batchId_assignmentId_key"
  ON "StaffReviewInviteRecipient"("batchId", "assignmentId");
CREATE UNIQUE INDEX "StaffReviewInviteRecipient_batchId_accessTokenId_key"
  ON "StaffReviewInviteRecipient"("batchId", "accessTokenId");
CREATE INDEX "StaffReviewInviteRecipient_batchId_status_idx"
  ON "StaffReviewInviteRecipient"("batchId", "status");
CREATE INDEX "StaffReviewInviteRecipient_assignmentId_idx"
  ON "StaffReviewInviteRecipient"("assignmentId");
CREATE INDEX "StaffReviewInviteRecipient_employeeId_status_idx"
  ON "StaffReviewInviteRecipient"("employeeId", "status");
CREATE INDEX "StaffReviewInviteRecipient_catalogItemId_status_idx"
  ON "StaffReviewInviteRecipient"("catalogItemId", "status");
CREATE INDEX "StaffReviewInviteRecipient_providerMessageId_idx"
  ON "StaffReviewInviteRecipient"("providerMessageId");

CREATE INDEX "StaffReviewInviteNoSendEvidence_batchId_detectedAt_idx"
  ON "StaffReviewInviteNoSendEvidence"("batchId", "detectedAt");
CREATE INDEX "StaffReviewInviteNoSendEvidence_recipientId_idx"
  ON "StaffReviewInviteNoSendEvidence"("recipientId");
CREATE INDEX "StaffReviewInviteNoSendEvidence_assignmentId_idx"
  ON "StaffReviewInviteNoSendEvidence"("assignmentId");
CREATE INDEX "StaffReviewInviteNoSendEvidence_employeeId_idx"
  ON "StaffReviewInviteNoSendEvidence"("employeeId");
CREATE INDEX "StaffReviewInviteNoSendEvidence_accessTokenId_idx"
  ON "StaffReviewInviteNoSendEvidence"("accessTokenId");
CREATE INDEX "StaffReviewInviteNoSendEvidence_reason_idx"
  ON "StaffReviewInviteNoSendEvidence"("reason");

ALTER TABLE "StaffReviewInviteBatch"
  ADD CONSTRAINT "StaffReviewInviteBatch_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteBatch"
  ADD CONSTRAINT "StaffReviewInviteBatch_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "StoreProductCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteRecipient"
  ADD CONSTRAINT "StaffReviewInviteRecipient_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "StaffReviewInviteBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteRecipient"
  ADD CONSTRAINT "StaffReviewInviteRecipient_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "MycoEmployeeReviewAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteRecipient"
  ADD CONSTRAINT "StaffReviewInviteRecipient_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteRecipient"
  ADD CONSTRAINT "StaffReviewInviteRecipient_accessTokenId_fkey"
  FOREIGN KEY ("accessTokenId") REFERENCES "CatalogAccessToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteNoSendEvidence"
  ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "StaffReviewInviteBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteNoSendEvidence"
  ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "StaffReviewInviteRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteNoSendEvidence"
  ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "MycoEmployeeReviewAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteNoSendEvidence"
  ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteNoSendEvidence"
  ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_accessTokenId_fkey"
  FOREIGN KEY ("accessTokenId") REFERENCES "CatalogAccessToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteNoSendEvidence"
  ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
