import crypto from "crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_EMAIL_FROM_ADDRESS,
  DEFAULT_EMAIL_REPLY_TO_ADDRESS,
  providerCredentialFingerprint,
  sendEmail,
  type SendEmailResult,
} from "@/lib/email";
import { normalizeEmployeeEmail } from "./employeeReviews";
import {
  directStaffReviewerWhere,
  resolveDirectStaffReviewRoster,
  tmtDirectStaffReviewerEmails,
  type DirectStaffReviewEmployee,
  type ResolvedDirectStaffReviewer,
} from "./staffReviewRoster";
import {
  createStaffReviewInvitationToken,
  hashStaffReviewInvitationToken,
} from "./staffReviewInvitations";

export const STAFF_INVITE_BATCH_RENDERER_VERSION = "staff-review-invite-batch-v1";
export const STAFF_INVITE_BATCH_PROVIDER = "resend";
export const STAFF_INVITE_BATCH_SEALING_KEY_ENV = "STAFF_INVITE_BATCH_SEALING_KEY";
export const INVITE_URL_PLACEHOLDER = "{{INVITE_URL}}";

export const STAFF_INVITE_BATCH_STATUSES = [
  "draft",
  "approved",
  "sending",
  "partially_sent",
  "sent",
  "validation_failed",
  "superseded",
] as const;
export type StaffInviteBatchStatus = (typeof STAFF_INVITE_BATCH_STATUSES)[number];

export const STAFF_INVITE_RECIPIENT_SEND_STATUSES = [
  "pending",
  "claimed",
  "sent",
  "validation_failed",
  "provider_failed",
  "skipped",
] as const;
export type StaffInviteRecipientSendStatus =
  (typeof STAFF_INVITE_RECIPIENT_SEND_STATUSES)[number];

export const STAFF_INVITE_VALIDATION_FAILURE_CODES = [
  "batch_not_approved",
  "approval_evidence_mismatch",
  "missing_invitation",
  "revoked",
  "replaced_token",
  "expired",
  "invitation_status_mismatch",
  "partner_scope_mismatch",
  "employee_mismatch",
  "recipient_email_mismatch",
  "employee_inactive",
  "employee_opted_out",
  "roster_mismatch",
  "payload_unseal_failed",
  "link_digest_mismatch",
  "subject_digest_mismatch",
  "body_digest_mismatch",
  "sender_mismatch",
  "provider_credential_mismatch",
  "duplicate_send",
  "claim_conflict",
] as const;
export type StaffInviteValidationFailureCode =
  (typeof STAFF_INVITE_VALIDATION_FAILURE_CODES)[number];

export interface StaffInviteBatchMessageInput {
  email: string;
  subject: string;
  html: string;
  text: string;
}

export interface PrepareStaffInviteBatchInput {
  partnerId: string;
  renderedBy: string;
  requestOrigin: string;
  messages: StaffInviteBatchMessageInput[];
  sourceIssueId?: string;
  sourceCommentId?: string;
  sourceCardId?: string;
  expiresInDays?: number;
  fromAddress?: string;
  replyToAddress?: string;
  now?: Date;
}

export interface ApproveStaffInviteBatchInput {
  batchId: string;
  approvedInteractionId: string;
  approvedBy: string;
  sourceIssueId?: string;
  sourceCommentId?: string;
  sourceCardId?: string;
  now?: Date;
}

export interface SealedStaffInvitePayload {
  version: "staff-review-invite-payload-v1";
  batchId: string;
  recipientId: string;
  invitationId: string;
  employeeId: string;
  partnerId: string;
  displayName: string;
  emailNormalized: string;
  tokenHash: string;
  inviteUrl: string;
  subject: string;
  html: string;
  text: string;
  fromAddress: string;
  replyToAddress: string | null;
  provider: string;
  rendererVersion: string;
  expiresAt: string;
}

export interface SendStaffInviteBatchResult {
  batchId: string;
  status: StaffInviteBatchStatus;
  sent: Array<{ recipientId: string; emailMasked: string; providerMessageId: string }>;
  skipped: Array<{ recipientId: string; reason: string }>;
  failed: Array<{
    recipientId: string;
    code: StaffInviteValidationFailureCode | "provider_failed";
    evidence?: Record<string, unknown>;
  }>;
}

