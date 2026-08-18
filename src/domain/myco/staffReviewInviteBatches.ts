import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/domain/auth/adminSession";
import {
  buildRevokedTokenPatch,
  createCatalogAccessToken,
  hashCatalogAccessToken,
} from "@/domain/myco/catalogTokens";
import { lockStaffLinkMint } from "@/domain/myco/staffLinkMintLock";
import { staffReviewerWhere } from "@/domain/myco/staffReviewRoster";

export const STAFF_INVITE_APPROVAL_DIGEST_VERSION = "staff-invite-approval-v1";
export const STAFF_INVITE_FINAL_DIGEST_VERSION = "staff-invite-batch-v2";
export const STAFF_INVITE_DRAFT_SEAL_PURPOSE = "staff-review-invite-draft-recipient-v1";
export const STAFF_INVITE_FINAL_SEAL_PURPOSE = "staff-review-invite-final-recipient-v1";
export const STAFF_INVITE_RENDERER_VERSION = "staff-review-invite-renderer-v1";
export const DEFAULT_INVITE_EXPIRY_SECONDS = 21 * 24 * 60 * 60;
export const MIN_INVITE_EXPIRY_SECONDS = 24 * 60 * 60;
export const MAX_INVITE_EXPIRY_SECONDS = 90 * 24 * 60 * 60;

const INERT_INVITE_PLACEHOLDER = "[invite link minted after approval]";

export type StaffInviteErrorCode =
  | "unauthorized"
  | "forbidden"
  | "view_as_forbidden"
  | "invalid_request"
  | "partner_not_found"
  | "roster_empty"
  | "missing_invite_placeholder"
  | "invalid_ttl"
  | "batch_not_found"
  | "legacy_credentialed_draft"
  | "batch_not_draft"
  | "approval_digest_mismatch"
  | "source_evidence_mismatch"
  | "provider_fingerprint_mismatch"
  | "seal_key_fingerprint_mismatch"
  | "draft_material_invalid"
  | "invitation_not_found"
  | "invitation_not_pending";

export class StaffInviteError extends Error {
  constructor(
    public readonly code: StaffInviteErrorCode,
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "StaffInviteError";
  }
}

export type StaffInviteTemplateInput = {
  subject: string;
  html: string;
  text: string;
  cc?: string[];
};

export type StaffInviteSourceEvidence = {
  sourceIssueId: string;
  sourceCommentId: string;
  sourceCardId?: string | null;
};

export type PrepareStaffReviewInviteBatchInput = StaffInviteSourceEvidence & {
  partnerId: string;
  renderedBy: string;
  templates: StaffInviteTemplateInput;
  provider: string;
  providerCredentialFingerprint: string;
  fromAddress: string;
  replyToAddress?: string | null;
  requestedExpirySeconds?: number;
  rendererVersion?: string;
  sealKey?: string;
  sealKeyFingerprint?: string;
};

export type ApproveStaffReviewInviteBatchInput = {
  partnerId: string;
  batchId: string;
  approvedInteractionId: string;
  approvedBy: string;
  sourceEvidence?: StaffInviteSourceEvidence;
  providerCredentialFingerprint?: string;
  sealKey?: string;
  sealKeyFingerprint?: string;
  now?: Date;
};

export type RevokeStaffReviewInvitationInput = {
  session: AdminSession | null;
  partnerId: string;
  invitationId: string;
  reason: string;
  now?: Date;
};

export type StaffInviteMaskedRecipient = {
  ordinal: number;
  employeeId: string;
  displayName: string;
  emailMasked: string;
};

export type PreparedStaffReviewInviteBatch = {
  batchId: string;
  status: "draft";
  approvalDigest: string;
  approvalDigestVersion: typeof STAFF_INVITE_APPROVAL_DIGEST_VERSION;
  requestedExpirySeconds: number;
  recipients: StaffInviteMaskedRecipient[];
  previews: {
    subject: string;
    html: string;
    text: string;
  };
};

export type ApprovedStaffReviewInviteBatch = {
  batchId: string;
  status: "approved";
  approvalDigest: string;
  batchDigest: string;
  approvedInteractionId: string;
  approvedBy: string;
  approvedAt: Date;
  staffReviewInvitationCount: number;
  sharedCatalogAccessTokenCount: number;
  recipientEvidenceCount: number;
  invitationCount: number;
  revokedPriorInvitationCount: number;
  recipientCount: number;
};

export type RevokeStaffReviewInvitationResult = {
  invitationId: string;
  status: "revoked";
  alreadyRevoked: boolean;
  invalidatedRecipientCount: number;
};

