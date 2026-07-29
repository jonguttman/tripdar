-- KEWL-2379: shared staff-review link + bounded PIN self-enrollment window.
--
-- Additive only. Nothing is dropped and no existing column changes meaning.
--
-- Jon's override (2026-07-28) replaces one-link-per-reviewer with a single shared roster
-- link. Identity therefore comes from "you pick your name" again, which is only safe while
-- it is bounded: a reviewer may claim an unset PIN ONLY inside an admin-controlled window,
-- and every claim lands in an append-only ledger that an admin can act on.

-- 1. The enrollment window lives on the link, not globally, so a re-minted link starts a
--    fresh window and revoking the link ends enrollment with it.
--    `enrollmentOpen` defaults FALSE so every pre-existing token — including the per-
--    reviewer links minted earlier today — is non-enrollable until explicitly opened.
ALTER TABLE "CatalogAccessToken" ADD COLUMN IF NOT EXISTS "enrollmentOpen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CatalogAccessToken" ADD COLUMN IF NOT EXISTS "enrollmentClosesAt" TIMESTAMP(3);

-- 2. Append-only enrollment ledger.
--
--    INSERT-only by contract: no `updatedAt` column, and no update/delete path exists in
--    the application. Reviewer name/email are denormalised so a row still reads correctly
--    after a rename, and both foreign keys are ON DELETE SET NULL — removing a reviewer or
--    revoking a link must never erase the evidence that an enrollment happened.
CREATE TABLE IF NOT EXISTS "ReviewerEnrollmentEvent" (
    "id"            TEXT NOT NULL,
    "partnerId"     TEXT NOT NULL,
    "tokenId"       TEXT,
    "employeeId"    TEXT,
    "employeeName"  TEXT NOT NULL,
    "employeeEmail" TEXT,
    "eventType"     TEXT NOT NULL,
    "actorType"     TEXT NOT NULL,
    "actorIdentity" TEXT NOT NULL,
    "reason"        TEXT,
    "ip"            TEXT,
    "userAgent"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewerEnrollmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReviewerEnrollmentEvent_partnerId_createdAt_idx"
  ON "ReviewerEnrollmentEvent"("partnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewerEnrollmentEvent_employeeId_createdAt_idx"
  ON "ReviewerEnrollmentEvent"("employeeId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewerEnrollmentEvent_tokenId_createdAt_idx"
  ON "ReviewerEnrollmentEvent"("tokenId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewerEnrollmentEvent_eventType_createdAt_idx"
  ON "ReviewerEnrollmentEvent"("eventType", "createdAt");

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
    ADD CONSTRAINT "ReviewerEnrollmentEvent_tokenId_fkey"
    FOREIGN KEY ("tokenId") REFERENCES "CatalogAccessToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ReviewerEnrollmentEvent"
    ADD CONSTRAINT "ReviewerEnrollmentEvent_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "MycoEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
