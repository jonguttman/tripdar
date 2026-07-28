-- KEWL-2394: shared staff review link + bounded self-enrollment window.
--
-- Jon's 2026-07-28 ruling replaced the KEWL-2364 per-reviewer link model: one link
-- serves the whole roster and each reviewer picks a PIN on first use. Additive only —
-- nothing is dropped and no existing column changes meaning, so a database still running
-- the per-reviewer build keeps working until the new code ships.

-- 1. The enrollment window, carried on the link itself.
--    `enrollmentClosesAt` is set at mint time (now + 72h). `enrollmentClosedAt` is
--    stamped when the roster finishes enrolling or an admin closes it early. Both NULL
--    means "never opened", which the application treats as CLOSED — a link minted before
--    this migration must not silently become self-enrollable.
ALTER TABLE "CatalogAccessToken" ADD COLUMN IF NOT EXISTS "enrollmentClosesAt" TIMESTAMP(3);
ALTER TABLE "CatalogAccessToken" ADD COLUMN IF NOT EXISTS "enrollmentClosedAt" TIMESTAMP(3);

-- 2. Session revocation epoch.
--    Reviewer sessions are stateless signed cookies, so an admin PIN reset cannot delete
--    them server-side. Any session minted at or before this instant is refused, which is
--    what makes a reset actually sign the reviewer's devices out.
ALTER TABLE "MycoEmployee" ADD COLUMN IF NOT EXISTS "pinSessionsRevokedAt" TIMESTAMP(3);

-- 3. Append-only enrollment ledger.
--    Every enrollment-state transition AND every refused attempt lands here. Nothing in
--    the application updates or deletes a row, so enrollment state is never changed by a
--    silent UPDATE.
CREATE TABLE IF NOT EXISTS "ReviewerEnrollmentEvent" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "accessTokenId" TEXT,
    "employeeId" TEXT,
    "employeeName" TEXT,
    "event" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorIdentity" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewerEnrollmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReviewerEnrollmentEvent_partnerId_createdAt_idx"
    ON "ReviewerEnrollmentEvent"("partnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewerEnrollmentEvent_accessTokenId_createdAt_idx"
    ON "ReviewerEnrollmentEvent"("accessTokenId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewerEnrollmentEvent_employeeId_createdAt_idx"
    ON "ReviewerEnrollmentEvent"("employeeId", "createdAt");

-- The reviewer/link FKs are SET NULL rather than CASCADE on purpose: deleting a reviewer
-- must not erase the record of what they claimed. `employeeName` is denormalised above so
-- the entry stays readable once the FK is nulled.
DO $$
BEGIN
    ALTER TABLE "ReviewerEnrollmentEvent"
        ADD CONSTRAINT "ReviewerEnrollmentEvent_partnerId_fkey"
        FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "ReviewerEnrollmentEvent"
        ADD CONSTRAINT "ReviewerEnrollmentEvent_accessTokenId_fkey"
        FOREIGN KEY ("accessTokenId") REFERENCES "CatalogAccessToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "ReviewerEnrollmentEvent"
        ADD CONSTRAINT "ReviewerEnrollmentEvent_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