type ReviewerRecord = {
  id: string;
  name: string;
  email: string;
};

type DraftRecipientRecord = {
  id: string;
  batchId: string;
  ordinal: number;
  employeeId: string;
  displayName: string;
  emailNormalized: string;
  partnerScopeId: string;
  draftRecipientDigest: string;
  ccDigest: string;
  subjectTemplateDigest: string;
  htmlTemplateDigest: string;
  textTemplateDigest: string;
  sealedDraftCiphertext: string;
  sealedDraftIv: string;
  sealedDraftAuthTag: string;
};

type BatchRecord = {
  id: string;
  partnerId: string;
  status: string;
  renderedBy: string;
  renderedAt: Date;
  sourceIssueId: string | null;
  sourceCommentId: string | null;
  sourceCardId: string | null;
  approvedInteractionId: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  provider: string;
  providerCredentialFingerprint: string;
  fromAddress: string;
  replyToAddress: string | null;
  rendererVersion: string;
  rosterDigest: string;
  approvalDigest: string | null;
  approvalDigestVersion: string | null;
  requestedExpirySeconds: number;
  batchDigest: string | null;
  sealKeyFingerprint: string;
  draftRecipients?: DraftRecipientRecord[];
};

type InvitationRecord = {
  id: string;
  partnerId: string;
  employeeId: string;
  displayName: string;
  emailNormalized: string;
  status: string;
  issuedBy: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  revocationReason: string | null;
};

type FinalRecipientRecord = {
  id: string;
  batchId: string;
  ordinal: number;
  invitationId: string | null;
  catalogAccessTokenId: string | null;
  employeeId: string;
  displayName: string;
  emailNormalized: string;
  draftRecipientDigest: string;
  recipientIdentityDigest: string;
  ccDigest: string;
  subjectDigest: string;
  htmlDigest: string;
  textDigest: string;
  linkDigest: string;
  providerIdempotencyKey: string;
};

export type StaffInviteDb = {
  partner: {
    findUnique(args: unknown): Promise<{ id: string } | null>;
  };
  mycoEmployee: {
    findMany(args: unknown): Promise<ReviewerRecord[]>;
  };
  staffReviewInviteBatch: {
    create(args: unknown): Promise<BatchRecord>;
    findFirst(args: unknown): Promise<BatchRecord | null>;
    update(args: unknown): Promise<BatchRecord>;
  };
  staffReviewInviteBatchDraftRecipient: {
    findMany(args: unknown): Promise<DraftRecipientRecord[]>;
  };
  staffReviewInviteBatchRecipient: {
    create(args: unknown): Promise<FinalRecipientRecord>;
    findMany(args: unknown): Promise<FinalRecipientRecord[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  staffReviewInvitation: {
    findMany(args: unknown): Promise<InvitationRecord[]>;
    findFirst(args: unknown): Promise<InvitationRecord | null>;
    create(args: unknown): Promise<InvitationRecord>;
    update(args: unknown): Promise<InvitationRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  catalogAccessToken: {
    updateMany(args: unknown): Promise<{ count: number }>;
    create(args: unknown): Promise<{
      id: string;
      tokenHash: string;
      issuedAt: Date;
      expiresAt: Date | null;
    }>;
  };
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $transaction<T>(fn: (tx: StaffInviteDb) => Promise<T>): Promise<T>;
};

type SealedPayload = {
  sealedCiphertext: string;
  sealedIv: string;
  sealedAuthTag: string;
};

type DraftPlaintext = {
  batchId: string;
  draftRecipientId: string;
  ordinal: number;
  partnerId: string;
  employeeId: string;
  displayName: string;
  emailNormalized: string;
  normalizedCc: string[];
  subject: string;
  htmlTemplate: string;
  textTemplate: string;
  fromAddress: string;
  replyToAddress: string | null;
  provider: string;
  rendererVersion: string;
  requestedExpirySeconds: number;
};

type FinalRecipientEvidence = FinalRecipientRecord & {
  credentialId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  providerIdempotencyKey: string;
};

function db(client: StaffInviteDb = prisma as unknown as StaffInviteDb): StaffInviteDb {
  return client;
}

function hashHex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

function digestJson(version: string, value: unknown): string {
  return hashHex(`${version}:${canonicalize(value)}`);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeCc(cc: string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const item of cc ?? []) {
    const normalized = normalizeEmail(item);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      throw new StaffInviteError("invalid_request", `Invalid Cc address: ${item}`);
    }
    if (seen.has(normalized)) {
      throw new StaffInviteError("invalid_request", `Duplicate Cc address: ${item}`);
    }
    seen.add(normalized);
  }
  return [...seen].sort();
}

function requirePlaceholder(template: string, label: string): void {
  if (!template.includes("{{INVITE_URL}}")) {
    throw new StaffInviteError("missing_invite_placeholder", `${label} must include {{INVITE_URL}}`);
  }
}

function requireText(value: string | null | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new StaffInviteError("invalid_request", `${label} is required`);
  return trimmed;
}

function expirySeconds(value: number | undefined): number {
  const seconds = value ?? DEFAULT_INVITE_EXPIRY_SECONDS;
  if (!Number.isInteger(seconds) || seconds < MIN_INVITE_EXPIRY_SECONDS || seconds > MAX_INVITE_EXPIRY_SECONDS) {
    throw new StaffInviteError("invalid_ttl", "requestedExpirySeconds must be between 1 and 90 days");
  }
  return seconds;
}

function base64(input: Buffer): string {
  return input.toString("base64");
}

function resolveSealKey(input?: string): Buffer {
  const raw = input ?? process.env.STAFF_REVIEW_INVITE_SEAL_KEY;
  if (!raw) {
    throw new StaffInviteError("invalid_request", "STAFF_REVIEW_INVITE_SEAL_KEY is required");
  }
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  if (Buffer.byteLength(raw, "utf8") >= 32) return crypto.createHash("sha256").update(raw).digest();
  throw new StaffInviteError("invalid_request", "Staff invite seal key must be at least 32 bytes");
}

function sealKeyFingerprint(key: Buffer): string {
  return hashHex(`staff-invite-seal-key:${base64(key)}`);
}

function sealJson({
  key,
  purpose,
  payload,
  aad,
}: {
  key: Buffer;
  purpose: string;
  payload: unknown;
  aad: unknown;
}): SealedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(canonicalize({ purpose, aad }), "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(canonicalize(payload), "utf8")),
    cipher.final(),
  ]);
  return {
    sealedCiphertext: base64(ciphertext),
    sealedIv: base64(iv),
    sealedAuthTag: base64(cipher.getAuthTag()),
  };
}

