-- KEWL-2912: per-person staff catalog invitations.
--
-- Additive only. This migration intentionally does not delete, truncate, revoke, or
-- rewrite CatalogAccessToken, ReviewerEnrollmentEvent, MycoEmployeeReviewAssignment,
-- MycoEmployeeProductReview, CatalogFieldChange, or existing seeded @internal identities.
--
-- Rollback note: if this has not shipped to production, drop these three new tables in
-- dependency order. If rows exist, first revoke/cancel affected invitations/sessions via
-- an audited operator path; do not delete historical staff-review or catalog audit rows.

CREATE TABLE "StaffReviewInvitation" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "lastOpenedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT,
  "revocationReason" TEXT,
  "issuedBy" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scannerOpenedAt" TIMESTAMP(3),
  "scannerUserAgentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffReviewInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffReviewSession" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "invitationId" TEXT,
  "sessionHash" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffReviewSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffReviewerIdentityAlias" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "legacyEmployeeId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "legacyEmail" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "reason" TEXT NOT NULL,

  CONSTRAINT "StaffReviewerIdentityAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffReviewInvitation_tokenHash_key" ON "StaffReviewInvitation"("tokenHash");
CREATE INDEX "StaffReviewInvitation_partnerId_status_idx" ON "StaffReviewInvitation"("partnerId", "status");
CREATE INDEX "StaffReviewInvitation_employeeId_status_idx" ON "StaffReviewInvitation"("employeeId", "status");
CREATE INDEX "StaffReviewInvitation_expiresAt_idx" ON "StaffReviewInvitation"("expiresAt");

CREATE UNIQUE INDEX "StaffReviewSession_sessionHash_key" ON "StaffReviewSession"("sessionHash");
CREATE INDEX "StaffReviewSession_partnerId_employeeId_idx" ON "StaffReviewSession"("partnerId", "employeeId");
CREATE INDEX "StaffReviewSession_employeeId_expiresAt_idx" ON "StaffReviewSession"("employeeId", "expiresAt");
CREATE INDEX "StaffReviewSession_invitationId_idx" ON "StaffReviewSession"("invitationId");
CREATE INDEX "StaffReviewSession_expiresAt_idx" ON "StaffReviewSession"("expiresAt");

CREATE UNIQUE INDEX "StaffReviewerIdentityAlias_partnerId_legacyEmployeeId_employeeId_key"
  ON "StaffReviewerIdentityAlias"("partnerId", "legacyEmployeeId", "employeeId");
CREATE INDEX "StaffReviewerIdentityAlias_partnerId_legacyEmployeeId_idx"
  ON "StaffReviewerIdentityAlias"("partnerId", "legacyEmployeeId");
CREATE INDEX "StaffReviewerIdentityAlias_partnerId_employeeId_idx"
  ON "StaffReviewerIdentityAlias"("partnerId", "employeeId");
CREATE INDEX "StaffReviewerIdentityAlias_emailNormalized_idx"
  ON "StaffReviewerIdentityAlias"("emailNormalized");

ALTER TABLE "StaffReviewInvitation"
  ADD CONSTRAINT "StaffReviewInvitation_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewInvitation"
  ADD CONSTRAINT "StaffReviewInvitation_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewSession"
  ADD CONSTRAINT "StaffReviewSession_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewSession"
  ADD CONSTRAINT "StaffReviewSession_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewSession"
  ADD CONSTRAINT "StaffReviewSession_invitationId_fkey"
  FOREIGN KEY ("invitationId") REFERENCES "StaffReviewInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffReviewerIdentityAlias"
  ADD CONSTRAINT "StaffReviewerIdentityAlias_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewerIdentityAlias"
  ADD CONSTRAINT "StaffReviewerIdentityAlias_legacyEmployeeId_fkey"
  FOREIGN KEY ("legacyEmployeeId") REFERENCES "MycoEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffReviewerIdentityAlias"
  ADD CONSTRAINT "StaffReviewerIdentityAlias_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
