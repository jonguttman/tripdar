/**
 * KEWL-2335 — mint and revoke the no-login staff review link.
 *
 * One shared link per partner; reviewers identify themselves with their name + PIN once
 * they open it. Built on KEWL-2332's `CatalogAccessToken` (hash-only storage, revocable,
 * expirable) — the raw token is returned exactly once, at mint time.
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
      issuedAt: true,
      issuedBy: true,
      expiresAt: true,
      openedAt: true,
      revokedAt: true,
    },
  });
  // The raw token is never recoverable — only the hash is stored.
  return NextResponse.json({ success: true, data: { tokens } });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    partnerId?: unknown;
    expiresInDays?: unknown;
  };
  const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
  if (!partner) {
    return NextResponse.json({ success: false, error: { message: "Partner not found" } }, { status: 404 });
  }

  const days = Number(body.expiresInDays);
  const expiresAt = Number.isFinite(days) && days > 0
    ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    : null;

  // Seed the approved required-field set on first mint so the surface has config to read.
  await ensureFieldRules(null);

  const token = createCatalogAccessToken();
  const record = await prisma.catalogAccessToken.create({
    data: {
      tokenHash: hashCatalogAccessToken(token),
      purpose: "staff_review",
      status: "active",
      partnerId: partner.id,
      issuedToType: "staff",
      issuedBy: auth,
      expiresAt,
    },
    select: { id: true, issuedAt: true, expiresAt: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      id: record.id,
      // Shown once. We store only the SHA-256 hash, so this cannot be retrieved later.
      url: staffLinkUrl(token),
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
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
    data: buildRevokedTokenPatch(auth, reason),
  });
  return NextResponse.json({ success: true, data: { revoked: true } });
}