function decryptJson<T>({
  key,
  purpose,
  record,
  aad,
}: {
  key: Buffer;
  purpose: string;
  record: Pick<DraftRecipientRecord, "sealedDraftCiphertext" | "sealedDraftIv" | "sealedDraftAuthTag">;
  aad: unknown;
}): T {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(record.sealedDraftIv, "base64")
  );
  decipher.setAAD(Buffer.from(canonicalize({ purpose, aad }), "utf8"));
  decipher.setAuthTag(Buffer.from(record.sealedDraftAuthTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.sealedDraftCiphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(3, name.length - visible.length))}@${domain}`;
}

function staffLinkUrl(token: string): string {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base}/staff/catalog/${token}`;
}

function providerIdempotencyKey(batchId: string, credentialId: string, approvalDigest: string): string {
  return digestJson("staff-invite-provider-idempotency-v1", { batchId, credentialId, approvalDigest });
}

function recipientIdentityDigest(input: {
  partnerId: string;
  employeeId: string;
  displayName: string;
  emailNormalized: string;
}): string {
  return digestJson("staff-invite-recipient-identity-v1", input);
}

function buildRosterDigest(partnerId: string, reviewers: ReviewerRecord[]): string {
  return digestJson("staff-invite-roster-v1", {
    partnerId,
    recipients: reviewers.map((reviewer, index) => ({
      ordinal: index,
      employeeId: reviewer.id,
      displayName: reviewer.name,
      emailNormalized: normalizeEmail(reviewer.email),
    })),
  });
}

function preview(template: string): string {
  return template.split("{{INVITE_URL}}").join(INERT_INVITE_PLACEHOLDER);
}

