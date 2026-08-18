#!/usr/bin/env node

import fs from "node:fs/promises";

const USAGE =
  "Usage: npm run staff-review:prepare-invite-batch -- --partner-id <id> --template-file <path> --from <email> --reply-to <email> --rendered-by <email> --expires-in-days <days> --provider <name> --provider-credential-fingerprint <sha256> --source-issue-id <id> --source-comment-id <id> [--source-card-id <id>] [--seal-key-fingerprint <sha256>]";

interface RawTemplate {
  cc?: string[];
  subject: string;
  html: string;
  text: string;
}

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function parseExpiresInDays(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isRawTemplate(value: unknown): value is RawTemplate {
  if (!value || typeof value !== "object") return false;
  const template = value as Record<string, unknown>;
  return (
    typeof template.subject === "string" &&
    typeof template.html === "string" &&
    typeof template.text === "string" &&
    (template.cc === undefined ||
      (Array.isArray(template.cc) && template.cc.every((email) => typeof email === "string")))
  );
}

async function readTemplate(filePath: string): Promise<RawTemplate> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to read template file: ${error instanceof Error ? error.message : "invalid JSON"}`
    );
  }
  if (!isRawTemplate(parsed)) {
    throw new Error("Template file must be a JSON object with { subject, html, text, cc? }");
  }
  return parsed;
}

async function main() {
  const partnerId = arg("--partner-id");
  const templateFile = arg("--template-file");
  const from = arg("--from");
  const replyTo = arg("--reply-to");
  const renderedBy = arg("--rendered-by");
  const expiresInDays = parseExpiresInDays(arg("--expires-in-days"));
  const provider = arg("--provider");
  const providerCredentialFingerprint = arg("--provider-credential-fingerprint");
  const sourceIssueId = arg("--source-issue-id");
  const sourceCommentId = arg("--source-comment-id");
  const sourceCardId = arg("--source-card-id");
  const sealKeyFingerprint = arg("--seal-key-fingerprint");
  if (
    !partnerId ||
    !templateFile ||
    !from ||
    !replyTo ||
    !renderedBy ||
    expiresInDays === null ||
    !provider ||
    !providerCredentialFingerprint ||
    !sourceIssueId ||
    !sourceCommentId
  ) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const templates = await readTemplate(templateFile);
  const { prepareStaffReviewInviteBatch } = await import("../src/domain/myco/staffReviewInviteBatches");
  const batch = await prepareStaffReviewInviteBatch({
    partnerId,
    templates,
    provider,
    providerCredentialFingerprint,
    sourceIssueId,
    sourceCommentId,
    sourceCardId,
    fromAddress: from,
    replyToAddress: replyTo,
    renderedBy,
    requestedExpirySeconds: expiresInDays * 24 * 60 * 60,
    sealKeyFingerprint: sealKeyFingerprint ?? undefined,
  });
  console.log(JSON.stringify({
    batchId: batch.batchId,
    status: batch.status,
    approvalDigest: batch.approvalDigest,
    approvalDigestVersion: batch.approvalDigestVersion,
    requestedExpirySeconds: batch.requestedExpirySeconds,
    recipients: batch.recipients.map((recipient) => ({
      ordinal: recipient.ordinal,
      employeeId: recipient.employeeId,
      displayName: recipient.displayName,
      emailMasked: recipient.emailMasked,
    })),
    previews: batch.previews,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "staff invite batch prepare failed");
  process.exitCode = 1;
});
