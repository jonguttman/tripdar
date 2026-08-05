import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail, type SendEmailOptions } from "@/lib/email";
import {
  createReviewToken,
  hashReviewToken,
  isTerminalReviewStatus,
  normalizeEmployeeEmail,
} from "./employeeReviews";
import {
  buildRevokedTokenPatch,
  hashCatalogAccessToken,
} from "./catalogTokens";

const DEFAULT_EXPIRATION_DAYS = 21;
const MAX_EMPLOYEES_PER_BATCH = 50;
const EMAIL_SENDER = "Tripdar <noreply@tripd.ar>";
const EMAIL_PROVIDER = "resend";

export type StaffReviewInviteNoSendReason =
  | "batch_not_approved"
  | "assignment_missing"
  | "assignment_identity_mismatch"
  | "token_mismatch"
  | "access_token_missing"
  | "access_token_mismatch"
  | "expired"
  | "revoked"
  | "assignment_not_current"
  | "recipient_mismatch"
  | "roster_mismatch"
  | "sender_mismatch"
  | "subject_mismatch"
  | "body_mismatch"
  | "link_mismatch"
  | "provider_credential_mismatch"
  | "duplicate_send"
  | "employee_opted_out"
  | "catalog_mismatch";

export type StaffReviewInviteValidation =
  | {
      ok: true;
      recipientId: string;
      assignmentId: string;
      email: string;
      message: SendEmailOptions;
    }
  | {
      ok: false;
      recipientId: string;
      reason: StaffReviewInviteNoSendReason;
      evidenceId?: string;
    };

export interface StaffReviewInviteAssignmentResult {
  employeeId: string;
  assignmentId: string;
  recipientId?: string;
  email: string;
  link: string | null;
  sent: boolean;
  providerMessageId?: string | null;
  error?: string;
}

interface EmployeeInput {
  name?: unknown;
  email?: unknown;
}

interface ProductSnapshot {
  id: string;
  partnerId: string;
  brandId: string | null;
  productName: string;
  partnerName: string;
}

interface EmailSnapshot {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  link: string;
}

