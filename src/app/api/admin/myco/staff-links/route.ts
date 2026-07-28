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
import { getUserRole } from "@/domain/auth/role";
import { prisma } from "@/lib/prisma";
import {
  buildRevokedTokenPatch,
  createCatalogAccessToken,
  hashCatalogAccessToken,
} from "@/domain/myco/catalogTokens";
import { ensureFieldRules } from "@/domain/myco/staffReviewService";

export const dynamic = "force-dynamic";

type StaffLinkAdmin = {
  email: string;
  role: "super_admin" | "partner_admin";
  partnerId: string | null;
};

async function requireAdmin(): Promise<StaffLinkAdmin | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  const email = session.user.email;
  const role = await getUserRole(email);
  if (role !== "super_admin" && role !== "partner_admin") {
    return NextResponse.json({ success: false, error: { message: "Forbidden" } }, { status: 403 });
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { partnerId: true } });
  if (role === "partner_admin" && !user?.partnerId) {
    return NextResponse.json({ success: false, error: { message: "Forbidden" } }, { status: 403 });
  }
  return { email, role, partnerId: user?.partnerId ?? null };
}

function allowedPartnerId(auth: StaffLinkAdmin, requestedPartnerId: string): string | null {
  if (auth.role === "super_admin") return requestedPartnerId;
  return auth.partnerId === requestedPartnerId ? requestedPartnerId : null;
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
    where: {
      purpose: "staff_review",
      issuedToType: "staff",
      catalogItemId: null,
      ...(auth.role === "partner_admin" ? { partnerId: auth.partnerId! } : {}),
    },
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
  const requestedPartnerId = typeof body.partnerId === "string" ? body.partnerId : "";
  const partnerId = allowedPartnerId(auth, requestedPartnerId);
  if (!partnerId) {
    return NextResponse.json({ success: false, error: { message: "Partner not found" } }, { status: 404 });
  }
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
  const record = await prisma.$transaction(async (tx) => {
    // Exactly one active shared staff link per partner. This also revokes any
    // reviewer-bound links minted by the superseded KEWL-2379 design.
    await tx.catalogAccessToken.updateMany({
      where: {
        purpose: "staff_review",
        partnerId: partner.id,
        status: "active",
        catalogItemId: null,
      },
      data: buildRevokedTokenPatch(auth.email, "superseded by shared staff link"),
    });
    return tx.catalogAccessToken.create({
      data: {
        tokenHash: hashCatalogAccessToken(token),
        purpose: "staff_review",
        status: "active",
        partnerId: partner.id,
        issuedToType: "staff",
        issuedToId: null,
        issuedBy: auth.email,
        expiresAt,
      },
      select: { id: true, issuedAt: true, expiresAt: true },
    });
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

  const existing = await prisma.catalogAccessToken.findUnique({
    where: { id },
    select: { id: true, partnerId: true, purpose: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: { message: "Link not found" } }, { status: 404 });
  }
  if (
    existing.purpose !== "staff_review" ||
    (auth.role === "partner_admin" && existing.partnerId !== auth.partnerId)
  ) {
    return NextResponse.json({ success: false, error: { message: "Link not found" } }, { status: 404 });
  }

  await prisma.catalogAccessToken.update({
    where: { id },
    data: buildRevokedTokenPatch(auth.email, reason),
  });
  return NextResponse.json({ success: true, data: { revoked: true } });
}
