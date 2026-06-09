-- Strength offset confirmation (catalog readiness)
ALTER TABLE "ProductStrengthOffset" ADD COLUMN "confirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductStrengthOffset" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "ProductStrengthOffset" ADD COLUMN "confirmedBy" TEXT;

-- Product-first recommendation results (Myco customer flow)
CREATE TABLE "MycoRecommendationResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "baseScore" DOUBLE PRECISION NOT NULL,
    "strainMatch" BOOLEAN NOT NULL DEFAULT false,
    "doseTierLabel" TEXT,
    "doseUnitsText" TEXT,
    "doseMgLow" INTEGER,
    "doseMgHigh" INTEGER,
    "reflection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MycoRecommendationResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MycoRecommendationResult_sessionId_idx" ON "MycoRecommendationResult"("sessionId");
CREATE INDEX "MycoRecommendationResult_catalogItemId_createdAt_idx" ON "MycoRecommendationResult"("catalogItemId", "createdAt");

ALTER TABLE "MycoRecommendationResult" ADD CONSTRAINT "MycoRecommendationResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecommendationSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MycoRecommendationResult" ADD CONSTRAINT "MycoRecommendationResult_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "StoreProductCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Post-results email capture from the customer flow
CREATE TABLE "MycoProfileSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sessionToken" TEXT,
    "partnerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MycoProfileSignup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MycoProfileSignup_partnerId_createdAt_idx" ON "MycoProfileSignup"("partnerId", "createdAt");
CREATE INDEX "MycoProfileSignup_email_idx" ON "MycoProfileSignup"("email");
