/**
 * KEWL-2335 — mint and revoke no-login staff review links.
 *
 * ONE LINK PER REVIEWER, bound to a `MycoEmployee` via KEWL-2332's
 * `CatalogAccessToken.issuedToId`. Built on that same token model (hash-only storage,
 * revocable, expirable) — the raw token is returned exactly once, at mint time.
 *
 * KEWL-2364 rejected the original one-shared-link-per-store design: it let any holder
 * enroll a PIN as any reviewer who had not set one. Binding the link to a person makes
 * possession of the link an identity claim for that person only. Minting per reviewer is
 * therefore not a convenience — it is the auth boundary, so there is no shared-link mode.
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
      issuedToId: true,
      issuedToEmail: true,
      issuedAt: true,
      issuedBy: true,
      expiresAt: true,
      openedAt: true,
      revokedAt: true,
    },
  });

  // Name the bound reviewer so an admin revoking a link knows whose access they are cutting.
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
      })),
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    partnerId?: unknown;
    employeeId?: unknown;
    allReviewers?: unknown;
    expiresInDays?: unknown;
  };
  const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
  if (!partner) {
    return NextResponse.json({ success: false, error: { message: "Partner not found" } }, { status: 404 });
  }

  // A link must name its reviewer. `allReviewers` is the onboarding shortcut — it still
  // mints one distinct, individually revocable link per person, never a shared one.
  const employeeId = typeof body.employeeId === "string" ? body.employeeId : "";
  const wantsAll = body.allReviewers === true;
  if (!employeeId && !wantsAll) {
    return NextResponse.json(
      {
        success: false,
        error: { message: "employeeId is required (or allReviewers: true to mint one link per reviewer)" },
      },
      { status: 400 }
    );
  }

  const reviewers = await prisma.mycoEmployee.findMany({
    where: {
      partnerId: partner.id,
      active: true,
      optedOut: false,
      ...(employeeId ? { id: employeeId } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  if (reviewers.length === 0) {
    return NextResponse.json(
      { success: false, error: { message: "No active reviewer found for this partner" } },
      { status: 404 }
    );
  }

  const days = Number(body.expiresInDays);
  const expiresAt = Number.isFinite(days) && days > 0
    ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    : null;

  // Seed the approved required-field set on first mint so the surface has config to read.
  await ensureFieldRules(null);

  const minted = [];
  for (const reviewer of reviewers) {
    // Re-minting supersedes: the reviewer's older links are revoked so a forwarded copy
    // of a previous link cannot keep working alongside the new one.
    await prisma.catalogAccessToken.updateMany({
      where: {
        purpose: "staff_review",
        issuedToType: "staff",
        issuedToId: reviewer.id,
        status: "active",
      },
      data: buildRevokedTokenPatch(auth, "superseded by a newly minted link"),
    });

    const token = createCatalogAccessToken();
    const record = await prisma.catalogAccessToken.create({
      data: {
        tokenHash: hashCatalogAccessToken(token),
        purpose: "staff_review",
        status: "active",
        partnerId: partner.id,
        issuedToType: "staff",
        issuedToId: reviewer.id,
        issuedToEmail: reviewer.email,
        issuedBy: auth,
        expiresAt,
      },
      select: { id: true, issuedAt: true, expiresAt: true },
    });

    minted.push({
      id: record.id,
      employeeId: reviewer.id,
      employeeName: reviewer.name,
      employeeEmail: reviewer.email,
      // Shown once. We store only the SHA-256 hash, so this cannot be retrieved later.
      url: staffLinkUrl(token),
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
    });
  }

  // Single-reviewer mints keep the original flat shape; `links` carries the full set.
  return NextResponse.json({
    success: true,
    data: { ...minted[0], links: minted },
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
