CREATE TABLE "StaffReviewInviteBatch" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sender" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "providerCredentialFingerprint" TEXT NOT NULL,
    "subjectDigest" TEXT NOT NULL,
    "htmlDigest" TEXT NOT NULL,
    "textDigest" TEXT NOT NULL,
    "rosterDigest" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "refusedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "supersededByBatchId" TEXT,
    "approvalSnapshot" JSONB NOT NULL DEFAULT '{}',
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
    "emailNormalized" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "linkDigest" TEXT NOT NULL,
    "subjectDigest" TEXT NOT NULL,
    "htmlDigest" TEXT NOT NULL,
    "textDigest" TEXT NOT NULL,
    "rosterDigest" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "sendAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "noSendReason" TEXT,
    "recipientSnapshot" JSONB NOT NULL DEFAULT '{}',
    "messageSnapshot" JSONB NOT NULL DEFAULT '{}',
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
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffReviewInviteNoSendEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffReviewInviteBatch_partnerId_catalogItemId_status_idx" ON "StaffReviewInviteBatch"("partnerId", "catalogItemId", "status");
CREATE INDEX "StaffReviewInviteBatch_catalogItemId_approvedAt_idx" ON "StaffReviewInviteBatch"("catalogItemId", "approvedAt");
CREATE INDEX "StaffReviewInviteBatch_supersededByBatchId_idx" ON "StaffReviewInviteBatch"("supersededByBatchId");
CREATE INDEX "StaffReviewInviteBatch_rosterDigest_idx" ON "StaffReviewInviteBatch"("rosterDigest");

CREATE UNIQUE INDEX "StaffReviewInviteRecipient_batchId_assignmentId_key" ON "StaffReviewInviteRecipient"("batchId", "assignmentId");
CREATE UNIQUE INDEX "StaffReviewInviteRecipient_batchId_employeeId_key" ON "StaffReviewInviteRecipient"("batchId", "employeeId");
CREATE UNIQUE INDEX "StaffReviewInviteRecipient_batchId_accessTokenId_key" ON "StaffReviewInviteRecipient"("batchId", "accessTokenId");
CREATE INDEX "StaffReviewInviteRecipient_batchId_status_idx" ON "StaffReviewInviteRecipient"("batchId", "status");
CREATE INDEX "StaffReviewInviteRecipient_assignmentId_idx" ON "StaffReviewInviteRecipient"("assignmentId");
CREATE INDEX "StaffReviewInviteRecipient_employeeId_idx" ON "StaffReviewInviteRecipient"("employeeId");
CREATE INDEX "StaffReviewInviteRecipient_accessTokenId_idx" ON "StaffReviewInviteRecipient"("accessTokenId");
CREATE INDEX "StaffReviewInviteRecipient_providerMessageId_idx" ON "StaffReviewInviteRecipient"("providerMessageId");

CREATE INDEX "StaffReviewInviteNoSendEvidence_batchId_reason_idx" ON "StaffReviewInviteNoSendEvidence"("batchId", "reason");
CREATE INDEX "StaffReviewInviteNoSendEvidence_recipientId_idx" ON "StaffReviewInviteNoSendEvidence"("recipientId");
CREATE INDEX "StaffReviewInviteNoSendEvidence_assignmentId_idx" ON "StaffReviewInviteNoSendEvidence"("assignmentId");
CREATE INDEX "StaffReviewInviteNoSendEvidence_employeeId_idx" ON "StaffReviewInviteNoSendEvidence"("employeeId");
CREATE INDEX "StaffReviewInviteNoSendEvidence_accessTokenId_idx" ON "StaffReviewInviteNoSendEvidence"("accessTokenId");
CREATE INDEX "StaffReviewInviteNoSendEvidence_partnerId_createdAt_idx" ON "StaffReviewInviteNoSendEvidence"("partnerId", "createdAt");

ALTER TABLE "StaffReviewInviteBatch" ADD CONSTRAINT "StaffReviewInviteBatch_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffReviewInviteBatch" ADD CONSTRAINT "StaffReviewInviteBatch_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "StoreProductCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffReviewInviteBatch" ADD CONSTRAINT "StaffReviewInviteBatch_supersededByBatchId_fkey" FOREIGN KEY ("supersededByBatchId") REFERENCES "StaffReviewInviteBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteRecipient" ADD CONSTRAINT "StaffReviewInviteRecipient_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StaffReviewInviteBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffReviewInviteRecipient" ADD CONSTRAINT "StaffReviewInviteRecipient_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MycoEmployeeReviewAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffReviewInviteRecipient" ADD CONSTRAINT "StaffReviewInviteRecipient_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffReviewInviteRecipient" ADD CONSTRAINT "StaffReviewInviteRecipient_accessTokenId_fkey" FOREIGN KEY ("accessTokenId") REFERENCES "CatalogAccessToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInviteNoSendEvidence" ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StaffReviewInviteBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffReviewInviteNoSendEvidence" ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "StaffReviewInviteRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffReviewInviteNoSendEvidence" ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MycoEmployeeReviewAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffReviewInviteNoSendEvidence" ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffReviewInviteNoSendEvidence" ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_accessTokenId_fkey" FOREIGN KEY ("accessTokenId") REFERENCES "CatalogAccessToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffReviewInviteNoSendEvidence" ADD CONSTRAINT "StaffReviewInviteNoSendEvidence_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