interface BatchRecord {
  id: string;
  partnerId: string;
  status: string;
  approvedInteractionId: string | null;
  provider: string;
  providerCredentialFingerprint: string;
  fromAddress: string;
  replyToAddress: string | null;
  rendererVersion: string;
  rosterDigest: string;
  batchDigest: string;
  sealKeyFingerprint: string;
}

interface RecipientRecord {
  id: string;
  batchId: string;
  ordinal: number;
  invitationId: string;
  employeeId: string;
  displayName: string;
  emailNormalized: string;
  invitationTokenHash: string;
  invitationStatusAtApproval: string;
  invitationIssuedAt: Date;
  invitationExpiresAt: Date;
  invitationRevokedAt: Date | null;
  partnerScopeId: string;
  recipientIdentityDigest: string;
  linkDigest: string;
  subjectDigest: string;
  htmlDigest: string;
  textDigest: string;
  sealedPayloadCiphertext: string;
  sealedPayloadIv: string;
  sealedPayloadAuthTag: string;
  providerIdempotencyKey: string;
  sendStatus: string;
  claimId: string | null;
  claimedAt: Date | null;
  sendAttemptCount: number;
  validationFailureCode: string | null;
  validationFailureEvidence: Prisma.JsonValue | null;
  providerMessageId: string | null;
  sentAt: Date | null;
}

interface LiveInvitation {
  id: string;
  partnerId: string;
  employeeId: string;
  emailNormalized: string;
  tokenHash: string;
  status: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  employee: DirectStaffReviewEmployee;
}

type Tx = Prisma.TransactionClient;

