import crypto from "crypto";
import { NextResponse } from "next/server";
import { DEFAULT_EMAIL_FROM_ADDRESS, DEFAULT_EMAIL_REPLY_TO_ADDRESS, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { normalizeEmployeeEmail } from "./employeeReviews";
import {
  recordEnrollmentEvent,
  type RequestFingerprint,
} from "./reviewerEnrollment";
import {
  REVIEWER_SESSION_TTL_MS,
  signReviewerSession,
  verifyReviewerSession,
} from "./reviewerPin";
import {
  isQaStaffReviewPartner,
  QA_STAFF_REVIEWER_EMAIL,
  TMT_DIRECT_STAFF_REVIEWERS,
} from "./staffReviewRoster";

export const STAFF_REVIEW_INVITATION_COOKIE_PATH = "/";
export const STAFF_REVIEW_SESSION_ROUTE_TOKEN = "session";

const TOKEN_BYTES = 32;
const CSRF_TTL_MS = 15 * 60 * 1000;
const DEFAULT_INVITATION_DAYS = 21;
const REENTRY_INVITATION_TTL_MS = 30 * 60 * 1000;
const REENTRY_EMPLOYEE_HOURLY_LIMIT = 3;
const REENTRY_EMPLOYEE_DAILY_LIMIT = 10;
const REENTRY_PARTNER_DAILY_LIMIT = 30;

export const SELF_SERVICE_REENTRY_ISSUED_BY = "self-service-reentry";
export const STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE =
  "If that address is on the reviewer list, a sign-in link is on its way. It expires in 30 minutes.";
export const STAFF_REVIEW_REENTRY_RATE_LIMIT_MESSAGE =
  "You've asked for a few links already. Try again in an hour, or ask Jon.";

export const CANONICAL_TMT_STAFF_INVITE_RECIPIENTS = [
  ...TMT_DIRECT_STAFF_REVIEWERS,
] as const;

export const QA_STAFF_REVIEW_INVITE_RECIPIENT = {
  displayName: "QA Reviewer",
  email: QA_STAFF_REVIEWER_EMAIL,
} as const;

export class StaffReviewInvitationPartnerScopeError extends Error {
  readonly code = "qa_partner_scope_refused";
  readonly statusCode = 403;

  constructor() {
    super("qaOnly is only allowed for the QA staff review partner.");
    this.name = "StaffReviewInvitationPartnerScopeError";
  }
}

export type StaffInviteState =
  | "ready"
  | "expired"
  | "revoked"
  | "used"
  | "invalid";

export interface StaffInvitePreview {
  id: string;
  status: string;
  partnerId: string;
  employeeId: string;
  displayName: string;
  emailMasked: string;
  expiresAt: Date;
  csrfToken: string;
  state: StaffInviteState;
}

interface InvitationWithEmployee {
  id: string;
  partnerId: string;
  employeeId: string;
  emailNormalized: string;
  tokenHash: string;
  status: string;
  expiresAt: Date;
  revokedAt: Date | null;
  confirmedAt: Date | null;
  employee: {
    id: string;
    partnerId: string;
    name: string;
    email: string;
    active: boolean;
    optedOut: boolean;
  };
}

export function createStaffReviewInvitationToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashStaffReviewInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function redactedTokenHash(token: string): string {
  return hashStaffReviewInvitationToken(token).slice(0, 12);
}

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is required for staff review invitations");
  return value;
}

