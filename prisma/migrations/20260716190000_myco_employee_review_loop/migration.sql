ALTER TABLE "StoreProductCatalog" ADD COLUMN "sku" TEXT;
ALTER TABLE "StoreProductCatalog" ADD COLUMN "intakeStatus" TEXT NOT NULL DEFAULT 'draft';

ALTER TABLE "ProductPhoto" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'source';
ALTER TABLE "ProductPhoto" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "ProductPhoto" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductPhoto" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "ProductPhoto" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "ProductPhoto" ADD COLUMN "provider" TEXT;
ALTER TABLE "ProductPhoto" ADD COLUMN "model" TEXT;
ALTER TABLE "ProductPhoto" ADD COLUMN "costCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductPhoto" ADD COLUMN "provenance" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "MycoEmployee" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "points" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastRespondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MycoEmployee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MycoEmployeeReviewAssignment" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MycoEmployeeReviewAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MycoEmployeeProductReview" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "knowsProduct" BOOLEAN NOT NULL,
    "clarityCognition" INTEGER,
    "moodSocial" INTEGER,
    "visualPattern" INTEGER,
    "somatic" INTEGER,
    "energyDirection" INTEGER,
    "depthDirection" INTEGER,
    "doseUnitsTried" DOUBLE PRECISION,
    "doseUnitLabel" TEXT,
    "onsetMinutes" INTEGER,
    "durationMinutes" INTEGER,
    "flavor" TEXT,
    "confidence" INTEGER,
    "familiarity" TEXT,
    "notes" TEXT,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MycoEmployeeProductReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MycoEmployee_partnerId_email_key" ON "MycoEmployee"("partnerId", "email");
CREATE INDEX "MycoEmployee_partnerId_active_idx" ON "MycoEmployee"("partnerId", "active");
CREATE UNIQUE INDEX "MycoEmployeeReviewAssignment_tokenHash_key" ON "MycoEmployeeReviewAssignment"("tokenHash");
CREATE UNIQUE INDEX "MycoEmployeeReviewAssignment_catalogItemId_employeeId_key" ON "MycoEmployeeReviewAssignment"("catalogItemId", "employeeId");
CREATE INDEX "MycoEmployeeReviewAssignment_catalogItemId_status_idx" ON "MycoEmployeeReviewAssignment"("catalogItemId", "status");
CREATE INDEX "MycoEmployeeReviewAssignment_employeeId_status_idx" ON "MycoEmployeeReviewAssignment"("employeeId", "status");
CREATE INDEX "MycoEmployeeReviewAssignment_expiresAt_idx" ON "MycoEmployeeReviewAssignment"("expiresAt");
CREATE UNIQUE INDEX "MycoEmployeeProductReview_assignmentId_key" ON "MycoEmployeeProductReview"("assignmentId");
CREATE INDEX "MycoEmployeeProductReview_catalogItemId_createdAt_idx" ON "MycoEmployeeProductReview"("catalogItemId", "createdAt");
CREATE INDEX "MycoEmployeeProductReview_employeeId_createdAt_idx" ON "MycoEmployeeProductReview"("employeeId", "createdAt");
CREATE INDEX "StoreProductCatalog_partnerId_intakeStatus_idx" ON "StoreProductCatalog"("partnerId", "intakeStatus");
CREATE INDEX "ProductPhoto_catalogItemId_isPrimary_idx" ON "ProductPhoto"("catalogItemId", "isPrimary");

ALTER TABLE "MycoEmployee" ADD CONSTRAINT "MycoEmployee_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MycoEmployeeReviewAssignment" ADD CONSTRAINT "MycoEmployeeReviewAssignment_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "StoreProductCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MycoEmployeeReviewAssignment" ADD CONSTRAINT "MycoEmployeeReviewAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MycoEmployeeProductReview" ADD CONSTRAINT "MycoEmployeeProductReview_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MycoEmployeeReviewAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
