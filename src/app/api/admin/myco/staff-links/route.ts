/**
 * KEWL-2335 — mint and revoke the no-login staff review link.
 *
 * ONE SHARED LINK for the store's whole roster, per Jon's 2026-07-28 override: everyone
 * gets the same URL and picks their PIN the first time they open it. Built on KEWL-2332's
 * `CatalogAccessToken` (hash-only storage, revocable, expirable) — the raw token is
 * returned exactly once, at mint time, and is not recoverable afterwards.
 *
 * The per-reviewer binding KEWL-2364 introduced is gone as the auth model. What replaces it
 * is the enrollment window (KEWL-2379): the link is only claimable for a bounded period,
 * the window auto-closes at full roster coverage, and every claim is logged and resettable.
 *
 * Minting revokes every live staff link for the partner, including the per-reviewer ones
 * minted earlier on 2026-07-28, so exactly one link is valid at a time.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";
import {
  buildRevokedTokenPatch,
  createCatalogAccessToken,
  hashCatalogAccessToken,
} from "@/domain/myco/catalogTokens";
import { ensureFieldRules } from "@/domain/myco/staffReviewService";
import { staffReviewerWhere } from "@/domain/myco/staffReviewRoster";
import {
  DEFAULT_ENROLLMENT_HOURS,
  enrollmentClosesAtFrom,
  isEnrollmentOpen,
  preMintPinWarnings,
  recordEnrollmentEvent,
  requestFingerprint,
} from "@/domain/myco/reviewerEnrollment";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  return session.user.email;
}

function staffLinkUrl(token: string): string {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base}/staff/catalog/${token}`;
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

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    partnerId?: unknown;
    expiresInDays?: unknown;
    enrollmentHours?: unknown;
  };
  const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
  if (!partner) {
    return NextResponse.json({ success: false, error: { message: "Partner not found" } }, { status: 404 });
  }

  const reviewers = await prisma.mycoEmployee.findMany({
    where: staffReviewerWhere(partner.id),
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, pinHash: true, pinSetAt: true },
  });
  if (reviewers.length === 0) {
    return NextResponse.json(
      { success: false, error: { message: "No active reviewers for this partner" } },
      { status: 404 }
    );
  }

  // Pre-ship assertion (Jon's explicit ask). A reviewer who already holds a PIN CANNOT
  // claim their name on the new link — enrollment is compare-and-set on a null hash — so
  // shipping the link without noticing would silently lock that person out.
  const warnings = preMintPinWarnings(reviewers);

  const days = Number(body.expiresInDays);
  const expiresAt = Number.isFinite(days) && days > 0
    ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    : null;
  const enrollmentClosesAt = enrollmentClosesAtFrom(
    typeof body.enrollmentHours === "number" ? body.enrollmentHours : DEFAULT_ENROLLMENT_HOURS
  );

  // Seed the approved required-field set on first mint so the surface has config to read.
  await ensureFieldRules(null);

  const fingerprint = requestFingerprint(request.headers);
  const token = createCatalogAccessToken();

  const record = await prisma.$transaction(async (tx) => {
    // Exactly one live staff link per partner: supersede every previous one, shared or
    // per-reviewer, so a forwarded old copy stops working the moment this is minted.
    await tx.catalogAccessToken.updateMany({
      where: { purpose: "staff_review", partnerId: partner.id, status: "active" },
      data: buildRevokedTokenPatch(auth, "superseded by a newly minted shared staff link"),
    });

    const created = await tx.catalogAccessToken.create({
      data: {
        tokenHash: hashCatalogAccessToken(token),
        purpose: "staff_review",
        status: "active",
        partnerId: partner.id,
        issuedToType: "staff",
        // No `issuedToId`: this link is the roster's, not one person's.
        issuedToId: null,
        issuedToEmail: null,
        issuedBy: auth,
        expiresAt,
        enrollmentOpen: true,
        enrollmentClosesAt,
      },
      select: { id: true, issuedAt: true, expiresAt: true, enrollmentClosesAt: true },
    });

    await recordEnrollmentEvent(tx, {
      partnerId: partner.id,
      tokenId: created.id,
      employeeName: "—",
      eventType: "enrollment_opened",
      actorType: "admin",
      actorIdentity: auth,
      reason: `shared staff link minted; enrollment open until ${enrollmentClosesAt.toISOString()}`,
      ip: fingerprint.ip,
      userAgent: fingerprint.userAgent,
    });

    return created;
  });

  return NextResponse.json({
    success: true,
    data: {
      id: record.id,
      shared: true,
      // Shown once. We store only the SHA-256 hash, so this cannot be retrieved later.
      url: staffLinkUrl(token),
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      enrollmentClosesAt: record.enrollmentClosesAt,
      roster: reviewers.map((reviewer) => ({
        id: reviewer.id,
        name: reviewer.name,
        email: reviewer.email,
        hasPin: Boolean(reviewer.pinHash),
      })),
      // Non-empty means someone on the roster cannot claim their name. Do not send the link.
      warnings,
    },
  });
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