async function approvedMetadata(
  client: StaffInviteDb,
  batch: BatchRecord
): Promise<ApprovedStaffReviewInviteBatch> {
  const recipients = await client.staffReviewInviteBatchRecipient.findMany({
    where: { batchId: batch.id },
    orderBy: { ordinal: "asc" },
    select: { id: true, invitationId: true, catalogAccessTokenId: true },
  });
  const revokedPrior = await client.staffReviewInvitation.findMany({
    where: {
      partnerId: batch.partnerId,
      status: "revoked",
      revocationReason: `superseded by approved staff invite batch ${batch.id}`,
    },
    select: { id: true },
  });
  if (!batch.approvalDigest || !batch.batchDigest || !batch.approvedInteractionId || !batch.approvedBy || !batch.approvedAt) {
    throw new StaffInviteError("draft_material_invalid", "Approved batch metadata is incomplete", 500);
  }
  const sharedCatalogAccessTokenIds = new Set(
    recipients
      .map((recipient) => recipient.catalogAccessTokenId)
      .filter((tokenId): tokenId is string => typeof tokenId === "string" && tokenId.length > 0)
  );
  const staffReviewInvitationCount = recipients.filter((recipient) => recipient.invitationId).length;
  return {
    batchId: batch.id,
    status: "approved",
    approvalDigest: batch.approvalDigest,
    batchDigest: batch.batchDigest,
    approvedInteractionId: batch.approvedInteractionId,
    approvedBy: batch.approvedBy,
    approvedAt: batch.approvedAt,
    staffReviewInvitationCount,
    sharedCatalogAccessTokenCount: sharedCatalogAccessTokenIds.size,
    recipientEvidenceCount: recipients.length,
    invitationCount: staffReviewInvitationCount,
    recipientCount: recipients.length,
    revokedPriorInvitationCount: revokedPrior.length,
  };
}

