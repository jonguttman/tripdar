#!/usr/bin/env tsx

import { sendApprovedStaffReviewInviteBatch } from "../src/domain/myco/staffReviewInviteBatches";

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

async function main() {
  const batchId = arg("--batch-id");
  const approvedInteractionId = arg("--approved-interaction-id");
  if (!batchId || !approvedInteractionId) {
    console.error(
      "Usage: npx tsx scripts/send-staff-review-invite-batch.mts --batch-id <id> --approved-interaction-id <id>"
    );
    process.exitCode = 2;
    return;
  }

  const result = await sendApprovedStaffReviewInviteBatch({ batchId, approvedInteractionId });
  console.log(JSON.stringify({
    batchId: result.batchId,
    status: result.status,
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
  }, null, 2));
  if (result.failed.length > 0 || result.status === "validation_failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "staff invite batch send failed");
  process.exitCode = 1;
});
