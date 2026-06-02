-- Myco Phase 1a: Partner table (missing from init migration) + new Myco models
-- for conversation engine, product catalog, outcome tracking, and lead gen.

-- CreateTable (Partner was defined in schema but never migrated to Neon)
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "allowedDomains" TEXT NOT NULL,
    "rateLimit" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Partner_apiKeyHash_key" ON "Partner"("apiKeyHash");

-- CreateIndex
CREATE INDEX "Partner_active_idx" ON "Partner"("active");

-- CreateTable
CREATE TABLE "MycoChatSession" (
    "id" TEXT NOT NULL,
    "recommendationSessionId" TEXT,
    "partnerId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "intentSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MycoChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MycoMessage" (
    "id" TEXT NOT NULL,
    "chatSessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intentSignals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MycoMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreProductCatalog" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "brand" TEXT,
    "strainSlug" TEXT,
    "productUnitMg" INTEGER,
    "photoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreProductCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVibeProfile" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVibeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStrengthOffset" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "offset" TEXT NOT NULL DEFAULT 'standard',
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductStrengthOffset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOutcomeReport" (
    "id" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "strainSlug" TEXT,
    "intendedEffect" JSONB NOT NULL,
    "actualEffect" JSONB,
    "rating" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserOutcomeReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnverifiedProduct" (
    "id" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "retailerName" TEXT NOT NULL,
    "retailerLocation" TEXT,
    "productName" TEXT NOT NULL,
    "format" TEXT,
    "dosageInfo" TEXT,
    "photoUrls" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnverifiedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailerLead" (
    "id" TEXT NOT NULL,
    "unverifiedProductId" TEXT,
    "retailerName" TEXT NOT NULL,
    "retailerLocation" TEXT,
    "contactInfo" JSONB,
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MycoChatSession_recommendationSessionId_key" ON "MycoChatSession"("recommendationSessionId");

-- CreateIndex
CREATE INDEX "MycoChatSession_partnerId_createdAt_idx" ON "MycoChatSession"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "MycoChatSession_sessionHash_idx" ON "MycoChatSession"("sessionHash");

-- CreateIndex
CREATE INDEX "MycoMessage_chatSessionId_idx" ON "MycoMessage"("chatSessionId");

-- CreateIndex
CREATE INDEX "StoreProductCatalog_partnerId_active_idx" ON "StoreProductCatalog"("partnerId", "active");

-- CreateIndex
CREATE INDEX "StoreProductCatalog_strainSlug_idx" ON "StoreProductCatalog"("strainSlug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVibeProfile_catalogItemId_key" ON "ProductVibeProfile"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductStrengthOffset_catalogItemId_key" ON "ProductStrengthOffset"("catalogItemId");

-- CreateIndex
CREATE INDEX "UserOutcomeReport_sessionHash_idx" ON "UserOutcomeReport"("sessionHash");

-- CreateIndex
CREATE INDEX "UserOutcomeReport_catalogItemId_idx" ON "UserOutcomeReport"("catalogItemId");

-- CreateIndex
CREATE INDEX "UserOutcomeReport_strainSlug_idx" ON "UserOutcomeReport"("strainSlug");

-- CreateIndex
CREATE INDEX "UnverifiedProduct_sessionHash_idx" ON "UnverifiedProduct"("sessionHash");

-- CreateIndex
CREATE INDEX "UnverifiedProduct_status_idx" ON "UnverifiedProduct"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerLead_unverifiedProductId_key" ON "RetailerLead"("unverifiedProductId");

-- CreateIndex
CREATE INDEX "RetailerLead_status_idx" ON "RetailerLead"("status");

-- AddForeignKey
ALTER TABLE "MycoChatSession" ADD CONSTRAINT "MycoChatSession_recommendationSessionId_fkey"
    FOREIGN KEY ("recommendationSessionId") REFERENCES "RecommendationSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MycoMessage" ADD CONSTRAINT "MycoMessage_chatSessionId_fkey"
    FOREIGN KEY ("chatSessionId") REFERENCES "MycoChatSession"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProductCatalog" ADD CONSTRAINT "StoreProductCatalog_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "Partner"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVibeProfile" ADD CONSTRAINT "ProductVibeProfile_catalogItemId_fkey"
    FOREIGN KEY ("catalogItemId") REFERENCES "StoreProductCatalog"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStrengthOffset" ADD CONSTRAINT "ProductStrengthOffset_catalogItemId_fkey"
    FOREIGN KEY ("catalogItemId") REFERENCES "StoreProductCatalog"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOutcomeReport" ADD CONSTRAINT "UserOutcomeReport_catalogItemId_fkey"
    FOREIGN KEY ("catalogItemId") REFERENCES "StoreProductCatalog"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailerLead" ADD CONSTRAINT "RetailerLead_unverifiedProductId_fkey"
    FOREIGN KEY ("unverifiedProductId") REFERENCES "UnverifiedProduct"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