export async function prepareStaffReviewInviteBatch(
  input: PrepareStaffReviewInviteBatchInput,
  client = db()
): Promise<PreparedStaffReviewInviteBatch> {
  const partnerId = requireText(input.partnerId, "partnerId");
  const renderedBy = requireText(input.renderedBy, "renderedBy");
  const sourceIssueId = requireText(input.sourceIssueId, "sourceIssueId");
  const sourceCommentId = requireText(input.sourceCommentId, "sourceCommentId");
  const provider = requireText(input.provider, "provider");
  const providerCredentialFingerprint = requireText(
    input.providerCredentialFingerprint,
    "providerCredentialFingerprint"
  );
  const fromAddress = requireText(input.fromAddress, "fromAddress");
  const rendererVersion = input.rendererVersion ?? STAFF_INVITE_RENDERER_VERSION;
  const requestedExpirySeconds = expirySeconds(input.requestedExpirySeconds);
  const normalizedCc = normalizeCc(input.templates.cc);

  requirePlaceholder(input.templates.subject, "subject");
  requirePlaceholder(input.templates.html, "html");
  requirePlaceholder(input.templates.text, "text");

  const sealKey = resolveSealKey(input.sealKey);
  const expectedSealKeyFingerprint = sealKeyFingerprint(sealKey);
  if (input.sealKeyFingerprint && input.sealKeyFingerprint !== expectedSealKeyFingerprint) {
    throw new StaffInviteError("seal_key_fingerprint_mismatch", "Seal key fingerprint does not match");
  }

  const partner = await client.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
  if (!partner) throw new StaffInviteError("partner_not_found", "Partner not found", 404);

  const reviewers = await client.mycoEmployee.findMany({
    where: staffReviewerWhere(partner.id),
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  if (reviewers.length === 0) throw new StaffInviteError("roster_empty", "No active reviewers for this partner", 404);

  const batchId = crypto.randomUUID();
  const renderedAt = new Date();
  const rosterDigest = buildRosterDigest(partner.id, reviewers);

  const draftRecipients = reviewers.map((reviewer, index) => {
    const draftRecipientId = crypto.randomUUID();
    const emailNormalized = normalizeEmail(reviewer.email);
    const subjectTemplateDigest = digestJson("staff-invite-template-subject-v1", input.templates.subject);
    const htmlTemplateDigest = digestJson("staff-invite-template-html-v1", input.templates.html);
    const textTemplateDigest = digestJson("staff-invite-template-text-v1", input.templates.text);
    const ccDigest = digestJson("staff-invite-cc-v1", normalizedCc);
    const draftRecipientDigest = digestJson("staff-invite-draft-recipient-v1", {
      batchId,
      draftRecipientId,
      ordinal: index,
      partnerId: partner.id,
      employeeId: reviewer.id,
      displayName: reviewer.name,
      emailNormalized,
      partnerScopeId: partner.id,
      ccDigest,
      subjectTemplateDigest,
      htmlTemplateDigest,
      textTemplateDigest,
    });
    const plaintext: DraftPlaintext = {
      batchId,
      draftRecipientId,
      ordinal: index,
      partnerId: partner.id,
      employeeId: reviewer.id,
      displayName: reviewer.name,
      emailNormalized,
      normalizedCc,
      subject: input.templates.subject,
      htmlTemplate: input.templates.html,
      textTemplate: input.templates.text,
      fromAddress,
      replyToAddress: input.replyToAddress ?? null,
      provider,
      rendererVersion,
      requestedExpirySeconds,
    };
    const sealed = sealJson({
      key: sealKey,
      purpose: STAFF_INVITE_DRAFT_SEAL_PURPOSE,
      payload: plaintext,
      aad: { batchId, draftRecipientId, draftRecipientDigest },
    });
    return {
      id: draftRecipientId,
      ordinal: index,
      employeeId: reviewer.id,
      displayName: reviewer.name,
      emailNormalized,
      partnerScopeId: partner.id,
      draftRecipientDigest,
      ccDigest,
      subjectTemplateDigest,
      htmlTemplateDigest,
      textTemplateDigest,
      sealedDraftCiphertext: sealed.sealedCiphertext,
      sealedDraftIv: sealed.sealedIv,
      sealedDraftAuthTag: sealed.sealedAuthTag,
    };
  });

  const approvalDigest = digestJson(STAFF_INVITE_APPROVAL_DIGEST_VERSION, {
    batchId,
    partnerId: partner.id,
    renderedBy,
    renderedAt,
    sourceIssueId,
    sourceCommentId,
    sourceCardId: input.sourceCardId ?? null,
    provider,
    providerCredentialFingerprint,
    fromAddress,
    replyToAddress: input.replyToAddress ?? null,
    rendererVersion,
    rosterDigest,
    sealKeyFingerprint: expectedSealKeyFingerprint,
    requestedExpirySeconds,
    recipients: draftRecipients.map((recipient) => ({
      ordinal: recipient.ordinal,
      employeeId: recipient.employeeId,
      displayName: recipient.displayName,
      emailNormalized: recipient.emailNormalized,
      partnerScopeId: recipient.partnerScopeId,
      draftRecipientDigest: recipient.draftRecipientDigest,
      ccDigest: recipient.ccDigest,
      subjectTemplateDigest: recipient.subjectTemplateDigest,
      htmlTemplateDigest: recipient.htmlTemplateDigest,
      textTemplateDigest: recipient.textTemplateDigest,
    })),
  });

  await client.staffReviewInviteBatch.create({
    data: {
      id: batchId,
      partnerId: partner.id,
      status: "draft",
      renderedBy,
      renderedAt,
      sourceIssueId,
      sourceCommentId,
      sourceCardId: input.sourceCardId ?? null,
      provider,
      providerCredentialFingerprint,
      fromAddress,
      replyToAddress: input.replyToAddress ?? null,
      rendererVersion,
      rosterDigest,
      approvalDigest,
      approvalDigestVersion: STAFF_INVITE_APPROVAL_DIGEST_VERSION,
      requestedExpirySeconds,
      batchDigest: null,
      sealKeyFingerprint: expectedSealKeyFingerprint,
      draftRecipients: {
        create: draftRecipients,
      },
    },
  });

  return {
    batchId,
    status: "draft",
    approvalDigest,
    approvalDigestVersion: STAFF_INVITE_APPROVAL_DIGEST_VERSION,
    requestedExpirySeconds,
    recipients: draftRecipients.map((recipient) => ({
      ordinal: recipient.ordinal,
      employeeId: recipient.employeeId,
      displayName: recipient.displayName,
      emailMasked: maskEmail(recipient.emailNormalized),
    })),
    previews: {
      subject: preview(input.templates.subject),
      html: preview(input.templates.html),
      text: preview(input.templates.text),
    },
  };
}

export async function approveStaffReviewInviteBatch(
  input: ApproveStaffReviewInviteBatchInput,
  client = db()
): Promise<ApprovedStaffReviewInviteBatch> {
  const partnerId = requireText(input.partnerId, "partnerId");
  const batchId = requireText(input.batchId, "batchId");
  const approvedInteractionId = requireText(input.approvedInteractionId, "approvedInteractionId");
  const approvedBy = requireText(input.approvedBy, "approvedBy");
  const approvedAt = input.now ?? new Date();
  const sealKey = resolveSealKey(input.sealKey);
  const expectedSealKeyFingerprint = input.sealKeyFingerprint ?? sealKeyFingerprint(sealKey);

  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT "id" FROM "StaffReviewInviteBatch" WHERE "id" = $1 FOR UPDATE', batchId);

    const batch = await tx.staffReviewInviteBatch.findFirst({
      where: { id: batchId, partnerId },
      include: { draftRecipients: { orderBy: { ordinal: "asc" } } },
    });
    if (!batch) throw new StaffInviteError("batch_not_found", "Batch not found", 404);
    if (batch.status !== "draft") {
      if (batch.approvedInteractionId === approvedInteractionId) {
        return approvedMetadata(tx, batch);
      }
      throw new StaffInviteError("batch_not_draft", "Batch has already left draft state", 409);
    }
    if (!batch.approvalDigest) {
      throw new StaffInviteError("legacy_credentialed_draft", "Legacy credentialed drafts must be re-prepared", 409);
    }
    if (batch.approvalDigestVersion !== STAFF_INVITE_APPROVAL_DIGEST_VERSION) {
      throw new StaffInviteError("approval_digest_mismatch", "Unsupported approval digest version", 409);
    }
    if (input.sourceEvidence) {
      if (
        batch.sourceIssueId !== input.sourceEvidence.sourceIssueId ||
        batch.sourceCommentId !== input.sourceEvidence.sourceCommentId ||
        (batch.sourceCardId ?? null) !== (input.sourceEvidence.sourceCardId ?? null)
      ) {
        throw new StaffInviteError("source_evidence_mismatch", "Source evidence changed after prepare", 409);
      }
    }
    if (
      input.providerCredentialFingerprint &&
      input.providerCredentialFingerprint !== batch.providerCredentialFingerprint
    ) {
      throw new StaffInviteError(
        "provider_fingerprint_mismatch",
        "Provider credential fingerprint changed after prepare",
        409
      );
    }
    if (batch.sealKeyFingerprint !== expectedSealKeyFingerprint) {
      throw new StaffInviteError("seal_key_fingerprint_mismatch", "Seal key fingerprint changed after prepare", 409);
    }
    expirySeconds(batch.requestedExpirySeconds);

    const currentReviewers = await tx.mycoEmployee.findMany({
      where: staffReviewerWhere(partnerId),
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    });
    if (buildRosterDigest(partnerId, currentReviewers) !== batch.rosterDigest) {
      throw new StaffInviteError("draft_material_invalid", "Reviewer roster changed after prepare", 409);
    }

    const drafts = batch.draftRecipients ?? [];
    if (drafts.length === 0) {
      throw new StaffInviteError("draft_material_invalid", "Draft batch has no recipients", 409);
    }

    const finalEvidences: FinalRecipientEvidence[] = [];
    await lockStaffLinkMint(tx, { partnerId });

    const priorPending = await tx.staffReviewInvitation.findMany({
      where: {
        partnerId,
        status: "pending",
        revokedAt: null,
      },
      select: { id: true, employeeId: true, status: true },
    });
    const priorPendingIds = priorPending.map((invitation) => invitation.id);

    if (priorPendingIds.length > 0) {
      await tx.staffReviewInvitation.updateMany({
        where: { id: { in: priorPendingIds }, status: "pending", revokedAt: null },
        data: {
          status: "revoked",
          revokedAt: approvedAt,
          revokedBy: approvedBy,
          revocationReason: `superseded by approved staff invite batch ${batch.id}`,
        },
      });
      await tx.staffReviewInviteBatchRecipient.updateMany({
        where: {
          invitationId: { in: priorPendingIds },
          sendStatus: { in: ["approved", "queued"] },
          sentAt: null,
        },
        data: {
          sendStatus: "invalidated",
          invalidatedAt: approvedAt,
          validationFailureCode: "revoked",
          validationFailureEvidence: {
            reason: "superseded_by_approved_batch",
            batchId: batch.id,
            approvedInteractionId,
          },
        },
      });
    }

    await tx.catalogAccessToken.updateMany({
      where: { purpose: "staff_review", partnerId, status: "active" },
      data: {
        ...buildRevokedTokenPatch(
          approvedBy,
          `superseded by approved staff invite batch ${batch.id}`,
          approvedAt
        ),
        enrollmentOpen: false,
      },
    });

    const staffLinkToken = createCatalogAccessToken();
    const staffLink = await tx.catalogAccessToken.create({
      data: {
        tokenHash: hashCatalogAccessToken(staffLinkToken),
        purpose: "staff_review",
        status: "active",
        partnerId,
        issuedToType: "staff",
        issuedToId: null,
        issuedToEmail: null,
        issuedBy: approvedBy,
        expiresAt: new Date(approvedAt.getTime() + batch.requestedExpirySeconds * 1000),
        enrollmentOpen: true,
        enrollmentClosesAt: new Date(approvedAt.getTime() + batch.requestedExpirySeconds * 1000),
      },
      select: { id: true, tokenHash: true, issuedAt: true, expiresAt: true },
    });
    const inviteUrl = staffLinkUrl(staffLinkToken);

    for (const draft of drafts) {
      const plaintext = decryptJson<DraftPlaintext>({
        key: sealKey,
        purpose: STAFF_INVITE_DRAFT_SEAL_PURPOSE,
        record: draft,
        aad: { batchId: batch.id, draftRecipientId: draft.id, draftRecipientDigest: draft.draftRecipientDigest },
      });
      if (
        plaintext.batchId !== batch.id ||
        plaintext.draftRecipientId !== draft.id ||
        plaintext.employeeId !== draft.employeeId ||
        plaintext.emailNormalized !== draft.emailNormalized ||
        plaintext.provider !== batch.provider ||
        plaintext.fromAddress !== batch.fromAddress ||
        plaintext.requestedExpirySeconds !== batch.requestedExpirySeconds
      ) {
        throw new StaffInviteError("draft_material_invalid", "Draft recipient material does not match batch metadata", 409);
      }
      requirePlaceholder(plaintext.subject, "subject");
      requirePlaceholder(plaintext.htmlTemplate, "html");
      requirePlaceholder(plaintext.textTemplate, "text");
      if (
        digestJson("staff-invite-cc-v1", plaintext.normalizedCc) !== draft.ccDigest ||
        digestJson("staff-invite-template-subject-v1", plaintext.subject) !== draft.subjectTemplateDigest ||
        digestJson("staff-invite-template-html-v1", plaintext.htmlTemplate) !== draft.htmlTemplateDigest ||
        digestJson("staff-invite-template-text-v1", plaintext.textTemplate) !== draft.textTemplateDigest
      ) {
        throw new StaffInviteError("draft_material_invalid", "Draft recipient digests do not match sealed material", 409);
      }

      const subject = plaintext.subject.split("{{INVITE_URL}}").join(inviteUrl);
      const html = plaintext.htmlTemplate.split("{{INVITE_URL}}").join(inviteUrl);
      const text = plaintext.textTemplate.split("{{INVITE_URL}}").join(inviteUrl);
      const providerKey = providerIdempotencyKey(batch.id, `${staffLink.id}:${draft.id}`, batch.approvalDigest);
      const linkDigest = digestJson("staff-invite-live-link-v1", {
        batchId: batch.id,
        catalogAccessTokenId: staffLink.id,
        draftRecipientId: draft.id,
        inviteUrl,
      });
      const identityDigest = recipientIdentityDigest({
        partnerId,
        employeeId: draft.employeeId,
        displayName: draft.displayName,
        emailNormalized: draft.emailNormalized,
      });
      const finalSeal = sealJson({
        key: sealKey,
        purpose: STAFF_INVITE_FINAL_SEAL_PURPOSE,
        payload: {
          approvalDigest: batch.approvalDigest,
          approvedInteractionId,
          batchId: batch.id,
          catalogAccessTokenId: staffLink.id,
          ordinal: draft.ordinal,
          employeeId: draft.employeeId,
          emailNormalized: draft.emailNormalized,
          cc: plaintext.normalizedCc,
          subject,
          html,
          text,
          providerIdempotencyKey: providerKey,
        },
        aad: {
          batchId: batch.id,
          catalogAccessTokenId: staffLink.id,
          draftRecipientDigest: draft.draftRecipientDigest,
          approvalDigest: batch.approvalDigest,
        },
      });
      const recipient = await tx.staffReviewInviteBatchRecipient.create({
        data: {
          batchId: batch.id,
          ordinal: draft.ordinal,
          invitationId: null,
          catalogAccessTokenId: staffLink.id,
          employeeId: draft.employeeId,
          displayName: draft.displayName,
          emailNormalized: draft.emailNormalized,
          partnerScopeId: draft.partnerScopeId,
          draftRecipientDigest: draft.draftRecipientDigest,
          recipientIdentityDigest: identityDigest,
          ccDigest: draft.ccDigest,
          subjectDigest: digestJson("staff-invite-rendered-subject-v1", subject),
          htmlDigest: digestJson("staff-invite-rendered-html-v1", html),
          textDigest: digestJson("staff-invite-rendered-text-v1", text),
          linkDigest,
          providerIdempotencyKey: providerKey,
          sealedPayloadCiphertext: finalSeal.sealedCiphertext,
          sealedPayloadIv: finalSeal.sealedIv,
          sealedPayloadAuthTag: finalSeal.sealedAuthTag,
          sendStatus: "approved",
        },
      });
      finalEvidences.push({
        ...recipient,
        credentialId: staffLink.id,
        tokenHash: staffLink.tokenHash,
        issuedAt: staffLink.issuedAt,
        expiresAt: staffLink.expiresAt,
        revokedAt: null,
        providerIdempotencyKey: providerKey,
      });
    }

    const batchDigest = digestJson(STAFF_INVITE_FINAL_DIGEST_VERSION, {
      approvalDigest: batch.approvalDigest,
      approvedInteractionId,
      approvedBy,
      approvedAt,
      provider: batch.provider,
      fromAddress: batch.fromAddress,
      replyToAddress: batch.replyToAddress,
      rendererVersion: batch.rendererVersion,
      rosterDigest: batch.rosterDigest,
      sealKeyFingerprint: batch.sealKeyFingerprint,
      recipients: finalEvidences.map((evidence) => ({
        draftRecipientDigest: evidence.draftRecipientDigest,
        recipientId: evidence.id,
        invitationId: evidence.invitationId,
        catalogAccessTokenId: evidence.catalogAccessTokenId,
        credentialId: evidence.credentialId,
        tokenHash: evidence.tokenHash,
        issuedAt: evidence.issuedAt,
        expiresAt: evidence.expiresAt,
        revokedAt: evidence.revokedAt,
        recipientIdentityDigest: evidence.recipientIdentityDigest,
        linkDigest: evidence.linkDigest,
        ccDigest: evidence.ccDigest,
        subjectDigest: evidence.subjectDigest,
        htmlDigest: evidence.htmlDigest,
        textDigest: evidence.textDigest,
        providerIdempotencyKey: evidence.providerIdempotencyKey,
      })),
    });

    const updated = await tx.staffReviewInviteBatch.update({
      where: { id: batch.id },
      data: {
        status: "approved",
        approvedInteractionId,
        approvedBy,
        approvedAt,
        batchDigest,
      },
    });

    return approvedMetadata(tx, updated);
  });
}

