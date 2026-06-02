-- Add optional partnerId to User for per-user partner scoping in Myco admin
ALTER TABLE "User" ADD COLUMN "partnerId" TEXT;
CREATE INDEX "User_partnerId_idx" ON "User"("partnerId");
ALTER TABLE "User" ADD CONSTRAINT "User_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
