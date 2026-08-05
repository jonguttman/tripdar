-- KEWL-3075: seal and validate optional Cc recipients for staff-review invite batches.
--
-- Additive only. This migration records the approved Cc digest for future sends; it
-- does not prepare batches, mint invitations, send email, or mutate existing statuses.

ALTER TABLE "StaffReviewInviteBatchRecipient"
  ADD COLUMN "ccDigest" TEXT;