function hmac(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createInvitationCsrfToken(input: {
  invitationId: string;
  tokenHash: string;
  now?: number;
}): string {
  const issuedAt = input.now ?? Date.now();
  const payload = `${input.invitationId}.${input.tokenHash}.${issuedAt}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyInvitationCsrfToken(input: {
  csrfToken: string;
  invitationId: string;
  tokenHash: string;
  now?: number;
}): boolean {
  const parts = input.csrfToken.split(".");
  if (parts.length !== 4) return false;
  const [invitationId, tokenHash, issuedAtRaw, mac] = parts;
  if (invitationId !== input.invitationId || tokenHash !== input.tokenHash) return false;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return false;
  if ((input.now ?? Date.now()) - issuedAt > CSRF_TTL_MS) return false;
  const expected = hmac(`${invitationId}.${tokenHash}.${issuedAtRaw}`);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function maskEmail(email: string): string {
  const normalized = normalizeEmployeeEmail(email);
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "email on file";
  const visible = local.length <= 2 ? local[0] ?? "" : `${local[0]}${local[local.length - 1]}`;
  return `${visible.padEnd(Math.min(local.length, 2), "*")}@${domain}`;
}

function invitationState(invitation: InvitationWithEmployee, now = new Date()): StaffInviteState {
  if (invitation.revokedAt || invitation.status === "revoked") return "revoked";
  if (invitation.status === "expired" || invitation.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  if (invitation.status === "confirmed" || invitation.confirmedAt) return "used";
  if (invitation.status !== "pending") return "invalid";
  if (!invitation.employee.active || invitation.employee.optedOut) return "invalid";
  if (invitation.employee.partnerId !== invitation.partnerId) return "invalid";
  if (normalizeEmployeeEmail(invitation.employee.email) !== invitation.emailNormalized) {
    return "invalid";
  }
  return "ready";
}

export async function getStaffInvitePreview(token: string): Promise<StaffInvitePreview | null> {
  const tokenHash = hashStaffReviewInvitationToken(token);
  const invitation = await prisma.staffReviewInvitation.findUnique({
    where: { tokenHash },
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
  });
  if (!invitation) return null;
  const state = invitationState(invitation);
  return {
    id: invitation.id,
    status: invitation.status,
    partnerId: invitation.partnerId,
    employeeId: invitation.employeeId,
    displayName: invitation.employee.name,
    emailMasked: maskEmail(invitation.emailNormalized),
    expiresAt: invitation.expiresAt,
    csrfToken: createInvitationCsrfToken({ invitationId: invitation.id, tokenHash }),
    state,
  };
}

export type ConfirmInvitationResult =
  | { ok: true; status: "confirmed" | "already_confirmed"; redirectPath: string; cookieValue: string; maxAge: number }
  | { ok: false; status: number; code: string; message: string };

function fail(status: number, code: string, message = "This invitation cannot be used."): ConfirmInvitationResult {
  return { ok: false, status, code, message };
}

async function sameEmployeeSessionFromCookie(input: {
  cookieValue: string | undefined;
  invitationId: string;
  employeeId: string;
}) {
  if (!input.cookieValue) return null;
  const sessions = await prisma.staffReviewSession.findMany({
    where: {
      invitationId: input.invitationId,
      employeeId: input.employeeId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, employeeId: true },
  });
  for (const session of sessions) {
    const verified = verifyReviewerSession(input.cookieValue, {
      tokenId: session.id,
      secret: secret(),
    });
    if (verified.ok && verified.employeeId === input.employeeId) return session;
  }
  return null;
}

export async function confirmStaffReviewInvitation(input: {
  token: string;
  email: string;
  csrfToken: string;
  cookieValue?: string;
}): Promise<ConfirmInvitationResult> {
  const tokenHash = hashStaffReviewInvitationToken(input.token);
  const email = normalizeEmployeeEmail(input.email);
  const now = new Date();
  const invitation = await prisma.staffReviewInvitation.findUnique({
    where: { tokenHash },
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
  });

  if (!invitation) return fail(404, "not_found");
  if (
    !verifyInvitationCsrfToken({
      csrfToken: input.csrfToken,
      invitationId: invitation.id,
      tokenHash,
    })
  ) {
    return fail(403, "csrf", "This page expired. Reload and try again.");
  }

  if (email !== invitation.emailNormalized) {
    console.warn("[staff-review-invite] wrong email refused", {
      invitationId: invitation.id,
      partnerId: invitation.partnerId,
      employeeId: invitation.employeeId,
      tokenHashPrefix: redactedTokenHash(input.token),
    });
    return fail(403, "wrong_email");
  }

  const state = invitationState(invitation, now);
  if (state === "used") {
    const existing = await sameEmployeeSessionFromCookie({
      cookieValue: input.cookieValue,
      invitationId: invitation.id,
      employeeId: invitation.employeeId,
    });
    if (existing) {
      return {
        ok: true,
        status: "already_confirmed",
        redirectPath: `/staff/catalog/${STAFF_REVIEW_SESSION_ROUTE_TOKEN}`,
        cookieValue: input.cookieValue!,
        maxAge: Math.floor(REVIEWER_SESSION_TTL_MS / 1000),
      };
    }
    return fail(
      200,
      "reentry_offered",
      "This invitation was already used. Enter your email and we'll send a fresh one."
    );
  }
  if (state === "expired") {
    return fail(
      410,
      "expired",
      "This invitation expired. Enter your email below and we'll send a fresh link."
    );
  }
  if (state === "revoked") {
    return fail(410, "revoked", "This invitation was cancelled. Ask Jon for a new one.");
  }
  if (state !== "ready") return fail(403, "invalid");

  const sessionRaw = createStaffReviewInvitationToken();
  const sessionHash = hashStaffReviewInvitationToken(sessionRaw);
  const expiresAt = new Date(now.getTime() + REVIEWER_SESSION_TTL_MS);

  const confirmed = await prisma.$transaction(async (tx) => {
    const consumed = await tx.staffReviewInvitation.updateMany({
      where: {
        id: invitation.id,
        status: "pending",
        confirmedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        status: "confirmed",
        confirmedAt: now,
        openedAt: now,
        lastOpenedAt: now,
      },
    });
    if (consumed.count !== 1) return null;
    return tx.staffReviewSession.create({
      data: {
        partnerId: invitation.partnerId,
        employeeId: invitation.employeeId,
        invitationId: invitation.id,
        sessionHash,
        issuedAt: now,
        expiresAt,
        lastSeenAt: now,
      },
      select: { id: true },
    });
  });

  if (!confirmed) {
    return fail(
      409,
      "replayed",
      "This link was just used. Enter your email and we'll send a fresh one."
    );
  }

  if (invitation.issuedBy === SELF_SERVICE_REENTRY_ISSUED_BY) {
    await recordEnrollmentEvent(prisma, {
      partnerId: invitation.partnerId,
      employeeId: invitation.employeeId,
      employeeName: invitation.employee.name,
      employeeEmail: invitation.emailNormalized,
      eventType: "reentry_confirmed",
      actorType: "reentry",
      actorIdentity: invitation.emailNormalized,
      reason: `invitation:${invitation.id}`,
    });
  }

  return {
    ok: true,
    status: "confirmed",
    redirectPath: `/staff/catalog/${STAFF_REVIEW_SESSION_ROUTE_TOKEN}`,
    cookieValue: signReviewerSession({
      employeeId: invitation.employeeId,
      tokenId: confirmed.id,
      issuedAt: now.getTime(),
      secret: secret(),
    }),
    maxAge: Math.floor(REVIEWER_SESSION_TTL_MS / 1000),
  };
}

export type StaffReviewReentryResult =
  | {
      ok: true;
      status: 202;
      message: typeof STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE;
      afterResponse?: () => Promise<void>;
    }
  | {
      ok: false;
      status: 429;
      code: "too_many_requests";
      message: typeof STAFF_REVIEW_REENTRY_RATE_LIMIT_MESSAGE;
      retryAfter: number;
    };

interface ReentryInvitationCandidate {
  id: string;
  partnerId: string;
  employeeId: string;
  emailNormalized: string;
  employee: {
    id: string;
    partnerId: string;
    name: string;
    email: string;
    active: boolean;
    optedOut: boolean;
  };
}

function validEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function retryAfterSeconds(oldest: Date, windowMs: number, now: Date): number {
  return Math.max(1, Math.ceil((oldest.getTime() + windowMs - now.getTime()) / 1000));
}

async function rateLimitRetryAfter(input: {
  partnerId: string;
  employeeId: string;
  now: Date;
}): Promise<number | null> {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const hourStart = new Date(input.now.getTime() - hourMs);
  const dayStart = new Date(input.now.getTime() - dayMs);
  const baseWhere = { issuedBy: SELF_SERVICE_REENTRY_ISSUED_BY };

  const [employeeHour, employeeDay, partnerDay] = await Promise.all([
    prisma.staffReviewInvitation.findMany({
      where: { ...baseWhere, employeeId: input.employeeId, issuedAt: { gte: hourStart } },
      orderBy: { issuedAt: "asc" },
      select: { issuedAt: true },
    }),
    prisma.staffReviewInvitation.findMany({
      where: { ...baseWhere, employeeId: input.employeeId, issuedAt: { gte: dayStart } },
      orderBy: { issuedAt: "asc" },
      select: { issuedAt: true },
    }),
    prisma.staffReviewInvitation.findMany({
      where: { ...baseWhere, partnerId: input.partnerId, issuedAt: { gte: dayStart } },
      orderBy: { issuedAt: "asc" },
      select: { issuedAt: true },
    }),
  ]);

  if (employeeHour.length >= REENTRY_EMPLOYEE_HOURLY_LIMIT) {
    return retryAfterSeconds(employeeHour[0].issuedAt, hourMs, input.now);
  }
  if (employeeDay.length >= REENTRY_EMPLOYEE_DAILY_LIMIT) {
    return retryAfterSeconds(employeeDay[0].issuedAt, dayMs, input.now);
  }
  if (partnerDay.length >= REENTRY_PARTNER_DAILY_LIMIT) {
    console.warn("[staff-review-reentry] partner daily cap exceeded", {
      partnerId: input.partnerId,
      count: partnerDay.length,
    });
    return retryAfterSeconds(partnerDay[0].issuedAt, dayMs, input.now);
  }
  return null;
}

function inviteEmail(input: { displayName: string; inviteUrl: string }) {
  const displayName = escapeHtml(input.displayName);
  const inviteUrl = escapeHtml(input.inviteUrl);
  const text = [
    `Hi ${input.displayName},`,
    "",
    "Here is your fresh one-time staff review sign-in link for The Mushroom Top:",
    input.inviteUrl,
    "",
    "It expires in 30 minutes and can only be used once.",
    "Signing in on another phone or computer later? You can request another fresh link from the invitation page.",
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 28px;">
      <p>Hi ${displayName},</p>
      <p>Here is your fresh one-time staff review sign-in link for The Mushroom Top.</p>
      <p><a href="${inviteUrl}" style="display:inline-block;background:#171717;color:#ffffff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600;">Open staff review</a></p>
      <p>This link expires in 30 minutes and can only be used once.</p>
      <p>Signing in on another phone or computer later? You can request another fresh link from the invitation page.</p>
    </div>
  `;
  return { subject: "Your fresh staff review sign-in link", text, html };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

async function sendStaffReviewReentryInvitation(input: {
  invitationId: string;
  partnerId: string;
  employeeId: string;
  displayName: string;
  emailNormalized: string;
  inviteUrl: string;
  fingerprint?: RequestFingerprint;
}) {
  const email = inviteEmail({ displayName: input.displayName, inviteUrl: input.inviteUrl });
  await sendEmail({
    to: input.emailNormalized,
    from: DEFAULT_EMAIL_FROM_ADDRESS,
    replyTo: DEFAULT_EMAIL_REPLY_TO_ADDRESS,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `staff-review-reentry:${input.invitationId}`,
  });
  await recordEnrollmentEvent(prisma, {
    partnerId: input.partnerId,
    employeeId: input.employeeId,
    employeeName: input.displayName,
    employeeEmail: input.emailNormalized,
    eventType: "reentry_sent",
    actorType: "reentry",
    actorIdentity: input.emailNormalized,
    reason: `invitation:${input.invitationId}`,
    ip: input.fingerprint?.ip ?? null,
    userAgent: input.fingerprint?.userAgent ?? null,
  });
}

export async function requestStaffReviewReentry(input: {
  email: string;
  requestOrigin?: string;
  fingerprint?: RequestFingerprint;
  now?: Date;
}): Promise<StaffReviewReentryResult> {
  const emailNormalized = normalizeEmployeeEmail(input.email);
  if (!validEmailAddress(emailNormalized)) {
    return {
      ok: true,
      status: 202,
      message: STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE,
    };
  }

  const now = input.now ?? new Date();
  const candidate = await prisma.staffReviewInvitation.findFirst({
    where: {
      emailNormalized,
      revokedAt: null,
      status: { not: "revoked" },
    },
    orderBy: { issuedAt: "desc" },
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
  }) as ReentryInvitationCandidate | null;

  if (
    !candidate ||
    !candidate.employee.active ||
    candidate.employee.optedOut ||
    candidate.employee.partnerId !== candidate.partnerId ||
    normalizeEmployeeEmail(candidate.employee.email) !== candidate.emailNormalized
  ) {
    return {
      ok: true,
      status: 202,
      message: STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE,
    };
  }

  const retryAfter = await rateLimitRetryAfter({
    partnerId: candidate.partnerId,
    employeeId: candidate.employeeId,
    now,
  });
  if (retryAfter !== null) {
    return {
      ok: false,
      status: 429,
      code: "too_many_requests",
      message: STAFF_REVIEW_REENTRY_RATE_LIMIT_MESSAGE,
      retryAfter,
    };
  }

  const rawToken = createStaffReviewInvitationToken();
  const tokenHash = hashStaffReviewInvitationToken(rawToken);
  const expiresAt = new Date(now.getTime() + REENTRY_INVITATION_TTL_MS);
  const invitation = await prisma.staffReviewInvitation.create({
    data: {
      partnerId: candidate.partnerId,
      employeeId: candidate.employeeId,
      emailNormalized: candidate.emailNormalized,
      tokenHash,
      status: "pending",
      expiresAt,
      issuedBy: SELF_SERVICE_REENTRY_ISSUED_BY,
      issuedAt: now,
    },
    select: { id: true },
  });
  await recordEnrollmentEvent(prisma, {
    partnerId: candidate.partnerId,
    employeeId: candidate.employeeId,
    employeeName: candidate.employee.name,
    employeeEmail: candidate.emailNormalized,
    eventType: "reentry_requested",
    actorType: "reentry",
    actorIdentity: candidate.emailNormalized,
    reason: `sourceInvitation:${candidate.id}; invitation:${invitation.id}`,
    ip: input.fingerprint?.ip ?? null,
    userAgent: input.fingerprint?.userAgent ?? null,
  });

  return {
    ok: true,
    status: 202,
    message: STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE,
    afterResponse: async () => {
      try {
        await sendStaffReviewReentryInvitation({
          invitationId: invitation.id,
          partnerId: candidate.partnerId,
          employeeId: candidate.employeeId,
          displayName: candidate.employee.name,
          emailNormalized: candidate.emailNormalized,
          inviteUrl: inviteUrl(rawToken, input.requestOrigin),
          fingerprint: input.fingerprint,
        });
      } catch (error) {
        await recordEnrollmentEvent(prisma, {
          partnerId: candidate.partnerId,
          employeeId: candidate.employeeId,
          employeeName: candidate.employee.name,
          employeeEmail: candidate.emailNormalized,
          eventType: "reentry_send_failed",
          actorType: "reentry",
          actorIdentity: candidate.emailNormalized,
          reason: `invitation:${invitation.id}; error:${error instanceof Error ? error.message : String(error)}`,
          ip: input.fingerprint?.ip ?? null,
          userAgent: input.fingerprint?.userAgent ?? null,
        });
        throw error;
      }
    },
  };
}

export type StaffReviewSessionValidation =
  | {
      ok: true;
      sessionId: string;
      partnerId: string;
      employeeId: string;
      employeeName: string;
      employeeEmail: string;
      issuedAt: number;
    }
  | { ok: false };

export async function validateStaffReviewSessionCookie(
  cookieValue: string | undefined
): Promise<StaffReviewSessionValidation> {
  if (!cookieValue) return { ok: false };
  const sessionId = cookieValue.split(".")[1];
  if (!sessionId) return { ok: false };
  const verified = verifyReviewerSession(cookieValue, {
    tokenId: sessionId,
    secret: secret(),
  });
  if (!verified.ok) return { ok: false };

  const session = await prisma.staffReviewSession.findUnique({
    where: { id: sessionId },
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
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return { ok: false };
  if (session.employeeId !== verified.employeeId) return { ok: false };
  if (!session.employee.active || session.employee.optedOut) return { ok: false };
  if (session.employee.partnerId !== session.partnerId) return { ok: false };

  return {
    ok: true,
    sessionId: session.id,
    partnerId: session.partnerId,
    employeeId: session.employeeId,
    employeeName: session.employee.name,
    employeeEmail: session.employee.email,
    issuedAt: verified.issuedAt,
  };
}

export function setStaffReviewSessionCookie(
  response: NextResponse,
  value: string,
  maxAge: number
): void {
  response.cookies.set("tmt_reviewer", value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: STAFF_REVIEW_INVITATION_COOKIE_PATH,
    maxAge,
  });
}

function inviteUrl(token: string, requestOrigin?: string): string {
  const configured = process.env.NEXTAUTH_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = configured
    ? configured.startsWith("http")
      ? configured
      : `https://${configured}`
    : (requestOrigin ?? "http://localhost:3000");
  return `${base.replace(/\/$/, "")}/staff-review/invite/${token}`;
}

export async function prepareCanonicalStaffReviewInvitationBatch(input: {
  partnerId: string;
  issuedBy: string;
  requestOrigin?: string;
  expiresInDays?: number;
  qaOnly?: boolean;
}) {
  if (input.qaOnly && !isQaStaffReviewPartner(input.partnerId)) {
    throw new StaffReviewInvitationPartnerScopeError();
  }

  const partner = await prisma.partner.findUnique({
    where: { id: input.partnerId },
    select: { id: true, name: true },
  });
  if (!partner) throw new Error("Partner not found");

  const expiresInDays = Number.isFinite(input.expiresInDays)
    ? Math.max(1, Math.min(90, Math.round(input.expiresInDays!)))
    : DEFAULT_INVITATION_DAYS;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  if (!input.qaOnly) {
    return {
      partner: { id: partner.id, name: partner.name },
      status: "UNSENT DRAFT" as const,
      send: false,
      previewOnly: true,
      recipients: CANONICAL_TMT_STAFF_INVITE_RECIPIENTS.map((recipient) => {
        const emailNormalized = normalizeEmployeeEmail(recipient.email);
        return {
          displayName: recipient.displayName,
          email: emailNormalized,
          emailMasked: maskEmail(emailNormalized),
          employeeId: null,
          invitationId: null,
          status: "UNSENT DRAFT",
          url: null,
          tokenPreview: null,
          tokenHashPrefix: null,
          expiresAt: null,
          error: "Preview only; no invitation generated before Jon approval",
        };
      }),
    };
  }

  const invitations = [];
  for (const recipient of [QA_STAFF_REVIEW_INVITE_RECIPIENT]) {
    const emailNormalized = normalizeEmployeeEmail(recipient.email);
    const rawToken = createStaffReviewInvitationToken();
    const tokenHash = hashStaffReviewInvitationToken(rawToken);
    const record = await prisma.$transaction(async (tx) => {
      const employee = await tx.mycoEmployee.upsert({
        where: { partnerId_email: { partnerId: partner.id, email: emailNormalized } },
        update: { name: recipient.displayName },
        create: {
          partnerId: partner.id,
          name: recipient.displayName,
          email: emailNormalized,
          active: true,
        },
        select: { id: true, name: true, email: true, optedOut: true, active: true },
      });
      if (employee.optedOut || !employee.active) {
        return { employee, invitation: null };
      }

      const pendingInvitations = await tx.staffReviewInvitation.findMany({
        where: {
          partnerId: partner.id,
          employeeId: employee.id,
          status: "pending",
          revokedAt: null,
        },
        select: { id: true },
      });

      await tx.staffReviewInvitation.updateMany({
        where: {
          partnerId: partner.id,
          employeeId: employee.id,
          status: "pending",
          revokedAt: null,
        },
        data: {
          status: "revoked",
          revokedAt: new Date(),
          revokedBy: input.issuedBy,
          revocationReason: "reissued by KEWL-2912 unsent preview",
        },
      });
      if (pendingInvitations.length > 0) {
        await tx.staffReviewInviteBatchRecipient.updateMany({
          where: {
            invitationId: { in: pendingInvitations.map((invitation) => invitation.id) },
            sendStatus: { in: ["pending", "claimed", "provider_failed"] },
            batch: { status: { in: ["approved", "sending", "partially_sent"] } },
          },
          data: {
            sendStatus: "validation_failed",
            validationFailureCode: "revoked",
            validationFailureEvidence: {
              reason: "invitation reissued by staff invitation preview",
              invalidatedAt: new Date().toISOString(),
            },
          },
        });
      }

      const invitation = await tx.staffReviewInvitation.create({
        data: {
          partnerId: partner.id,
          employeeId: employee.id,
          emailNormalized,
          tokenHash,
          status: "pending",
          expiresAt,
          issuedBy: input.issuedBy,
        },
        select: { id: true, expiresAt: true },
      });
      return { employee, invitation };
    });

    invitations.push({
      displayName: recipient.displayName,
      email: emailNormalized,
      emailMasked: maskEmail(emailNormalized),
      employeeId: record.employee.id,
      invitationId: record.invitation?.id ?? null,
      status: record.invitation ? "UNSENT DRAFT" : "SKIPPED",
      url: record.invitation ? inviteUrl(rawToken, input.requestOrigin) : null,
      tokenPreview: record.invitation ? `${rawToken.slice(0, 6)}…${rawToken.slice(-4)}` : null,
      tokenHashPrefix: redactedTokenHash(rawToken),
      expiresAt: record.invitation?.expiresAt ?? null,
      error: record.invitation ? null : "Employee inactive or opted out",
    });
  }

  return {
    partner: { id: partner.id, name: partner.name },
    status: "UNSENT DRAFT" as const,
    send: false,
    recipients: invitations,
  };
}