interface RecipientSnapshot {
  partnerId: string;
  catalogItemId: string;
  brandId: string | null;
  productName: string;
  partnerName: string;
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  accessTokenId: string;
  tokenHash: string;
  accessTokenHash: string;
  expiresAt: string;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function digest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((output, key) => {
      output[key] = canonicalize((value as Record<string, unknown>)[key]);
      return output;
    }, {});
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalDigest(value: unknown): string {
  return digest(canonicalJson(value));
}

export function providerCredentialFingerprint(secret = process.env.RESEND_API_KEY): string {
  return canonicalDigest({
    provider: EMAIL_PROVIDER,
    keyHash: secret ? digest(secret.trim()) : "missing",
  });
}

function reviewUrl(input: { requestOrigin: string; token: string }): string {
  const configured = process.env.NEXTAUTH_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = configured
    ? configured.startsWith("http")
      ? configured
      : `https://${configured}`
    : input.requestOrigin;
  return `${base.replace(/\/$/, "")}/review/myco/${input.token}`;
}

export function renderStaffReviewInviteMessage(input: {
  partnerName: string;
  productName: string;
  link: string;
  email: string;
  sender?: string;
}): EmailSnapshot {
  return {
    to: input.email,
    from: input.sender ?? EMAIL_SENDER,
    subject: `Tripdar product guidance: ${input.productName}`,
    html: `<p>${input.partnerName} is asking for your product guidance on <strong>${input.productName}</strong>.</p><p><a href="${input.link}">Open your review link</a></p><p>If you are not familiar enough with this product, that is a valid response.</p>`,
    text: `${input.partnerName} is asking for your product guidance on ${input.productName}.\n\nOpen your review link: ${input.link}\n\nIf you are not familiar enough with this product, that is a valid response.`,
    link: input.link,
  };
}

function recipientRosterDigest(snapshot: RecipientSnapshot): string {
  return canonicalDigest({
    partnerId: snapshot.partnerId,
    catalogItemId: snapshot.catalogItemId,
    brandId: snapshot.brandId,
    productName: snapshot.productName,
    partnerName: snapshot.partnerName,
    assignmentId: snapshot.assignmentId,
    employeeId: snapshot.employeeId,
    employeeName: snapshot.employeeName,
    employeeEmail: normalizeEmployeeEmail(snapshot.employeeEmail),
    accessTokenId: snapshot.accessTokenId,
    tokenHash: snapshot.tokenHash,
    accessTokenHash: snapshot.accessTokenHash,
    expiresAt: snapshot.expiresAt,
  });
}

function batchRosterDigest(recipientDigests: string[]): string {
  return canonicalDigest([...recipientDigests].sort());
}

function messageDigests(message: EmailSnapshot) {
  return {
    subjectDigest: canonicalDigest(message.subject),
    htmlDigest: canonicalDigest(message.html),
    textDigest: canonicalDigest(message.text),
    linkDigest: canonicalDigest(message.link),
  };
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function emailSnapshot(value: unknown): EmailSnapshot | null {
  const snapshot = jsonObject(value);
  if (
    typeof snapshot.to !== "string" ||
    typeof snapshot.from !== "string" ||
    typeof snapshot.subject !== "string" ||
    typeof snapshot.html !== "string" ||
    typeof snapshot.text !== "string" ||
    typeof snapshot.link !== "string"
  ) {
    return null;
  }
  return snapshot as unknown as EmailSnapshot;
}

function providerMessageId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  if ("id" in result && typeof result.id === "string") return result.id;
  if (
    "data" in result &&
    result.data &&
    typeof result.data === "object" &&
    "id" in result.data &&
    typeof result.data.id === "string"
  ) {
    return result.data.id;
  }
  return null;
}

async function recordNoSendEvidence(input: {
  recipient: {
    id: string;
    batchId: string;
    assignmentId: string;
    employeeId: string;
    accessTokenId: string;
    batch: { partnerId: string };
  };
  reason: StaffReviewInviteNoSendReason;
  evidence: Record<string, unknown>;
}) {
  return prisma.$transaction(async (tx) => {
    const evidence = await tx.staffReviewInviteNoSendEvidence.create({
      data: {
        batchId: input.recipient.batchId,
        recipientId: input.recipient.id,
        assignmentId: input.recipient.assignmentId,
        employeeId: input.recipient.employeeId,
        accessTokenId: input.recipient.accessTokenId,
        partnerId: input.recipient.batch.partnerId,
        reason: input.reason,
        requiresApproval: true,
        evidence: input.evidence as Prisma.InputJsonObject,
      },
      select: { id: true },
    });
    await tx.staffReviewInviteRecipient.update({
      where: { id: input.recipient.id },
      data: {
        status: "refused",
        noSendReason: input.reason,
        lastValidatedAt: new Date(),
      },
    });
    await tx.staffReviewInviteBatch.update({
      where: { id: input.recipient.batchId },
      data: { status: "refused", refusedCount: { increment: 1 } },
    });
    return evidence;
  });
}

function failValidation(input: {
  recipient: {
    id: string;
    batchId: string;
    assignmentId: string;
    employeeId: string;
    accessTokenId: string;
    batch: { partnerId: string };
  };
  reason: StaffReviewInviteNoSendReason;
  persistEvidence: boolean;
  evidence: Record<string, unknown>;
}): Promise<StaffReviewInviteValidation> {
  if (!input.persistEvidence) {
    return Promise.resolve({
      ok: false,
      recipientId: input.recipient.id,
      reason: input.reason,
    });
  }
  return recordNoSendEvidence({
    recipient: input.recipient,
    reason: input.reason,
    evidence: input.evidence,
  }).then((evidence) => ({
    ok: false,
    recipientId: input.recipient.id,
    reason: input.reason,
    evidenceId: evidence.id,
  }));
}

export async function approveStaffReviewInviteBatch(input: {
  partnerId: string;
  catalogItemId: string;
  approvedBy: string;
  employees: EmployeeInput[];
  requestOrigin: string;
  expiresInDays?: number;
}): Promise<{ batchId: string; assignments: StaffReviewInviteAssignmentResult[] }> {
  const expiresInDays = Number.isFinite(Number(input.expiresInDays))
    ? Math.max(1, Math.min(90, Math.round(Number(input.expiresInDays))))
    : DEFAULT_EXPIRATION_DAYS;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const product = await tx.storeProductCatalog.findUnique({
      where: { id: input.catalogItemId },
      select: {
        id: true,
        partnerId: true,
        brandId: true,
        productName: true,
        partner: { select: { name: true } },
      },
    });
    if (!product || product.partnerId !== input.partnerId) {
      throw new Error("Product not found");
    }

    const productSnapshot: ProductSnapshot = {
      id: product.id,
      partnerId: product.partnerId,
      brandId: product.brandId,
      productName: product.productName,
      partnerName: product.partner.name,
    };
    const batch = await tx.staffReviewInviteBatch.create({
      data: {
        partnerId: input.partnerId,
        catalogItemId: input.catalogItemId,
        approvedBy: input.approvedBy,
        expiresAt,
        sender: EMAIL_SENDER,
        provider: EMAIL_PROVIDER,
        providerCredentialFingerprint: providerCredentialFingerprint(),
        subjectDigest: canonicalDigest([]),
        htmlDigest: canonicalDigest([]),
        textDigest: canonicalDigest([]),
        rosterDigest: canonicalDigest([]),
        recipientCount: 0,
        approvalSnapshot: {
          product: productSnapshot,
          expiresAt: expiresAt.toISOString(),
          approvedBy: input.approvedBy,
        } as unknown as Prisma.InputJsonObject,
      },
      select: { id: true },
    });

    await tx.staffReviewInviteBatch.updateMany({
      where: {
        id: { not: batch.id },
        partnerId: input.partnerId,
        catalogItemId: input.catalogItemId,
        status: { in: ["approved", "sending", "partial"] },
        supersededByBatchId: null,
      },
      data: {
        status: "refused",
        supersededByBatchId: batch.id,
      },
    });

    const results: StaffReviewInviteAssignmentResult[] = [];
    const recipientRosterDigests: string[] = [];
    const subjectDigests: string[] = [];
    const htmlDigests: string[] = [];
    const textDigests: string[] = [];

    for (const employeeInput of input.employees.slice(0, MAX_EMPLOYEES_PER_BATCH)) {
      const name = cleanText(employeeInput?.name);
      const email = typeof employeeInput?.email === "string" ? normalizeEmployeeEmail(employeeInput.email) : "";
      if (!name || !email || !email.includes("@")) {
        results.push({ employeeId: "", assignmentId: "", email, link: null, sent: false, error: "Invalid employee" });
        continue;
      }

      const rawToken = createReviewToken();
      const reviewTokenHash = hashReviewToken(rawToken);
      const accessTokenHash = hashCatalogAccessToken(rawToken);
      const employee = await tx.mycoEmployee.upsert({
        where: { partnerId_email: { partnerId: input.partnerId, email } },
        update: { name, active: true },
        create: { partnerId: input.partnerId, name, email },
        select: { id: true, name: true, email: true, active: true, optedOut: true },
      });

      if (employee.optedOut || !employee.active) {
        results.push({ employeeId: employee.id, assignmentId: "", email, link: null, sent: false, error: "Employee opted out" });
        continue;
      }

      const existingAssignment = await tx.mycoEmployeeReviewAssignment.findUnique({
        where: { catalogItemId_employeeId: { catalogItemId: input.catalogItemId, employeeId: employee.id } },
        include: { response: true, accessToken: true },
      });
      if (
        existingAssignment?.response ||
        existingAssignment?.status === "submitted" ||
        existingAssignment?.status === "not_familiar"
      ) {
        results.push({
          employeeId: employee.id,
          assignmentId: existingAssignment.id,
          email,
          link: null,
          sent: false,
          error: "Employee already completed this review",
        });
        continue;
      }

      if (existingAssignment?.accessToken) {
        await tx.catalogAccessToken.update({
          where: { id: existingAssignment.accessToken.id },
          data: buildRevokedTokenPatch(input.approvedBy, "superseded by approved invite batch"),
        });
      }

      const accessToken = await tx.catalogAccessToken.create({
        data: {
          tokenHash: accessTokenHash,
          purpose: "staff_review",
          status: "active",
          partnerId: input.partnerId,
          brandId: productSnapshot.brandId,
          catalogItemId: input.catalogItemId,
          issuedToType: "staff",
          issuedToId: employee.id,
          issuedToEmail: employee.email,
          issuedBy: input.approvedBy,
          expiresAt,
          regeneratedFromId: existingAssignment?.accessToken?.id ?? null,
        },
        select: { id: true },
      });

      const assignment = existingAssignment
        ? await tx.mycoEmployeeReviewAssignment.update({
            where: { id: existingAssignment.id },
            data: {
              accessTokenId: accessToken.id,
              tokenHash: reviewTokenHash,
              status: "assigned",
              expiresAt,
              assignedBy: input.approvedBy,
            },
            select: { id: true },
          })
        : await tx.mycoEmployeeReviewAssignment.create({
            data: {
              catalogItemId: input.catalogItemId,
              employeeId: employee.id,
              accessTokenId: accessToken.id,
              tokenHash: reviewTokenHash,
              expiresAt,
              assignedBy: input.approvedBy,
            },
            select: { id: true },
          });

      const link = reviewUrl({ requestOrigin: input.requestOrigin, token: rawToken });
      const message = renderStaffReviewInviteMessage({
        partnerName: productSnapshot.partnerName,
        productName: productSnapshot.productName,
        link,
        email,
        sender: EMAIL_SENDER,
      });
      const snapshot: RecipientSnapshot = {
        partnerId: input.partnerId,
        catalogItemId: input.catalogItemId,
        brandId: productSnapshot.brandId,
        productName: productSnapshot.productName,
        partnerName: productSnapshot.partnerName,
        assignmentId: assignment.id,
        employeeId: employee.id,
        employeeName: employee.name,
        employeeEmail: employee.email,
        accessTokenId: accessToken.id,
        tokenHash: reviewTokenHash,
        accessTokenHash,
        expiresAt: expiresAt.toISOString(),
      };
      const rosterDigest = recipientRosterDigest(snapshot);
      const digests = messageDigests(message);
      const recipient = await tx.staffReviewInviteRecipient.create({
        data: {
          batchId: batch.id,
          assignmentId: assignment.id,
          employeeId: employee.id,
          accessTokenId: accessToken.id,
          emailNormalized: email,
          employeeName: employee.name,
          tokenHash: reviewTokenHash,
          accessTokenHash,
          linkDigest: digests.linkDigest,
          subjectDigest: digests.subjectDigest,
          htmlDigest: digests.htmlDigest,
          textDigest: digests.textDigest,
          rosterDigest,
          sender: EMAIL_SENDER,
          recipientSnapshot: snapshot as unknown as Prisma.InputJsonObject,
          messageSnapshot: message as unknown as Prisma.InputJsonObject,
        },
        select: { id: true },
      });

      recipientRosterDigests.push(rosterDigest);
      subjectDigests.push(digests.subjectDigest);
      htmlDigests.push(digests.htmlDigest);
      textDigests.push(digests.textDigest);
      results.push({
        employeeId: employee.id,
        assignmentId: assignment.id,
        recipientId: recipient.id,
        email,
        link,
        sent: false,
      });
    }

    await tx.staffReviewInviteBatch.update({
      where: { id: batch.id },
      data: {
        recipientCount: recipientRosterDigests.length,
        rosterDigest: batchRosterDigest(recipientRosterDigests),
        subjectDigest: canonicalDigest(subjectDigests.sort()),
        htmlDigest: canonicalDigest(htmlDigests.sort()),
        textDigest: canonicalDigest(textDigests.sort()),
      },
    });

    return { batchId: batch.id, assignments: results };
  });
}

