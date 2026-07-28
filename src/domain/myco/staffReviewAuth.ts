/**
 * KEWL-2335 — no-login staff link auth.
 *
 * Two independent factors, neither of which is an account:
 *  1. The link itself — a KEWL-2332 `CatalogAccessToken` with purpose `staff_review`,
 *     revocable and expirable. Only the SHA-256 hash is stored.
 *  2. A 4-digit PIN identifying WHICH reviewer is filing, so Tier B's distinct-reviewer
 *     rule means something. Deterrence-grade, slow-hashed, locked out after 5 tries.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateCatalogAccessToken, hashCatalogAccessToken } from "./catalogTokens";
import { verifyReviewerSession } from "./reviewerPin";
import { staffReviewerWhere } from "./staffReviewRoster";

export const REVIEWER_SESSION_COOKIE = "tmt_reviewer";

export function reviewerSessionSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to sign reviewer sessions");
  return secret;
}

export type StaffLinkResult =
  | { ok: true; tokenId: string; partnerId: string }
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
  return { ok: true, tokenId: record!.id, partnerId: state.partnerId };
}

export type ReviewerResult =
  | { ok: true; tokenId: string; partnerId: string; employeeId: string; employeeName: string }
  | { ok: false; response: NextResponse };

/**
 * Full gate for every write and every data read: valid link AND a signed reviewer
 * session bound to that same link.
 */
export async function requireReviewer(
  token: string,
  cookieValue: string | undefined
): Promise<ReviewerResult> {
  const link = await resolveStaffLink(token);
  if (!link.ok) return link;

  const session = verifyReviewerSession(cookieValue, {
    tokenId: link.tokenId,
    secret: reviewerSessionSecret(),
  });
  if (!session.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: { message: "Choose your name and enter your PIN.", code: "pin_required" } },
        { status: 401 }
      ),
    };
  }

  const employee = await prisma.mycoEmployee.findFirst({
    where: staffReviewerWhere(link.partnerId, session.employeeId),
    select: { id: true, name: true },
  });
  if (!employee) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: { message: "Reviewer not found.", code: "pin_required" } },
        { status: 401 }
      ),
    };
  }

  return {
    ok: true,
    tokenId: link.tokenId,
    partnerId: link.partnerId,
    employeeId: employee.id,
    employeeName: employee.name,
  };
}
