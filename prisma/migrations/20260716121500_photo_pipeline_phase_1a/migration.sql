-- Photo Pipeline Phase 1a: durable job ledger and exact state/mode contracts.
CREATE TYPE "PhotoJobProcessingMode" AS ENUM ('catalog_safe', 'premium');

CREATE TYPE "PhotoJobStatus" AS ENUM (
    'uploaded',
    'analyzing',
    'processing',
    'validating',
    'needs_review',
    'approved',
    'rejected',
    'failed'
);

CREATE TABLE "PhotoJob" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "brand" TEXT,
    "productName" TEXT NOT NULL,
    "variant" TEXT,
    "view" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "originalBlobUrl" TEXT NOT NULL,
    "sourceContentHash" TEXT NOT NULL,
    "processingMode" "PhotoJobProcessingMode" NOT NULL DEFAULT 'catalog_safe',
    "status" "PhotoJobStatus" NOT NULL DEFAULT 'uploaded',
    "qualityScore" DOUBLE PRECISION,
    "labelFidelityScore" DOUBLE PRECISION,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "manifest" JSONB NOT NULL DEFAULT '{}',
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhotoJob_jobId_key" ON "PhotoJob"("jobId");
CREATE UNIQUE INDEX "PhotoJob_sourceContentHash_key" ON "PhotoJob"("sourceContentHash");
CREATE INDEX "PhotoJob_sku_idx" ON "PhotoJob"("sku");
CREATE INDEX "PhotoJob_status_createdAt_idx" ON "PhotoJob"("status", "createdAt");
CREATE INDEX "PhotoJob_processingMode_status_idx" ON "PhotoJob"("processingMode", "status");