export async function validateApprovedStaffReviewInviteRecipient(input: {
  recipientId: string;
  now?: Date;
  persistEvidence?: boolean;
  providerFingerprint?: string;
}): Promise<StaffReviewInviteValidation> {
  const now = input.now ?? new Date();
  const persistEvidence = input.persistEvidence !== false;
  const recipient = await prisma.staffReviewInviteRecipient.findUnique({
    where: { id: input.recipientId },
    include: {
      batch: {
        include: {
          recipients: {
            select: {
              id: true,
              rosterDigest: true,
              subjectDigest: true,
              htmlDigest: true,
              textDigest: true,
            },
          },
        },
      },
      accessToken: true,
      assignment: {
        include: {
          accessToken: true,
          employee: true,
          catalogItem: {
            include: {
              partner: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!recipient) {
    return { ok: false, recipientId: input.recipientId, reason: "assignment_missing" };
  }

  const fail = (reason: StaffReviewInviteNoSendReason, evidence: Record<string, unknown>) =>
    failValidation({ recipient, reason, persistEvidence, evidence });

  if (recipient.providerMessageId || recipient.sentAt || recipient.status === "sent") {
    return fail("duplicate_send", {
      providerMessageId: recipient.providerMessageId,
      sentAt: recipient.sentAt?.toISOString() ?? null,
      status: recipient.status,
    });
  }
  if (recipient.batch.status !== "approved" && recipient.batch.status !== "sending" && recipient.batch.status !== "partial") {
    return fail("batch_not_approved", { batchStatus: recipient.batch.status });
  }
  if (recipient.assignmentId !== recipient.assignment.id || recipient.employeeId !== recipient.assignment.employeeId) {
    return fail("assignment_identity_mismatch", {
      recipientAssignmentId: recipient.assignmentId,
      currentAssignmentId: recipient.assignment.id,
      recipientEmployeeId: recipient.employeeId,
      currentEmployeeId: recipient.assignment.employeeId,
    });
  }
  if (recipient.assignment.tokenHash !== recipient.tokenHash) {
    return fail("token_mismatch", {
      recipientTokenHash: recipient.tokenHash,
      assignmentTokenHash: recipient.assignment.tokenHash,
    });
  }
  if (!recipient.assignment.accessToken || !recipient.assignment.accessTokenId) {
    return fail("access_token_missing", { assignmentId: recipient.assignment.id });
  }
  if (
    recipient.assignment.accessTokenId !== recipient.accessTokenId ||
    recipient.assignment.accessToken.id !== recipient.accessTokenId ||
    recipient.accessToken.id !== recipient.accessTokenId ||
    recipient.assignment.accessToken.tokenHash !== recipient.accessTokenHash ||
    recipient.accessToken.tokenHash !== recipient.accessTokenHash
  ) {
    return fail("access_token_mismatch", {
      recipientAccessTokenId: recipient.accessTokenId,
      assignmentAccessTokenId: recipient.assignment.accessTokenId,
      currentTokenHash: recipient.assignment.accessToken.tokenHash,
    });
  }
  if (
    recipient.batch.catalogItemId !== recipient.assignment.catalogItemId ||
    recipient.assignment.catalogItemId !== recipient.batch.catalogItemId ||
    recipient.assignment.accessToken.catalogItemId !== recipient.batch.catalogItemId ||
    recipient.assignment.catalogItem.partnerId !== recipient.batch.partnerId ||
    recipient.assignment.accessToken.partnerId !== recipient.batch.partnerId
  ) {
    return fail("catalog_mismatch", {
      batchCatalogItemId: recipient.batch.catalogItemId,
      assignmentCatalogItemId: recipient.assignment.catalogItemId,
      tokenCatalogItemId: recipient.assignment.accessToken.catalogItemId,
      batchPartnerId: recipient.batch.partnerId,
      catalogPartnerId: recipient.assignment.catalogItem.partnerId,
      tokenPartnerId: recipient.assignment.accessToken.partnerId,
    });
  }
  if (
    recipient.assignment.status === "expired" ||
    isTerminalReviewStatus(recipient.assignment.status) ||
    (recipient.assignment.expiresAt ? recipient.assignment.expiresAt.getTime() <= now.getTime() : false) ||
    (recipient.assignment.accessToken.expiresAt
      ? recipient.assignment.accessToken.expiresAt.getTime() <= now.getTime()
      : false) ||
    recipient.batch.expiresAt.getTime() <= now.getTime()
  ) {
    return fail("expired", {
      assignmentStatus: recipient.assignment.status,
      assignmentExpiresAt: recipient.assignment.expiresAt?.toISOString() ?? null,
      accessTokenExpiresAt: recipient.assignment.accessToken.expiresAt?.toISOString() ?? null,
      batchExpiresAt: recipient.batch.expiresAt.toISOString(),
    });
  }
  if (
    recipient.assignment.accessToken.status !== "active" ||
    recipient.assignment.accessToken.revokedAt ||
    recipient.accessToken.status !== "active" ||
    recipient.accessToken.revokedAt
  ) {
    return fail("revoked", {
      assignmentAccessTokenStatus: recipient.assignment.accessToken.status,
      recipientAccessTokenStatus: recipient.accessToken.status,
    });
  }
  if (recipient.assignment.status !== "assigned" && recipient.assignment.status !== "opened") {
    return fail("assignment_not_current", { assignmentStatus: recipient.assignment.status });
  }
  if (!recipient.assignment.employee.active || recipient.assignment.employee.optedOut) {
    return fail("employee_opted_out", {
      active: recipient.assignment.employee.active,
      optedOut: recipient.assignment.employee.optedOut,
    });
  }
  if (
    normalizeEmployeeEmail(recipient.assignment.employee.email) !== recipient.emailNormalized ||
    normalizeEmployeeEmail(recipient.assignment.accessToken.issuedToEmail ?? "") !== recipient.emailNormalized ||
    recipient.assignment.employeeId !== recipient.assignment.accessToken.issuedToId
  ) {
    return fail("recipient_mismatch", {
      employeeEmail: recipient.assignment.employee.email,
      recipientEmail: recipient.emailNormalized,
      tokenIssuedToEmail: recipient.assignment.accessToken.issuedToEmail,
      tokenIssuedToId: recipient.assignment.accessToken.issuedToId,
    });
  }

  const message = emailSnapshot(recipient.messageSnapshot);
  if (!message) return fail("body_mismatch", { messageSnapshot: recipient.messageSnapshot });
  const storedMessageDigests = messageDigests(message);
  if (recipient.linkDigest !== storedMessageDigests.linkDigest) {
    return fail("link_mismatch", {
      recipientLinkDigest: recipient.linkDigest,
      storedLinkDigest: storedMessageDigests.linkDigest,
    });
  }
  if (recipient.subjectDigest !== storedMessageDigests.subjectDigest) {
    return fail("subject_mismatch", {
      recipientSubjectDigest: recipient.subjectDigest,
      storedSubjectDigest: storedMessageDigests.subjectDigest,
    });
  }
  if (
    recipient.htmlDigest !== storedMessageDigests.htmlDigest ||
    recipient.textDigest !== storedMessageDigests.textDigest
  ) {
    return fail("body_mismatch", {
      recipientHtmlDigest: recipient.htmlDigest,
      storedHtmlDigest: storedMessageDigests.htmlDigest,
      recipientTextDigest: recipient.textDigest,
      storedTextDigest: storedMessageDigests.textDigest,
    });
  }
  const rendered = renderStaffReviewInviteMessage({
    partnerName: recipient.assignment.catalogItem.partner.name,
    productName: recipient.assignment.catalogItem.productName,
    link: message.link,
    email: recipient.emailNormalized,
    sender: recipient.sender,
  });
  const currentSnapshot: RecipientSnapshot = {
    partnerId: recipient.batch.partnerId,
    catalogItemId: recipient.batch.catalogItemId,
    brandId: recipient.assignment.catalogItem.brandId,
    productName: recipient.assignment.catalogItem.productName,
    partnerName: recipient.assignment.catalogItem.partner.name,
    assignmentId: recipient.assignment.id,
    employeeId: recipient.assignment.employee.id,
    employeeName: recipient.assignment.employee.name,
    employeeEmail: recipient.assignment.employee.email,
    accessTokenId: recipient.assignment.accessToken.id,
    tokenHash: recipient.assignment.tokenHash,
    accessTokenHash: recipient.assignment.accessToken.tokenHash,
    expiresAt: recipient.assignment.expiresAt?.toISOString() ?? "",
  };
  const currentRosterDigest = recipientRosterDigest(currentSnapshot);
  const currentBatchRosterDigest = batchRosterDigest(
    recipient.batch.recipients.map((row) =>
      row.id === recipient.id ? currentRosterDigest : row.rosterDigest
    )
  );
  if (recipient.rosterDigest !== currentRosterDigest || recipient.batch.rosterDigest !== currentBatchRosterDigest) {
    return fail("roster_mismatch", {
      recipientRosterDigest: recipient.rosterDigest,
      currentRosterDigest,
      batchRosterDigest: recipient.batch.rosterDigest,
      currentBatchRosterDigest,
    });
  }
  if (recipient.sender !== EMAIL_SENDER || recipient.sender !== recipient.batch.sender || message.from !== recipient.sender) {
    return fail("sender_mismatch", {
      recipientSender: recipient.sender,
      batchSender: recipient.batch.sender,
      messageFrom: message.from,
    });
  }
  const digests = messageDigests(rendered);
  if (recipient.linkDigest !== canonicalDigest(message.link)) {
    return fail("link_mismatch", {
      recipientLinkDigest: recipient.linkDigest,
      currentLinkDigest: canonicalDigest(message.link),
    });
  }
  if (
    recipient.subjectDigest !== digests.subjectDigest ||
    recipient.batch.subjectDigest !== canonicalDigest(
      recipient.batch.recipients.map((row) =>
        row.id === recipient.id ? digests.subjectDigest : row.subjectDigest
      ).sort()
    )
  ) {
    return fail("subject_mismatch", {
      recipientSubjectDigest: recipient.subjectDigest,
      currentSubjectDigest: digests.subjectDigest,
      batchSubjectDigest: recipient.batch.subjectDigest,
    });
  }
  if (
    recipient.htmlDigest !== digests.htmlDigest ||
    recipient.textDigest !== digests.textDigest ||
    recipient.batch.htmlDigest !== canonicalDigest(
      recipient.batch.recipients.map((row) =>
        row.id === recipient.id ? digests.htmlDigest : row.htmlDigest
      ).sort()
    ) ||
    recipient.batch.textDigest !== canonicalDigest(
      recipient.batch.recipients.map((row) =>
        row.id === recipient.id ? digests.textDigest : row.textDigest
      ).sort()
    )
  ) {
    return fail("body_mismatch", {
      recipientHtmlDigest: recipient.htmlDigest,
      currentHtmlDigest: digests.htmlDigest,
      recipientTextDigest: recipient.textDigest,
      currentTextDigest: digests.textDigest,
      batchHtmlDigest: recipient.batch.htmlDigest,
      batchTextDigest: recipient.batch.textDigest,
    });
  }
  if (recipient.batch.providerCredentialFingerprint !== (input.providerFingerprint ?? providerCredentialFingerprint())) {
    return fail("provider_credential_mismatch", {
      batchFingerprint: recipient.batch.providerCredentialFingerprint,
      currentFingerprint: input.providerFingerprint ?? providerCredentialFingerprint(),
    });
  }

  await prisma.staffReviewInviteRecipient.update({
    where: { id: recipient.id },
    data: { lastValidatedAt: now },
  });

  return {
    ok: true,
    recipientId: recipient.id,
    assignmentId: recipient.assignment.id,
    email: recipient.emailNormalized,
    message: {
      to: recipient.emailNormalized,
      from: recipient.sender,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
  };
}

export async function sendApprovedStaffReviewInviteBatch(input: {
  batchId: string;
  sendProvider?: (message: SendEmailOptions) => Promise<unknown>;
  now?: Date;
}): Promise<{ batchId: string; results: StaffReviewInviteAssignmentResult[] }> {
  const pendingRecipients = await prisma.staffReviewInviteRecipient.findMany({
    where: { batchId: input.batchId, status: "pending", providerMessageId: null },
    select: { id: true, assignmentId: true, employeeId: true, emailNormalized: true },
    orderBy: [{ createdAt: "asc" }],
  });
  const sendProvider = input.sendProvider ?? sendEmail;
  const results: StaffReviewInviteAssignmentResult[] = [];

  if (pendingRecipients.length > 0) {
    await prisma.staffReviewInviteBatch.update({
      where: { id: input.batchId },
      data: { status: "sending" },
    });
  }

  for (const recipient of pendingRecipients) {
    const validation = await validateApprovedStaffReviewInviteRecipient({
      recipientId: recipient.id,
      now: input.now,
      persistEvidence: true,
    });
    if (!validation.ok) {
      results.push({
        employeeId: recipient.employeeId,
        assignmentId: recipient.assignmentId,
        recipientId: recipient.id,
        email: recipient.emailNormalized,
        link: null,
        sent: false,
        error: validation.reason,
      });
      continue;
    }

    try {
      const providerResult = await sendProvider(validation.message);
      const messageId = providerMessageId(providerResult);
      const sentAt = input.now ?? new Date();
      await prisma.$transaction([
        prisma.staffReviewInviteRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "sent",
            providerMessageId: messageId,
            sentAt,
            sendAttemptCount: { increment: 1 },
          },
        }),
        prisma.mycoEmployeeReviewAssignment.update({
          where: { id: validation.assignmentId },
          data: {
            lastSentAt: sentAt,
            reminderCount: { increment: 1 },
          },
        }),
        prisma.staffReviewInviteBatch.update({
          where: { id: input.batchId },
          data: {
            sentCount: { increment: 1 },
          },
        }),
      ]);
      results.push({
        employeeId: recipient.employeeId,
        assignmentId: recipient.assignmentId,
        recipientId: recipient.id,
        email: recipient.emailNormalized,
        link: null,
        sent: true,
        providerMessageId: messageId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email send failed";
      await prisma.$transaction([
        prisma.staffReviewInviteRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "failed",
            noSendReason: message,
            sendAttemptCount: { increment: 1 },
          },
        }),
        prisma.staffReviewInviteBatch.update({
          where: { id: input.batchId },
          data: {
            status: "partial",
            failedCount: { increment: 1 },
          },
        }),
      ]);
      results.push({
        employeeId: recipient.employeeId,
        assignmentId: recipient.assignmentId,
        recipientId: recipient.id,
        email: recipient.emailNormalized,
        link: null,
        sent: false,
        error: message,
      });
    }
  }

  const counts = await prisma.staffReviewInviteRecipient.groupBy({
    by: ["status"],
    where: { batchId: input.batchId },
    _count: { _all: true },
  });
  const countByStatus = new Map(counts.map((row) => [row.status, row._count._all]));
  const pending = countByStatus.get("pending") ?? 0;
  const failed = countByStatus.get("failed") ?? 0;
  const refused = countByStatus.get("refused") ?? 0;
  const finalStatus = pending > 0 || failed > 0 || refused > 0 ? "partial" : "sent";
  await prisma.staffReviewInviteBatch.update({
    where: { id: input.batchId },
    data: {
      status: finalStatus,
      sentCount: countByStatus.get("sent") ?? 0,
      failedCount: failed,
      refusedCount: refused,
    },
  });

  return { batchId: input.batchId, results };
}
