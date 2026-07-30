/**
 * KEWL-2460 — issue / list / revoke / regenerate the no-login brand portal link.
 *
 * The brand portal (KEWL-2331) authenticates a brand purely by a `brand_portal`
 * `CatalogAccessToken`, but this branch shipped mint/revoke paths for
 * `staff_review` only. A token-only public surface with live production links and
 * no supported way to rotate or kill one is not operable, so this route closes
 * the lifecycle with the same guarantees the staff link already has:
 *
 *  - the raw token is returned exactly once, at mint time (only its SHA-256 hash
 *    is stored, so it is never recoverable afterwards);
 *  - minting supersedes every live link for that brand, so a forwarded old URL
 *    stops working the moment a new one is issued, and the new row records
 *    `regeneratedFromId` so the rotation is auditable;
 *  - revoking is immediate and reasoned.
 *
 * Brand isolation matches `brandPortalData`: the partner is resolved from the
 * brand's own catalog rows, never from anything the caller sent unverified.
 * No schema change — `CatalogAccessToken` already models every field used here.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";
import {
  buildRegeneratedTokenInput,
  buildRevokedTokenPatch,
  createCatalogAccessToken,
} from "@/domain/myco/catalogTokens";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  return session.user.email;
}

function brandPortalUrl(token: string): string {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base}/b/${token}`;
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const tokens = await prisma.catalogAccessToken.findMany({
    where: { purpose: "brand_portal" },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      status: true,
      partnerId: true,
      brandId: true,
      issuedToEmail: true,
      issuedAt: true,
      issuedBy: true,
      expiresAt: true,
      openedAt: true,
      revokedAt: true,
      revokedBy: true,
      revocationReason: true,
      regeneratedFromId: true,
      brand: { select: { id: true, name: true, slug: true } },
    },
  });

  // Only the hash is stored, so no live URL can be listed here — by design.
  return NextResponse.json({ success: true, data: { tokens } });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    brandId?: unknown;
    partnerId?: unknown;
    expiresInDays?: unknown;
    issuedToEmail?: unknown;
  };

  const brandId = typeof body.brandId === "string" ? body.brandId : "";
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, name: true, slug: true },
  });
  if (!brand) {
    return NextResponse.json({ success: false, error: { message: "Brand not found" } }, { status: 404 });
  }

  // The partner must come from the brand's own catalog rows — the portal scopes every
  // product query to the token's brand id, so an unverified partner would be a leak.
  const partnerRows = await prisma.storeProductCatalog.findMany({
    where: { brandId: brand.id },
    select: { partnerId: true },
    distinct: ["partnerId"],
  });
  const partnerIds = partnerRows.map((row) => row.partnerId);

  const requestedPartnerId = typeof body.partnerId === "string" ? body.partnerId : "";
  let partnerId: string;
  if (requestedPartnerId) {
    if (!partnerIds.includes(requestedPartnerId)) {
      return NextResponse.json(
        { success: false, error: { message: "That brand has no products under the given partner" } },
        { status: 400 }
      );
    }
    partnerId = requestedPartnerId;
  } else if (partnerIds.length === 1) {
    partnerId = partnerIds[0];
  } else if (partnerIds.length === 0) {
    return NextResponse.json(
      { success: false, error: { message: "That brand has no catalog products yet — nothing to correct" } },
      { status: 400 }
    );
  } else {
    return NextResponse.json(
      {
        success: false,
        error: { message: "That brand spans multiple partners — pass partnerId explicitly", partnerIds },
      },
      { status: 400 }
    );
  }

  const days = Number(body.expiresInDays);
  const expiresAt =
    Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
  const issuedToEmail = typeof body.issuedToEmail === "string" && body.issuedToEmail.trim()
    ? body.issuedToEmail.trim()
    : null;

  const token = createCatalogAccessToken();

  const record = await prisma.$transaction(async (tx) => {
    // Exactly one live link per brand: supersede the rest so a forwarded old copy dies.
    const superseded = await tx.catalogAccessToken.findFirst({
      where: { purpose: "brand_portal", brandId: brand.id, status: "active" },
      orderBy: { issuedAt: "desc" },
      select: { id: true },
    });

    await tx.catalogAccessToken.updateMany({
      where: { purpose: "brand_portal", brandId: brand.id, status: "active" },
      data: buildRevokedTokenPatch(auth, "superseded by a newly minted brand portal link"),
    });

    const created = await tx.catalogAccessToken.create({
      data: buildRegeneratedTokenInput({
        // Null when this is the brand's first link; set on every rotation after that.
        oldTokenId: superseded?.id ?? null,
        token,
        purpose: "brand_portal",
        partnerId,
        brandId: brand.id,
        issuedToType: "brand",
        issuedToEmail,
        issuedBy: auth,
        expiresAt,
      }),
      select: { id: true, issuedAt: true, expiresAt: true, regeneratedFromId: true },
    });

    return created;
  });

  return NextResponse.json({
    success: true,
    data: {
      id: record.id,
      brand,
      partnerId,
      // Shown once. We store only the SHA-256 hash, so this cannot be retrieved later.
      url: brandPortalUrl(token),
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      regeneratedFromId: record.regeneratedFromId,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; reason?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const reason =
    typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "revoked by admin";

  const existing = await prisma.catalogAccessToken.findUnique({
    where: { id },
    select: { id: true, purpose: true },
  });
  if (!existing || existing.purpose !== "brand_portal") {
    return NextResponse.json(
      { success: false, error: { message: "Brand portal link not found" } },
      { status: 404 }
    );
  }

  await prisma.catalogAccessToken.update({
    where: { id },
    data: buildRevokedTokenPatch(auth, reason),
  });
  return NextResponse.json({ success: true, data: { revoked: true } });
}
