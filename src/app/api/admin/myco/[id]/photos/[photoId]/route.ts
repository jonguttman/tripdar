import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";
import { resolveProductForAdmin } from "@/domain/myco/adminAccess";
import { matchFlavor } from "@/domain/myco/flavors";

const VALID_TAGS = ["stock", "package_front", "package_back", "lifestyle", "other"] as const;
const VALID_KINDS = ["source", "transparent", "white_background", "derivative"] as const;
type PhotoTag = (typeof VALID_TAGS)[number];
type PhotoKind = (typeof VALID_KINDS)[number];

async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }
  return session;
}

function parseTag(value: unknown): PhotoTag | undefined {
  return typeof value === "string" && VALID_TAGS.includes(value as PhotoTag)
    ? (value as PhotoTag)
    : undefined;
}

function parseKind(value: unknown): PhotoKind | undefined {
  return typeof value === "string" && VALID_KINDS.includes(value as PhotoKind)
    ? (value as PhotoKind)
    : undefined;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId?: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, photoId } = await params;
    if (!photoId) {
      return NextResponse.json(
        { success: false, error: { message: "photoId is required" } },
        { status: 400 }
      );
    }

    const access = await resolveProductForAdmin(auth.user!.email!, id, request);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: { message: access.message } },
        { status: access.status }
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    const tag = parseTag(body.tag);
    const kind = parseKind(body.kind);
    if (tag) data.tag = tag;
    if (kind) data.kind = kind;
    if ("sourceUrl" in body) data.sourceUrl = cleanText(body.sourceUrl) ?? null;
    if ("provider" in body) data.provider = cleanText(body.provider) ?? null;
    if ("model" in body) data.model = cleanText(body.model) ?? null;
    if ("costCents" in body && Number.isFinite(Number(body.costCents))) {
      data.costCents = Math.max(0, Math.round(Number(body.costCents)));
    }
    if (body.isPrimary === true) {
      data.isPrimary = true;
      data.approvedBy = auth.user!.email!;
      data.approvedAt = new Date();
    } else if (body.isPrimary === false) {
      data.isPrimary = false;
    }
    if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
      data.sortOrder = Math.round(body.sortOrder);
    }

    if ("flavor" in body) {
      if (body.flavor === null || body.flavor === "") {
        data.flavor = null;
      } else {
        const product = await prisma.storeProductCatalog.findUnique({
          where: { id },
          select: { flavors: true },
        });
        const flavor = matchFlavor(body.flavor, product?.flavors ?? []);
        if (!flavor) {
          return NextResponse.json(
            { success: false, error: { message: "Unknown flavor — add it to the product's flavor list first" } },
            { status: 400 }
          );
        }
        data.flavor = flavor;
      }
    }

    // Scope by both ids so a photo from another product can't be modified
    const updated = await prisma.$transaction(async (tx) => {
      if (body.isPrimary === true) {
        await tx.productPhoto.updateMany({
          where: { catalogItemId: id, isPrimary: true, NOT: { id: photoId } },
          data: { isPrimary: false },
        });
      }
      return tx.productPhoto.updateMany({
        where: { id: photoId, catalogItemId: id },
        data,
      });
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: { message: "Photo not found" } },
        { status: 404 }
      );
    }

    const photo = await prisma.productPhoto.findUnique({ where: { id: photoId } });
    return NextResponse.json({ success: true, data: { photo } });
  } catch (error) {
    console.error("Error updating product photo:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to update product photo" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId?: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, photoId } = await params;
    if (!photoId) {
      return NextResponse.json(
        { success: false, error: { message: "photoId is required" } },
        { status: 400 }
      );
    }

    const access = await resolveProductForAdmin(auth.user!.email!, id, request);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: { message: access.message } },
        { status: access.status }
      );
    }

    const deleted = await prisma.productPhoto.deleteMany({
      where: { id: photoId, catalogItemId: id },
    });
    if (deleted.count === 0) {
      return NextResponse.json(
        { success: false, error: { message: "Photo not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error deleting product photo:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to delete product photo" } },
      { status: 500 }
    );
  }
}
