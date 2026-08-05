import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeEmployeeEmail } from "./employeeReviews";
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
    return fail(403, "csrf");
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
    return fail(409, "already_confirmed", "This invitation was already used. Ask Jon for a new link.");
  }
  if (state !== "ready") return fail(state === "expired" || state === "revoked" ? 410 : 403, state);

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

  if (!confirmed) return fail(409, "replayed", "This invitation was already used. Ask Jon for a new link.");

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
