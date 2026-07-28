/**
 * KEWL-2335 — no-login staff link auth.
 *
 * Two independent factors, neither of which is an account:
 *  1. The link itself — a KEWL-2332 `CatalogAccessToken` with purpose `staff_review`,
 *     revocable and expirable. Only the SHA-256 hash is stored. Each link is issued to
 *     exactly ONE reviewer (`issuedToId`), so possession of a link is possession of that
 *     reviewer's identity claim and nothing else.
 *  2. A 4-digit PIN, which protects the link once it has been forwarded or left open on a
 *     counter tablet, and makes Tier B's distinct-reviewer rule mean something.
 *
 * KEWL-2364 (Architecture Guardian) rejected the earlier shared-roster design: with one
 * link for the whole store, any holder could select any reviewer who had not yet set a
 * PIN and enroll one for them — an unauthenticated identity claim, not merely a weak PIN.
 * Reviewer identity is therefore derived from the link and NEVER from client input.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateCatalogAccessToken, hashCatalogAccessToken } from "./catalogTokens";
import { verifyReviewerSession } from "./reviewerPin";

export const REVIEWER_SESSION_COOKIE = "tmt_reviewer";

export function reviewerSessionSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to sign reviewer sessions");
  return secret;
}

export type StaffLinkResult =
  | { ok: true; tokenId: string; partnerId: string; issuedToId: string | null }
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
    partnerId: state.partnerId,
    issuedToId: record!.issuedToId ?? null,
  };
}

export interface BoundReviewer {
  id: string;
  name: string;
  hasPin: boolean;
  pinHash: string | null;
  pinFailedAttempts: number;
  pinLockedUntil: Date | null;
}

export type BoundLinkResult =
  | { ok: true; tokenId: string; partnerId: string; reviewer: BoundReviewer }
  | { ok: false; response: NextResponse };

/**
 * Resolves the ONE reviewer a staff link was issued to.
 *
 * Fails closed on an unbound link. There is deliberately no shared-link fallback: a
 * `staff_review` token with no `issuedToId` cannot identify anybody, so honouring it
 * would reintroduce exactly the identity-claim hole KEWL-2364 flagged. Any legacy
 * shared link stops working and must be re-minted per reviewer.
 */
export async function resolveBoundReviewer(token: string): Promise<BoundLinkResult> {
  const link = await resolveStaffLink(token);
  if (!link.ok) return link;

  if (!link.issuedToId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: {
            message: "This link isn't set up for a specific reviewer. Ask for your own link.",
            code: "link_not_bound",
          },
        },
        { status: 410 }
      ),
    };
  }

  const employee = await prisma.mycoEmployee.findFirst({
    where: {
      id: link.issuedToId,
      partnerId: link.partnerId,
      active: true,
      optedOut: false,
    },
    select: {
      id: true,
      name: true,
      pinHash: true,
      pinFailedAttempts: true,
      pinLockedUntil: true,
    },
  });
  if (!employee) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: { message: "This staff link is no longer active.", code: "reviewer_inactive" },
        },
        { status: 410 }
      ),
    };
  }

  return {
    ok: true,
    tokenId: link.tokenId,
    partnerId: link.partnerId,
    reviewer: {
      id: employee.id,
      name: employee.name,
      hasPin: Boolean(employee.pinHash),
      pinHash: employee.pinHash,
      pinFailedAttempts: employee.pinFailedAttempts,
      pinLockedUntil: employee.pinLockedUntil,
    },
  };
}

export type ReviewerResult =
  | { ok: true; tokenId: string; partnerId: string; employeeId: string; employeeName: string }
  | { ok: false; response: NextResponse };

function pinRequired(message = "Enter your PIN."): NextResponse {
  return NextResponse.json(
    { success: false, error: { message, code: "pin_required" } },
    { status: 401 }
  );
}

/**
 * Full gate for every write and every data read: a link bound to an active reviewer AND a
 * signed session minted from that same link for that same reviewer.
 */
export async function requireReviewer(
  token: string,
  cookieValue: string | undefined
): Promise<ReviewerResult> {
  const bound = await resolveBoundReviewer(token);
  if (!bound.ok) return bound;

  const session = verifyReviewerSession(cookieValue, {
    tokenId: bound.tokenId,
    secret: reviewerSessionSecret(),
  });
  if (!session.ok) return { ok: false, response: pinRequired() };

  // The session is already HMAC'd and bound to this token, so this can only diverge if a
  // link was re-issued to a different reviewer. Identity still comes from the link.
  if (session.employeeId !== bound.reviewer.id) {
    return { ok: false, response: pinRequired("Enter your PIN again.") };
  }

  return {
    ok: true,
    tokenId: bound.tokenId,
    partnerId: bound.partnerId,
    employeeId: bound.reviewer.id,
    employeeName: bound.reviewer.name,
  };
}
