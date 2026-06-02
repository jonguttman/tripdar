ALTER TABLE "Partner" ADD COLUMN "subdomain" TEXT;
ALTER TABLE "Partner" ADD COLUMN "contactInfo" JSONB;
ALTER TABLE "Partner" ADD COLUMN "mycoWelcomeMessage" TEXT;

CREATE INDEX "Partner_subdomain_idx" ON "Partner"("subdomain");
