#!/usr/bin/env node

import fs from "node:fs/promises";

const USAGE =
  "Usage: npm run staff-review:prepare-invite-batch -- --partner-id <id> --messages-file <path> --from <email> --reply-to <email> --rendered-by <email> --expires-in-days <days>";

interface RawMessage {
  email: string;
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

function requestOriginFromEnv(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function parseExpiresInDays(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isRawMessage(value: unknown): value is RawMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.email === "string" &&
    typeof message.subject === "string" &&
    typeof message.html === "string" &&
    typeof message.text === "string" &&
    (message.cc === undefined ||
      (Array.isArray(message.cc) && message.cc.every((email) => typeof email === "string")))
  );
}

async function readMessages(filePath: string): Promise<RawMessage[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to read messages file: ${error instanceof Error ? error.message : "invalid JSON"}`
    );
  }
  if (!Array.isArray(parsed) || !parsed.every(isRawMessage)) {
    throw new Error("Messages file must be a JSON array of { email, subject, html, text, cc? } objects");
  }
  return parsed;
}

async function assertRosterMatches(messages: RawMessage[]) {
  const { normalizeEmployeeEmail } = await import("../src/domain/myco/employeeReviews");
  const { tmtDirectStaffReviewerEmails } = await import("../src/domain/myco/staffReviewRoster");
  const expectedEmails = tmtDirectStaffReviewerEmails();
  const actualEmails = messages.map((message) => normalizeEmployeeEmail(message.email));
  const uniqueActualEmails = new Set(actualEmails);
  if (uniqueActualEmails.size !== actualEmails.length || uniqueActualEmails.size !== expectedEmails.length) {
    throw new Error(`Messages file must contain exactly ${expectedEmails.length} TMT staff reviewer messages`);
  }
  for (const email of expectedEmails) {
    if (!uniqueActualEmails.has(email)) throw new Error(`Messages file is missing TMT staff reviewer ${email}`);
  }
}

async function main() {
  const partnerId = arg("--partner-id");
  const messagesFile = arg("--messages-file");
  const from = arg("--from");
  const replyTo = arg("--reply-to");
  const renderedBy = arg("--rendered-by");
  const expiresInDays = parseExpiresInDays(arg("--expires-in-days"));
  if (!partnerId || !messagesFile || !from || !replyTo || !renderedBy || expiresInDays === null) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const messages = await readMessages(messagesFile);
  await assertRosterMatches(messages);
  const { prepareStaffReviewInviteBatch } = await import("../src/domain/myco/staffReviewInviteBatches");
  const batch = await prepareStaffReviewInviteBatch({
    partnerId,
    messages,
    fromAddress: from,
    replyToAddress: replyTo,
    renderedBy,
    expiresInDays,
    requestOrigin: requestOriginFromEnv(),
  });
  console.log(JSON.stringify({
    id: batch.id,
    status: batch.status,
    recipients: batch.recipients.map((recipient) => ({
      recipientId: recipient.id,
      emailMasked: recipient.emailMasked,
      inviteUrl: recipient.inviteUrl,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "staff invite batch prepare failed");
  process.exitCode = 1;
});
