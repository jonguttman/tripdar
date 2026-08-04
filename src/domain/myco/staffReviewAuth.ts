/**
 * KEWL-2335 — no-login staff link auth.
 *
 * Two independent factors, neither of which is an account:
 *  1. The link itself — a KEWL-2332 `CatalogAccessToken` with purpose `staff_review`,
 *     revocable and expirable. Only the SHA-256 hash is stored.
 *  2. A 4-digit PIN identifying WHICH reviewer is filing, so Tier B's distinct-reviewer
 *     rule means something.
 *
 * KEWL-2379 — ONE SHARED LINK, per Jon's 2026-07-28 override of KEWL-2364's per-reviewer
 * binding ("make it so they all have to pick their pin the first time they click the link").
 * Reviewer identity is therefore client-supplied again, and the honest reading is that
 * possession of the link plus an unclaimed name is enough to claim that name. That is
 * bounded, not trusted — see `reviewerEnrollment.ts`: the claim only works inside an
 * admin-controlled window, it auto-closes at full roster coverage, and every attempt is
 * logged. Jon owns this trade-off explicitly (six known staff at one shop, link not public,
 * no money and no customer PII behind it).
 *
 * Once a PIN is set, identity is the PIN — a name with a PIN cannot be taken by anyone who
 * doesn't know it, and a set PIN is never overwritable without a logged admin reset.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateCatalogAccessToken, hashCatalogAccessToken } from "./catalogTokens";
import { verifyReviewerSession } from "./reviewerPin";
import { isEnrollmentOpen, isReviewerSessionStale } from "./reviewerEnrollment";
import { staffReviewerWhere } from "./staffReviewRoster";
import {
  STAFF_REVIEW_SESSION_ROUTE_TOKEN,
  validateStaffReviewSessionCookie,
} from "./staffReviewInvitations";

export const REVIEWER_SESSION_COOKIE = "tmt_reviewer";

export function reviewerSessionSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to sign reviewer sessions");
  return secret;
}

export type StaffLinkResult =
  | {
      ok: true;
      tokenId: string;
      kind: "catalog_token" | "staff_session";
      partnerId: string;
      issuedToId: string | null;
      enrollmentOpen: boolean;
      enrollmentClosesAt: Date | null;
    }
  | { ok: false; response: NextResponse };

function linkFailure(reason: string): NextResponse {
  // Revoked/expired links say so; anything else is indistinguishable from a bad guess.
  const status = reason === "expired" || reason === "revoked" ? 410 : 404;
  const message =
    status === 410 ? "This staff link is no longer active." : "Staff link not found.";
  return NextResponse.json({ success: false, error: { message } }, { status });
}

export async function resolveStaffLink(token: string): Promise<StaffLinkResult> {
  const record = await prisma.catalogAccessToken.findUnique({
    where: { tokenHash: hashCatalogAccessToken(token) },
  });
  const state = evaluateCatalogAccessToken(record, "staff_review");
  if (!state.ok) return { ok: false, response: linkFailure(state.reason) };
  return {
    ok: true,
    tokenId: record!.id,
    kind: "catalog_token",
    partnerId: state.partnerId,
    issuedToId: record!.issuedToId ?? null,
    enrollmentOpen: isEnrollmentOpen({
      enrollmentOpen: record!.enrollmentOpen,
      enrollmentClosesAt: record!.enrollmentClosesAt,
    }),
    enrollmentClosesAt: record!.enrollmentClosesAt ?? null,
  };
}

export interface RosterReviewer {
  id: string;
  name: string;
  email: string;
  hasPin: boolean;
  pinHash: string | null;
  pinSetAt: Date | null;
  pinFailedAttempts: number;
  pinLockedUntil: Date | null;
}

export type RosterResult =
  | {
      ok: true;
      tokenId: string;
      kind: "catalog_token" | "staff_session";
      partnerId: string;
      enrollmentOpen: boolean;
      enrollmentClosesAt: Date | null;
      reviewers: RosterReviewer[];
    }
  | { ok: false; response: NextResponse };

/**
 * The roster a link can act as.
 *
 * Normally the whole approved roster — that is the shared link Jon asked for. If a token
 * still carries `issuedToId` (the per-reviewer links minted earlier on 2026-07-28, before
 * the override), the roster is NARROWED to that one person. Honouring the binding can only
 * ever restrict a link, never widen one, so an already-issued link cannot silently gain
 * authority over the rest of the roster when this ships.
 *
 * "Approved roster" is `staffReviewerWhere`, not every active employee (KEWL-2402). Under a
 * shared, unbound token this query IS the authorization boundary — whoever it returns is
 * claimable by anyone holding the link — so it stays pinned to the six addresses Jon
 * approved rather than to whatever a future employee import happens to mark active.
 */