function iso(value: Date): string {
  return value.toISOString();
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return iso(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function digestCanonical(value: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function digestText(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function requireSealingKey(): Buffer {
  const raw = process.env[STAFF_INVITE_BATCH_SEALING_KEY_ENV]?.trim();
  if (!raw) {
    throw new Error(`${STAFF_INVITE_BATCH_SEALING_KEY_ENV} is required for staff invite batches`);
  }
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to derived key for local/test passphrases.
  }
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

export function sealKeyFingerprint(): string {
  return digestCanonical({
    version: "staff-invite-seal-key-v1",
    keyDigest: crypto.createHash("sha256").update(requireSealingKey()).digest("hex"),
  });
}

export function sealStaffInvitePayload(payload: SealedStaffInvitePayload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", requireSealingKey(), iv);
  const plaintext = Buffer.from(canonicalJson(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    sealedPayloadCiphertext: ciphertext.toString("base64"),
    sealedPayloadIv: iv.toString("base64"),
    sealedPayloadAuthTag: cipher.getAuthTag().toString("base64"),
  };
}

export function unsealStaffInvitePayload(recipient: Pick<
  RecipientRecord,
  "sealedPayloadCiphertext" | "sealedPayloadIv" | "sealedPayloadAuthTag"
>): SealedStaffInvitePayload {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    requireSealingKey(),
    Buffer.from(recipient.sealedPayloadIv, "base64")
  );
  decipher.setAuthTag(Buffer.from(recipient.sealedPayloadAuthTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(recipient.sealedPayloadCiphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as SealedStaffInvitePayload;
}

function inviteUrl(token: string, requestOrigin: string): string {
  return `${requestOrigin.replace(/\/$/, "")}/staff-review/invite/${token}`;
}

function inviteTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const token = parsed.pathname.split("/").filter(Boolean).at(-1);
    return token || null;
  } catch {
    return null;
  }
}

function replaceInviteUrlPlaceholder(message: string, url: string): string {
  if (!message.includes(INVITE_URL_PLACEHOLDER)) {
    throw new Error(`Staff invite message is missing ${INVITE_URL_PLACEHOLDER}`);
  }
  return message.split(INVITE_URL_PLACEHOLDER).join(url);
}

function recipientIdentityDigest(input: {
  partnerId: string;
  employeeId: string;
  displayName: string;
  emailNormalized: string;
  invitationId: string;
  invitationTokenHash: string;
}) {
  return digestCanonical({
    version: "staff-invite-recipient-identity-v1",
    ...input,
  });
}

function idempotencyKey(input: {
  batchId: string;
  recipientId: string;
  invitationId: string;
  emailNormalized: string;
}) {
  return `staff-review-invite:${digestCanonical({ version: 1, ...input })}`;
}

function batchDigest(input: {
  partnerId: string;
  provider: string;
  providerCredentialFingerprint: string;
  fromAddress: string;
  replyToAddress: string | null;
  rendererVersion: string;
  rosterDigest: string;
  recipients: Array<{
    ordinal: number;
    employeeId: string;
    emailNormalized: string;
    invitationId: string;
    invitationTokenHash: string;
    invitationExpiresAt: Date;
    linkDigest: string;
    subjectDigest: string;
    htmlDigest: string;
    textDigest: string;
  }>;
}) {
  return digestCanonical({
    version: "staff-invite-batch-v1",
    partnerId: input.partnerId,
    provider: input.provider,
    providerCredentialFingerprint: input.providerCredentialFingerprint,
    fromAddress: input.fromAddress,
    replyToAddress: input.replyToAddress,
    rendererVersion: input.rendererVersion,
    rosterDigest: input.rosterDigest,
    recipients: input.recipients.map((recipient) => ({
      ...recipient,
      invitationExpiresAt: iso(recipient.invitationExpiresAt),
    })),
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "email";
  return `${local.slice(0, 1)}***@${domain}`;
}

function evidence(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

async function loadDirectRoster(tx: Tx, partnerId: string) {
  const employees = await tx.mycoEmployee.findMany({
    where: directStaffReviewerWhere(partnerId),
    select: {
      id: true,
      partnerId: true,
      name: true,
      email: true,
      active: true,
      optedOut: true,
    },
  });
  return resolveDirectStaffReviewRoster(partnerId, employees);
}

export async function prepareStaffReviewInviteBatch(input: PrepareStaffInviteBatchInput) {
  const now = input.now ?? new Date();
  const expiresInDays = Number.isFinite(input.expiresInDays)
    ? Math.max(1, Math.min(90, Math.round(input.expiresInDays!)))
    : 21;
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
  const provider = STAFF_INVITE_BATCH_PROVIDER;
  const fromAddress = input.fromAddress ?? DEFAULT_EMAIL_FROM_ADDRESS;
  const replyToAddress = input.replyToAddress ?? DEFAULT_EMAIL_REPLY_TO_ADDRESS;
  const currentProviderFingerprint = providerCredentialFingerprint(provider);
  const currentSealFingerprint = sealKeyFingerprint();

  const messagesByEmail = new Map(
    input.messages.map((message) => [normalizeEmployeeEmail(message.email), message])
  );
  const expectedEmails = tmtDirectStaffReviewerEmails();
  if (messagesByEmail.size !== expectedEmails.length) {
    throw new Error(`Expected exactly ${expectedEmails.length} staff invite messages`);
  }
  for (const email of expectedEmails) {
    if (!messagesByEmail.has(email)) throw new Error(`Missing staff invite message for ${email}`);
  }

  return prisma.$transaction(async (tx) => {
    const partner = await tx.partner.findUnique({
      where: { id: input.partnerId },
      select: { id: true, name: true },
    });
    if (!partner) throw new Error("Partner not found");

    const { reviewers, rosterDigest } = await loadDirectRoster(tx, partner.id);
    const batchId = crypto.randomUUID();
    const preparedRecipients: Array<{
      reviewer: ResolvedDirectStaffReviewer;
      invitation: { id: string; tokenHash: string; issuedAt: Date; expiresAt: Date; status: string; revokedAt: Date | null };
      rawToken: string;
      inviteUrl: string;
      subject: string;
      html: string;
      text: string;
      linkDigest: string;
      subjectDigest: string;
      htmlDigest: string;
      textDigest: string;
      recipientIdentityDigest: string;
    }> = [];

    for (const reviewer of reviewers) {
      const rawToken = createStaffReviewInvitationToken();
      const tokenHash = hashStaffReviewInvitationToken(rawToken);
      const pendingInvitations = await tx.staffReviewInvitation.findMany({
        where: {
          partnerId: partner.id,
          employeeId: reviewer.employeeId,
          status: "pending",
          revokedAt: null,
        },
        select: { id: true },
      });
      await tx.staffReviewInvitation.updateMany({
        where: {
          partnerId: partner.id,
          employeeId: reviewer.employeeId,
          status: "pending",
          revokedAt: null,
        },
        data: {
          status: "revoked",
          revokedAt: now,
          revokedBy: input.renderedBy,
          revocationReason: "reissued by staff invite batch render",
        },
      });
      await invalidateApprovedStaffInviteRecipientsForInvitations({
        tx,
        invitationIds: pendingInvitations.map((invitation) => invitation.id),
        code: "revoked",
        reason: "invitation reissued by staff invite batch render",
      });
      const invitation = await tx.staffReviewInvitation.create({
        data: {
          partnerId: partner.id,
          employeeId: reviewer.employeeId,
          emailNormalized: reviewer.emailNormalized,
          tokenHash,
          status: "pending",
          issuedBy: input.renderedBy,
          issuedAt: now,
          expiresAt,
        },
        select: {
          id: true,
          tokenHash: true,
          issuedAt: true,
          expiresAt: true,
          status: true,
          revokedAt: true,
        },
      });
      const url = inviteUrl(rawToken, input.requestOrigin);
      const message = messagesByEmail.get(reviewer.emailNormalized)!;
      const subject = message.subject;
      const html = replaceInviteUrlPlaceholder(message.html, url);
      const text = replaceInviteUrlPlaceholder(message.text, url);
      preparedRecipients.push({
        reviewer,
        invitation,
        rawToken,
        inviteUrl: url,
        subject,
        html,
        text,
        linkDigest: digestText(url),
        subjectDigest: digestText(subject),
        htmlDigest: digestText(html),
        textDigest: digestText(text),
        recipientIdentityDigest: recipientIdentityDigest({
          partnerId: partner.id,
          employeeId: reviewer.employeeId,
          displayName: reviewer.displayName,
          emailNormalized: reviewer.emailNormalized,
          invitationId: invitation.id,
          invitationTokenHash: invitation.tokenHash,
        }),
      });
    }

    const digest = batchDigest({
      partnerId: partner.id,
      provider,
      providerCredentialFingerprint: currentProviderFingerprint,
      fromAddress,
      replyToAddress,
      rendererVersion: STAFF_INVITE_BATCH_RENDERER_VERSION,
      rosterDigest,
      recipients: preparedRecipients.map((recipient) => ({
        ordinal: recipient.reviewer.ordinal,
        employeeId: recipient.reviewer.employeeId,
        emailNormalized: recipient.reviewer.emailNormalized,
        invitationId: recipient.invitation.id,
        invitationTokenHash: recipient.invitation.tokenHash,
        invitationExpiresAt: recipient.invitation.expiresAt,
        linkDigest: recipient.linkDigest,
        subjectDigest: recipient.subjectDigest,
        htmlDigest: recipient.htmlDigest,
        textDigest: recipient.textDigest,
      })),
    });

    await tx.staffReviewInviteBatch.create({
      data: {
        id: batchId,
        partnerId: partner.id,
        status: "draft",
        renderedBy: input.renderedBy,
        renderedAt: now,
        sourceIssueId: input.sourceIssueId,
        sourceCommentId: input.sourceCommentId,
        sourceCardId: input.sourceCardId,
        provider,
        providerCredentialFingerprint: currentProviderFingerprint,
        fromAddress,
        replyToAddress,
        rendererVersion: STAFF_INVITE_BATCH_RENDERER_VERSION,
        rosterDigest,
        batchDigest: digest,
        sealKeyFingerprint: currentSealFingerprint,
      },
    });

    const recipients = [];
    for (const prepared of preparedRecipients) {
      const recipientId = crypto.randomUUID();
      const sealed = sealStaffInvitePayload({
        version: "staff-review-invite-payload-v1",
        batchId,
        recipientId,
        invitationId: prepared.invitation.id,
        employeeId: prepared.reviewer.employeeId,
        partnerId: partner.id,
        displayName: prepared.reviewer.displayName,
        emailNormalized: prepared.reviewer.emailNormalized,
        tokenHash: prepared.invitation.tokenHash,
        inviteUrl: prepared.inviteUrl,
        subject: prepared.subject,
        html: prepared.html,
        text: prepared.text,
        fromAddress,
        replyToAddress,
        provider,
        rendererVersion: STAFF_INVITE_BATCH_RENDERER_VERSION,
        expiresAt: iso(prepared.invitation.expiresAt),
      });
      const providerIdempotencyKey = idempotencyKey({
        batchId,
        recipientId,
        invitationId: prepared.invitation.id,
        emailNormalized: prepared.reviewer.emailNormalized,
      });
      const row = await tx.staffReviewInviteBatchRecipient.create({
        data: {
          id: recipientId,
          batchId,
          ordinal: prepared.reviewer.ordinal,
          invitationId: prepared.invitation.id,
          employeeId: prepared.reviewer.employeeId,
          displayName: prepared.reviewer.displayName,
          emailNormalized: prepared.reviewer.emailNormalized,
          invitationTokenHash: prepared.invitation.tokenHash,
          invitationStatusAtApproval: prepared.invitation.status,
          invitationIssuedAt: prepared.invitation.issuedAt,
          invitationExpiresAt: prepared.invitation.expiresAt,
          invitationRevokedAt: prepared.invitation.revokedAt,
          partnerScopeId: partner.id,
          recipientIdentityDigest: prepared.recipientIdentityDigest,
          linkDigest: prepared.linkDigest,
          subjectDigest: prepared.subjectDigest,
          htmlDigest: prepared.htmlDigest,
          textDigest: prepared.textDigest,
          providerIdempotencyKey,
          ...sealed,
        },
        select: {
          id: true,
          ordinal: true,
          invitationId: true,
          employeeId: true,
          displayName: true,
          emailNormalized: true,
          invitationExpiresAt: true,
        },
      });
      recipients.push({ ...row, emailMasked: maskEmail(row.emailNormalized) });
    }

    return {
      id: batchId,
      status: "draft" as const,
      partner,
      batchDigest: digest,
      rosterDigest,
      provider,
      providerCredentialFingerprint: currentProviderFingerprint,
      fromAddress,
      replyToAddress,
      rendererVersion: STAFF_INVITE_BATCH_RENDERER_VERSION,
      sourceIssueId: input.sourceIssueId ?? null,
      sourceCommentId: input.sourceCommentId ?? null,
      sourceCardId: input.sourceCardId ?? null,
      recipients,
    };
  });
}

export async function approveStaffReviewInviteBatch(input: ApproveStaffInviteBatchInput) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const batch = await tx.staffReviewInviteBatch.findUnique({
      where: { id: input.batchId },
      include: { recipients: true },
    });
    if (!batch) throw new Error("Staff invite batch not found");
    if (batch.status !== "draft") throw new Error("Staff invite batch is not draft");
    const { rosterDigest } = await loadDirectRoster(tx, batch.partnerId);
    if (rosterDigest !== batch.rosterDigest) {
      throw new Error("Staff invite roster changed; new approval batch required");
    }
    const currentProviderFingerprint = providerCredentialFingerprint(batch.provider);
    if (currentProviderFingerprint !== batch.providerCredentialFingerprint) {
      throw new Error("Provider credential changed; new approval batch required");
    }
    if (sealKeyFingerprint() !== batch.sealKeyFingerprint) {
      throw new Error("Sealing key changed; new approval batch required");
    }

    return tx.staffReviewInviteBatch.update({
      where: { id: batch.id },
      data: {
        status: "approved",
        approvedInteractionId: input.approvedInteractionId,
        approvedBy: input.approvedBy,
        approvedAt: now,
        sourceIssueId: input.sourceIssueId ?? batch.sourceIssueId,
        sourceCommentId: input.sourceCommentId ?? batch.sourceCommentId,
        sourceCardId: input.sourceCardId ?? batch.sourceCardId,
      },
      select: {
        id: true,
        status: true,
        approvedInteractionId: true,
        approvedBy: true,
        approvedAt: true,
        batchDigest: true,
      },
    });
  });
}

async function recordValidationFailure(
  tx: Tx,
  input: {
    batchId: string;
    recipientId?: string;
    code: StaffInviteValidationFailureCode;
    evidence: Record<string, unknown>;
  }
) {
  if (input.recipientId) {
    await tx.staffReviewInviteBatchRecipient.update({
      where: { id: input.recipientId },
      data: {
        sendStatus: "validation_failed",
        validationFailureCode: input.code,
        validationFailureEvidence: input.evidence as Prisma.InputJsonValue,
        lastValidatedAt: new Date(),
      },
    });
  }
  await tx.staffReviewInviteBatch.update({
    where: { id: input.batchId },
    data: { status: "validation_failed" },
  });
}

function failValidation(
  code: StaffInviteValidationFailureCode,
  details: Record<string, unknown> = {}
) {
  return { ok: false as const, code, evidence: evidence(details) };
}

async function validateRecipientForSend(
  tx: Tx,
  input: {
    batch: BatchRecord;
    recipient: RecipientRecord;
    approvedInteractionId: string;
    now: Date;
  }
): Promise<
  | { ok: true; payload: SealedStaffInvitePayload }
  | { ok: false; code: StaffInviteValidationFailureCode; evidence: Record<string, unknown> }
> {
  const { batch, recipient, approvedInteractionId, now } = input;
  if (!["approved", "sending", "partially_sent"].includes(batch.status)) {
    return failValidation("batch_not_approved", { batchStatus: batch.status });
  }
  if (batch.approvedInteractionId !== approvedInteractionId) {
    return failValidation("approval_evidence_mismatch", {
      suppliedInteractionId: approvedInteractionId,
    });
  }
  if (recipient.providerMessageId || recipient.sentAt || recipient.sendStatus === "sent") {
    return failValidation("duplicate_send", {
      recipientId: recipient.id,
      hasProviderMessageId: Boolean(recipient.providerMessageId),
    });
  }
  if (providerCredentialFingerprint(batch.provider) !== batch.providerCredentialFingerprint) {
    return failValidation("provider_credential_mismatch", { provider: batch.provider });
  }
  if (sealKeyFingerprint() !== batch.sealKeyFingerprint) {
    return failValidation("payload_unseal_failed", { reason: "seal_key_fingerprint_mismatch" });
  }

  let payload: SealedStaffInvitePayload;
  try {
    payload = unsealStaffInvitePayload(recipient);
  } catch {
    return failValidation("payload_unseal_failed", { recipientId: recipient.id });
  }

  if (
    payload.batchId !== batch.id ||
    payload.recipientId !== recipient.id ||
    payload.invitationId !== recipient.invitationId ||
    payload.employeeId !== recipient.employeeId ||
    payload.emailNormalized !== recipient.emailNormalized ||
    payload.provider !== batch.provider ||
    payload.rendererVersion !== batch.rendererVersion
  ) {
    return failValidation("body_digest_mismatch", { recipientId: recipient.id });
  }
  if (payload.fromAddress !== batch.fromAddress || payload.replyToAddress !== batch.replyToAddress) {
    return failValidation("sender_mismatch", { recipientId: recipient.id });
  }
  if (digestText(payload.inviteUrl) !== recipient.linkDigest) {
    return failValidation("link_digest_mismatch", { recipientId: recipient.id });
  }
  if (digestText(payload.subject) !== recipient.subjectDigest) {
    return failValidation("subject_digest_mismatch", { recipientId: recipient.id });
  }
  if (digestText(payload.html) !== recipient.htmlDigest || digestText(payload.text) !== recipient.textDigest) {
    return failValidation("body_digest_mismatch", { recipientId: recipient.id });
  }
  const token = inviteTokenFromUrl(payload.inviteUrl);
  if (!token) return failValidation("link_digest_mismatch", { recipientId: recipient.id });
  const tokenHash = hashStaffReviewInvitationToken(token);
  if (tokenHash !== recipient.invitationTokenHash || tokenHash !== payload.tokenHash) {
    return failValidation("replaced_token", { recipientId: recipient.id });
  }

  const invitation = await tx.staffReviewInvitation.findUnique({
    where: { id: recipient.invitationId },
    include: {
      employee: {
        select: {
          id: true,
          partnerId: true,
          name: true,
          email: true,
          active: true,
          optedOut: true,
        },
      },
    },
  }) as LiveInvitation | null;
  if (!invitation) return failValidation("missing_invitation", { invitationId: recipient.invitationId });
  if (invitation.revokedAt || invitation.status === "revoked") {
    return failValidation("revoked", { invitationId: invitation.id });
  }
  if (invitation.expiresAt.getTime() <= now.getTime()) {
    return failValidation("expired", { invitationId: invitation.id });
  }
  if (invitation.status !== "pending") {
    return failValidation("invitation_status_mismatch", {
      invitationId: invitation.id,
      liveStatus: invitation.status,
    });
  }
  if (invitation.tokenHash !== recipient.invitationTokenHash || invitation.tokenHash !== tokenHash) {
    return failValidation("replaced_token", { invitationId: invitation.id });
  }
  if (
    invitation.partnerId !== batch.partnerId ||
    invitation.partnerId !== recipient.partnerScopeId ||
    invitation.employee.partnerId !== batch.partnerId
  ) {
    return failValidation("partner_scope_mismatch", { invitationId: invitation.id });
  }
  if (invitation.employeeId !== recipient.employeeId || invitation.employee.id !== recipient.employeeId) {
    return failValidation("employee_mismatch", { invitationId: invitation.id });
  }
  if (normalizeEmployeeEmail(invitation.emailNormalized) !== recipient.emailNormalized) {
    return failValidation("recipient_email_mismatch", { invitationId: invitation.id });
  }
  if (normalizeEmployeeEmail(invitation.employee.email) !== recipient.emailNormalized) {
    return failValidation("recipient_email_mismatch", { employeeId: invitation.employee.id });
  }
  if (invitation.employee.name !== recipient.displayName) {
    return failValidation("employee_mismatch", { employeeId: invitation.employee.id });
  }
  if (!invitation.employee.active) return failValidation("employee_inactive", { employeeId: invitation.employee.id });
  if (invitation.employee.optedOut) return failValidation("employee_opted_out", { employeeId: invitation.employee.id });

  const { rosterDigest } = await loadDirectRoster(tx, batch.partnerId);
  if (rosterDigest !== batch.rosterDigest) {
    return failValidation("roster_mismatch", { batchId: batch.id });
  }
  return { ok: true, payload };
}

async function aggregateBatchStatus(tx: Tx, batchId: string): Promise<StaffInviteBatchStatus> {
  const recipients = await tx.staffReviewInviteBatchRecipient.findMany({
    where: { batchId },
    select: { sendStatus: true },
  });
  if (recipients.some((recipient) => recipient.sendStatus === "validation_failed")) {
    return "validation_failed";
  }
  if (recipients.length > 0 && recipients.every((recipient) => recipient.sendStatus === "sent")) {
    return "sent";
  }
  if (recipients.some((recipient) => recipient.sendStatus === "sent")) {
    return "partially_sent";
  }
  return "approved";
}

export async function sendApprovedStaffReviewInviteBatch(input: {
  batchId: string;
  approvedInteractionId: string;
  now?: Date;
  claimId?: string;
  send?: typeof sendEmail;
}): Promise<SendStaffInviteBatchResult> {
  const now = input.now ?? new Date();
  const claimId = input.claimId ?? crypto.randomUUID();
  const send = input.send ?? sendEmail;
  const sent: SendStaffInviteBatchResult["sent"] = [];
  const skipped: SendStaffInviteBatchResult["skipped"] = [];
  const failed: SendStaffInviteBatchResult["failed"] = [];

  const batch = await prisma.staffReviewInviteBatch.findUnique({
    where: { id: input.batchId },
    select: {
      id: true,
      partnerId: true,
      status: true,
      approvedInteractionId: true,
      provider: true,
      providerCredentialFingerprint: true,
      fromAddress: true,
      replyToAddress: true,
      rendererVersion: true,
      rosterDigest: true,
      batchDigest: true,
      sealKeyFingerprint: true,
    },
  }) as BatchRecord | null;
  if (!batch) throw new Error("Staff invite batch not found");

  const recipients = await prisma.staffReviewInviteBatchRecipient.findMany({
    where: { batchId: batch.id },
    orderBy: { ordinal: "asc" },
  }) as RecipientRecord[];

  for (const recipient of recipients) {
    if (recipient.providerMessageId || recipient.sentAt || recipient.sendStatus === "sent") {
      skipped.push({ recipientId: recipient.id, reason: "already_sent" });
      continue;
    }
    if (recipient.sendStatus === "validation_failed" && recipient.validationFailureCode) {
      failed.push({
        recipientId: recipient.id,
        code: recipient.validationFailureCode as StaffInviteValidationFailureCode,
        evidence: typeof recipient.validationFailureEvidence === "object" && recipient.validationFailureEvidence !== null
          ? recipient.validationFailureEvidence as Record<string, unknown>
          : undefined,
      });
      break;
    }

    const claimed = await prisma.staffReviewInviteBatchRecipient.updateMany({
      where: {
        id: recipient.id,
        providerMessageId: null,
        sentAt: null,
        sendStatus: { in: ["pending", "provider_failed"] },
      },
      data: {
        sendStatus: "claimed",
        claimId,
        claimedAt: now,
        sendAttemptCount: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      await prisma.$transaction((tx) =>
        recordValidationFailure(tx, {
          batchId: batch.id,
          recipientId: recipient.id,
          code: "claim_conflict",
          evidence: { recipientId: recipient.id },
        })
      );
      failed.push({ recipientId: recipient.id, code: "claim_conflict" });
      break;
    }

    const claimedRecipient = {
      ...recipient,
      sendStatus: "claimed",
      claimId,
      claimedAt: now,
      sendAttemptCount: recipient.sendAttemptCount + 1,
    };
    const validation = await prisma.$transaction((tx) =>
      validateRecipientForSend(tx, {
        batch,
        recipient: claimedRecipient,
        approvedInteractionId: input.approvedInteractionId,
        now,
      })
    );
    if (!validation.ok) {
      await prisma.$transaction((tx) =>
        recordValidationFailure(tx, {
          batchId: batch.id,
          recipientId: recipient.id,
          code: validation.code,
          evidence: validation.evidence,
        })
      );
      failed.push({ recipientId: recipient.id, code: validation.code, evidence: validation.evidence });
      break;
    }

    let result: SendEmailResult;
    try {
      result = await send({
        to: validation.payload.emailNormalized,
        from: validation.payload.fromAddress,
        replyTo: validation.payload.replyToAddress ?? undefined,
        subject: validation.payload.subject,
        html: validation.payload.html,
        text: validation.payload.text,
        idempotencyKey: recipient.providerIdempotencyKey,
      });
    } catch (error) {
      await prisma.staffReviewInviteBatchRecipient.update({
        where: { id: recipient.id },
        data: {
          sendStatus: "provider_failed",
          providerError: error instanceof Error ? error.message : "provider_failed",
        },
      });
      failed.push({ recipientId: recipient.id, code: "provider_failed" });
      break;
    }

    await prisma.staffReviewInviteBatchRecipient.update({
      where: { id: recipient.id },
      data: {
        sendStatus: "sent",
        providerMessageId: result.messageId,
        providerError: null,
        sentAt: new Date(),
        lastValidatedAt: now,
      },
    });
    sent.push({
      recipientId: recipient.id,
      emailMasked: maskEmail(recipient.emailNormalized),
      providerMessageId: result.messageId,
    });
  }

  const hasValidationFailure = failed.some((failure) => failure.code !== "provider_failed");
  const finalStatus = hasValidationFailure
    ? "validation_failed"
    : await prisma.$transaction((tx) => aggregateBatchStatus(tx, batch.id));
  await prisma.staffReviewInviteBatch.update({
    where: { id: batch.id },
    data: { status: finalStatus },
  });

  return { batchId: batch.id, status: finalStatus, sent, skipped, failed };
}

export async function invalidateApprovedStaffInviteRecipientsForInvitations(input: {
  tx: Tx;
  invitationIds: string[];
  code?: StaffInviteValidationFailureCode;
  reason: string;
}) {
  if (input.invitationIds.length === 0) return { count: 0 };
  return input.tx.staffReviewInviteBatchRecipient.updateMany({
    where: {
      invitationId: { in: input.invitationIds },
      sendStatus: { in: ["pending", "claimed", "provider_failed"] },
      batch: { status: { in: ["approved", "sending", "partially_sent"] } },
    },
    data: {
      sendStatus: "validation_failed",
      validationFailureCode: input.code ?? "revoked",
      validationFailureEvidence: {
        reason: input.reason,
        invalidatedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}
