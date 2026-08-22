/**
 * KEWL-2335 — inventory and revoke the legacy no-login staff review link.
 *
 * KEWL-3446 / KEWL-3795 keeps email-possession invitations canonical. New shared-link PIN
 * enrollment is closed; this route remains only for legacy inventory and revocation.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import { prisma } from "@/lib/prisma";
import { buildRevokedTokenPatch } from "@/domain/myco/catalogTokens";
import {
  isEnrollmentOpen,
} from "@/domain/myco/reviewerEnrollment";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  return session.user.email;
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const tokens = await prisma.catalogAccessToken.findMany({
    where: { purpose: "staff_review", issuedToType: "staff", catalogItemId: null },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      status: true,
      partnerId: true,
      issuedToId: true,
      issuedToEmail: true,
      issuedAt: true,
      issuedBy: true,
      expiresAt: true,
      openedAt: true,
      revokedAt: true,
      enrollmentOpen: true,
      enrollmentClosesAt: true,
    },
  });

  // Legacy per-reviewer links (pre-override) still name their reviewer; shared links don't.
  const employees = await prisma.mycoEmployee.findMany({
    where: { id: { in: tokens.map((t) => t.issuedToId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(employees.map((e) => [e.id, e.name]));

  // The raw token is never recoverable — only the hash is stored.
  return NextResponse.json({
    success: true,
    data: {
      tokens: tokens.map((token) => ({
        ...token,
        issuedToName: token.issuedToId ? (nameById.get(token.issuedToId) ?? null) : null,
        shared: token.issuedToId === null,
        enrollmentEffectivelyOpen: isEnrollmentOpen(token),
      })),
    },
  });
}

export async function POST(_request?: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    success: false,
    error: {
      code: "legacy_pin_enrollment_closed",
      message:
        "Legacy PIN enrollment is closed. Use staff email invitations for reviewer re-entry.",
    },
  }, { status: 410 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; reason?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "revoked by admin";

  const existing = await prisma.catalogAccessToken.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ success: false, error: { message: "Link not found" } }, { status: 404 });
  }

  await prisma.catalogAccessToken.update({
    where: { id },
    // Enrollment closes with the link — a revoked link must not leave a live window behind.
    data: { ...buildRevokedTokenPatch(auth, reason), enrollmentOpen: false },
  });
  return NextResponse.json({ success: true, data: { revoked: true } });
}