export async function resolveReviewerRoster(
  token: string,
  cookieValue?: string
): Promise<RosterResult> {
  if (token === STAFF_REVIEW_SESSION_ROUTE_TOKEN) {
    const session = await validateStaffReviewSessionCookie(cookieValue);
    if (!session.ok) return { ok: false, response: pinRequired("Open your personal invite link again.") };
    return {
      ok: true,
      tokenId: session.sessionId,
      kind: "staff_session",
      partnerId: session.partnerId,
      enrollmentOpen: false,
      enrollmentClosesAt: null,
      reviewers: [
        {
          id: session.employeeId,
          name: session.employeeName,
          email: session.employeeEmail,
          hasPin: true,
          pinHash: null,
          pinSetAt: null,
          pinFailedAttempts: 0,
          pinLockedUntil: null,
        },
      ],
    };
  }

  const link = await resolveStaffLink(token);
  if (!link.ok) return link;

  const reviewers = await prisma.mycoEmployee.findMany({
    where: staffReviewerWhere(link.partnerId, link.issuedToId ?? undefined),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      pinHash: true,
      pinSetAt: true,
      pinFailedAttempts: true,
      pinLockedUntil: true,
    },
  });

  if (reviewers.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: { message: "This staff link is no longer active.", code: "roster_empty" },
        },
        { status: 410 }
      ),
    };
  }

  return {
    ok: true,
    tokenId: link.tokenId,
    kind: link.kind,
    partnerId: link.partnerId,
    enrollmentOpen: link.enrollmentOpen,
    enrollmentClosesAt: link.enrollmentClosesAt,
    reviewers: reviewers.map((reviewer) => ({
      ...reviewer,
      hasPin: Boolean(reviewer.pinHash),
    })),
  };
}

export type ReviewerResult =
  | { ok: true; tokenId: string; partnerId: string; employeeId: string; employeeName: string }
  | { ok: false; response: NextResponse };

function pinRequired(message = "Pick your name and enter your PIN."): NextResponse {
  return NextResponse.json(
    { success: false, error: { message, code: "pin_required" } },
    { status: 401 }
  );
}

/**
 * Full gate for every write and every data read: a valid link AND a signed session minted
 * from that same link, for a reviewer who is still on that link's roster and whose PIN has
 * not been reset since the session was signed.
 */
export async function requireReviewer(
  token: string,
  cookieValue: string | undefined
): Promise<ReviewerResult> {
  if (token === STAFF_REVIEW_SESSION_ROUTE_TOKEN) {
    const session = await validateStaffReviewSessionCookie(cookieValue);
    if (!session.ok) return { ok: false, response: pinRequired("Open your personal invite link again.") };
    return {
      ok: true,
      tokenId: session.sessionId,
      partnerId: session.partnerId,
      employeeId: session.employeeId,
      employeeName: session.employeeName,
    };
  }

  const roster = await resolveReviewerRoster(token);
  if (!roster.ok) return roster;

  const session = verifyReviewerSession(cookieValue, {
    tokenId: roster.tokenId,
    secret: reviewerSessionSecret(),
  });
  if (!session.ok) return { ok: false, response: pinRequired() };

  const reviewer = roster.reviewers.find((entry) => entry.id === session.employeeId);
  // Not on this link's roster any more — deactivated, opted out, or the link was narrowed.
  if (!reviewer) return { ok: false, response: pinRequired() };

  // An admin PIN reset clears `pinSetAt`, which retires every session signed before it.
  // This is the revocation half of "reset a single reviewer's PIN".
  if (isReviewerSessionStale({ sessionIssuedAt: session.issuedAt, pinSetAt: reviewer.pinSetAt })) {
    return { ok: false, response: pinRequired("Your PIN was reset. Set a new one.") };
  }

  return {
    ok: true,
    tokenId: roster.tokenId,
    partnerId: roster.partnerId,
    employeeId: reviewer.id,
    employeeName: reviewer.name,
  };
}
