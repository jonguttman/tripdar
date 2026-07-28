CREATE TABLE "PublicWriteRateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicWriteRateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "PublicWriteRateLimitBucket_resetAt_idx" ON "PublicWriteRateLimitBucket"("resetAt");
