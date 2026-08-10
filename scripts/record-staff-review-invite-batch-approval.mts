#!/usr/bin/env node

const USAGE =
  "Usage: npm run staff-review:record-invite-batch-approval -- --partner-id <id> --batch-id <id> --approved-interaction-id <id> --approved-by <email> [--source-issue-id <id> --source-comment-id <id>] [--source-card-id <id>] [--provider-credential-fingerprint <sha256>] [--seal-key-fingerprint <sha256>]";

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

async function main() {
  const partnerId = arg("--partner-id");
  const batchId = arg("--batch-id");
  const approvedInteractionId = arg("--approved-interaction-id");
  const approvedBy = arg("--approved-by");
  const sourceIssueId = arg("--source-issue-id");
  const sourceCommentId = arg("--source-comment-id");
  const sourceCardId = arg("--source-card-id");
  const providerCredentialFingerprint = arg("--provider-credential-fingerprint");
  const sealKeyFingerprint = arg("--seal-key-fingerprint");
  if (!partnerId || !batchId || !approvedInteractionId || !approvedBy) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  if ((sourceIssueId && !sourceCommentId) || (!sourceIssueId && sourceCommentId)) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const { approveStaffReviewInviteBatch } = await import("../src/domain/myco/staffReviewInviteBatches");
  const result = await approveStaffReviewInviteBatch({
    partnerId,
    batchId,
    approvedInteractionId,
    approvedBy,
    sourceEvidence:
      sourceIssueId && sourceCommentId
        ? { sourceIssueId, sourceCommentId, sourceCardId }
        : undefined,
    providerCredentialFingerprint: providerCredentialFingerprint ?? undefined,
    sealKeyFingerprint: sealKeyFingerprint ?? undefined,
  });
  console.log(JSON.stringify({
    batchId: result.batchId,
    status: result.status,
    approvedInteractionId: result.approvedInteractionId,
    approvedBy: result.approvedBy,
    approvedAt: result.approvedAt,
    batchDigest: result.batchDigest,
    staffReviewInvitationCount: result.staffReviewInvitationCount,
    sharedCatalogAccessTokenCount: result.sharedCatalogAccessTokenCount,
    recipientEvidenceCount: result.recipientEvidenceCount,
    invitationCount: result.invitationCount,
    revokedPriorInvitationCount: result.revokedPriorInvitationCount,
    recipientCount: result.recipientCount,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "staff invite batch approval recording failed");
  process.exitCode = 1;
});
