/**
 * KEWL-2335 / KEWL-2394 — no-login staff link auth.
 *
 * Two independent factors, neither of which is an account:
 *  1. The link itself — a KEWL-2332 `CatalogAccessToken` with purpose `staff_review`,
 *     revocable and expirable. Only the SHA-256 hash is stored.
 *  2. A 4-digit PIN, chosen by each reviewer the first time they open the link, which
 *     is what keeps their reviews filed under their own name once the link has been
 *     forwarded or left open on a counter tablet.
 *
 * KEWL-2364 had made every link bind to exactly one reviewer. Jon overrode that on
 * 2026-07-28 (*"make it so they all have to pick their pin the first time they click the
 * link. I don't want to deal with emails for this."*), so ONE shared link now serves the
 * whole roster and an unbound token is the supported case, not an error.
 *
 * What replaces link-binding as the bound on identity claims is `staffEnrollment.ts`: a
 * name can only be claimed while the mint-time enrollment window is open, claiming is a
 * one-way compare-and-set, and every attempt is on the append-only ledger. Read the
 * header of that module for why that is the right trade rather than a weakening.
 *
 * Once enrolled, identity comes from the signed session cookie — never from request
 * input — and the session is checked against the reviewer's revocation epoch so an admin
 * PIN reset genuinely signs their devices out.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateCatalogAccessToken, hashCatalogAccessToken } from "./catalogTokens";
import { verifyReviewerSession } from "./reviewerPin";
import {
  evaluateEnrollmentWindow,
  loadRoster,
  type EnrollmentWindowState,
  type RosterRecord,
} from "./staffEnrollment";

export const REVIEWER_SESSION_COOKIE = "tmt_reviewer";

export function reviewerSessionSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to sign reviewer sessions");
  return secret;
}

export interface StaffLink {
  tokenId: string;
  partnerId: string;
  /** Null on a shared link. Non-null only on a legacy KEWL-2364 per-reviewer link. */
  issuedToId: string | null;
  window: EnrollmentWindowState;
}

export type StaffLinkResult = { ok: true; link: StaffLink } | { ok: false; response: NextResponse };

function linkFailure(reason: string): NextResponse {
  // Revoked/expired links say so; anything else is indistinguishable from a bad guess.
  const status = reason === "expired" || reason === "revoked" ? 410 : 404;
  const message =
    status === 410 ? "This staff link is no longer active." : "Staff link not found.";
  return NextResponse.json({ success: false, error: { message } }, { status });
}

export async function resolveStaffLink(
  token: string,
  now: Date = new Date()
): Promise<StaffLinkResult> {
  const record = await prisma.catalogAccessToken.findUnique({
    where: { tokenHash: hashCatalogAccessToken(token) },
  });
  const state = evaluateCatalogAccessToken(record, "staff_review", now);
  if (!state.ok) return { ok: false, response: linkFailure(state.reason) };
  return {
    ok: true,
    link: {
      tokenId: record!.id,
      partnerId: state.partnerId,
      issuedToId: record!.issuedToId ?? null,
      window: evaluateEnrollmentWindow(
        {
          enrollmentClosesAt: record!.enrollmentClosesAt ?? null,
          enrollmentClosedAt: record!.enrollmentClosedAt ?? null,
        },
        now
      ),
    },
  };
}

export type StaffRosterResult =
  | { ok: true; link: StaffLink; roster: RosterRecord[] }
  | { ok: false; response: NextResponse };

/**
 * Resolves the link plus the reviewers it serves.
 *
 * An empty roster is a dead link, not an open one: with nobody to pick, there is nothing
 * a holder could do but there is also nothing useful to render, so it 410s the same way
 * a revoked link does.
 */
export async function resolveStaffRoster(
  token: string,
  now: Date = new Date()
): Promise<StaffRosterResult> {
  const resolved = await resolveStaffLink(token, now);
  if (!resolved.ok) return resolved;

  const roster = await loadRoster(prisma, {
    partnerId: resolved.link.partnerId,
    issuedToId: resolved.link.issuedToId,
  });
  if (roster.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: { message: "This staff link is no longer active.", code: "no_reviewers" },
        },
        { status: 410 }
      ),
    };
  }

  return { ok: true, link: resolved.link, roster };
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
 * Full gate for every write and every data read: a live link, plus a signed session
 * minted from that same link for a reviewer who is still on that link's roster.
 *
 * The session names the reviewer. That is safe here in a way it would not be on the
 * sign-in endpoint, because the cookie is HMAC'd server-side and bound to this token —
 * a holder cannot mint one for a name they did not enroll.
 */
export async function requireReviewer(
  token: string,
  cookieValue: string | undefined
): Promise<ReviewerResult> {
  const resolved = await resolveStaffRoster(token);
  if (!resolved.ok) return resolved;
  const { link, roster } = resolved;

  const session = verifyReviewerSession(cookieValue, {
    tokenId: link.tokenId,
    secret: reviewerSessionSecret(),
  });
  if (!session.ok) return { ok: false, response: pinRequired() };

  const reviewer = roster.find((candidate) => candidate.id === session.employeeId);
  // Off the roster now: deactivated, opted out, or — on a legacy bound link — the link
  // was re-issued to somebody else after this session was minted.
  if (!reviewer) return { ok: false, response: pinRequired("Enter your PIN again.") };

  // An admin PIN reset stamps the revocation epoch, which is what actually invalidates
  // sessions already sitting in browsers. Without this check a reset would only change
  // the next sign-in, and the QA-enrolled devices would have stayed signed in.
  if (
    reviewer.pinSessionsRevokedAt &&
    session.issuedAt <= reviewer.pinSessionsRevokedAt.getTime()
  ) {
    return { ok: false, response: pinRequired("Your PIN was reset. Set a new one.") };
  }

  // A reviewer whose PIN was cleared is un-enrolled; an old cookie must not carry them
  // past the enrollment gate.
  if (!reviewer.pinHash) {
    return { ok: false, response: pinRequired("Your PIN was reset. Set a new one.") };
  }

  return {
    ok: true,
    tokenId: link.tokenId,
    partnerId: link.partnerId,
    employeeId: reviewer.id,
    employeeName: reviewer.name,
  };
}