export async function revokeStaffReviewInvitation(
  input: RevokeStaffReviewInvitationInput,
  client = db()
): Promise<RevokeStaffReviewInvitationResult> {
  const actor = input.session?.actualUser;
  if (!input.session?.user?.email || !actor?.email) {
    throw new StaffInviteError("unauthorized", "Unauthorized", 401);
  }
  if (input.session.viewAs) {
    throw new StaffInviteError("view_as_forbidden", "View-as cannot mutate staff invitations", 403);
  }
  if (actor.role !== "super_admin") {
    throw new StaffInviteError("forbidden", "Only a super admin can revoke staff invitations", 403);
  }
  const partnerId = requireText(input.partnerId, "partnerId");
  const invitationId = requireText(input.invitationId, "invitationId");
  const reason = requireText(input.reason, "reason");
  const now = input.now ?? new Date();

  return client.$transaction(async (tx) => {
    const invitation = await tx.staffReviewInvitation.findFirst({
      where: { id: invitationId, partnerId },
      select: {
        id: true,
        partnerId: true,
        employeeId: true,
        status: true,
        expiresAt: true,
        revokedAt: true,
        revokedBy: true,
        revocationReason: true,
      },
    });
    if (!invitation) {
      throw new StaffInviteError("invitation_not_found", "Invitation not found", 404);
    }
    if (invitation.status === "revoked" || invitation.revokedAt) {
      return {
        invitationId: invitation.id,
        status: "revoked",
        alreadyRevoked: true,
        invalidatedRecipientCount: 0,
      };
    }
    if (invitation.status !== "pending" || invitation.expiresAt.getTime() <= now.getTime()) {
      throw new StaffInviteError("invitation_not_pending", "Invitation is not pending", 409);
    }

    await tx.staffReviewInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "revoked",
        revokedAt: now,
        revokedBy: actor.email,
        revocationReason: reason,
      },
    });
    const invalidated = await tx.staffReviewInviteBatchRecipient.updateMany({
      where: {
        invitationId: invitation.id,
        sendStatus: { in: ["approved", "queued"] },
        sentAt: null,
      },
      data: {
        sendStatus: "invalidated",
        invalidatedAt: now,
        validationFailureCode: "revoked",
        validationFailureEvidence: {
          reason,
          revokedBy: actor.email,
          revokedAt: now.toISOString(),
        },
      },
    });

    return {
      invitationId: invitation.id,
      status: "revoked",
      alreadyRevoked: false,
      invalidatedRecipientCount: invalidated.count,
    };
  });
}
