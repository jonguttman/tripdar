#!/usr/bin/env node

const USAGE =
  "Usage: npm run staff-review:record-invite-batch-approval -- --batch-id <id> --approved-interaction-id <id> --approved-by <email>";

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

async function main() {
  const batchId = arg("--batch-id");
  const approvedInteractionId = arg("--approved-interaction-id");
  const approvedBy = arg("--approved-by");
  if (!batchId || !approvedInteractionId || !approvedBy) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const { approveStaffReviewInviteBatch } = await import("../src/domain/myco/staffReviewInviteBatches");
  const result = await approveStaffReviewInviteBatch({ batchId, approvedInteractionId, approvedBy });
  console.log(JSON.stringify({
    batchId: result.id,
    status: result.status,
    approvedInteractionId: result.approvedInteractionId,
    approvedBy: result.approvedBy,
    approvedAt: result.approvedAt,
    batchDigest: result.batchDigest,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "staff invite batch approval recording failed");
  process.exitCode = 1;
});
