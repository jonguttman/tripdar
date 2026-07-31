import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { resolveProductForAdmin } from "@/domain/myco/adminAccess";

const VALID_TAGS = ["stock", "package_front", "package_back", "lifestyle", "other"] as const;
const VALID_KINDS = ["source", "transparent", "white_background", "derivative"] as const;
type PhotoTag = (typeof VALID_TAGS)[number];
type PhotoKind = (typeof VALID_KINDS)[number];

async function requireAuth() {
  const session = await getAdminSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }
  return session;
}

function parseTag(value: unknown): PhotoTag {
  return typeof value === "string" && VALID_TAGS.includes(value as PhotoTag)
    ? (value as PhotoTag)
    : "other";
}

function parseKind(value: unknown): PhotoKind {
  return typeof value === "string" && VALID_KINDS.includes(value as PhotoKind)
    ? (value as PhotoKind)
    : "source";
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId?: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;

    const access = await resolveProductForAdmin(auth.user!.email!, id);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: { message: access.message } },
        { status: access.status }
      );
    }

    const product = await prisma.storeProductCatalog.findUnique({
      where: { id },
      select: { id: true, productName: true },
    });

    if (!product) {
      return NextResponse.json(
        { success: false, error: { message: "Product not found" } },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const tag = parseTag(formData.get("tag"));
    const kind = parseKind(formData.get("kind"));
    const isPrimary = formData.get("isPrimary") === "true";
    const sourceUrl = cleanText(formData.get("sourceUrl"));
    const provider = cleanText(formData.get("provider"));
    const model = cleanText(formData.get("model"));
    const costCents = Number(formData.get("costCents"));

    if (!file) {
      return NextResponse.json(
        { success: false, error: { message: "file is required" } },
        { status: 400 }
      );
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid file type. Allowed: PNG, JPEG, WebP, GIF" } },
        { status: 400 }
      );
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: { message: "File too large. Maximum 5MB" } },
        { status: 400 }
      );
    }

    const extension = file.type.split("/")[1];
    const sanitizedName = product.productName
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80);
    const filename = `Myco_Products/${Date.now()}_${sanitizedName}_${tag}.${extension}`;
    const blob = await put(filename, file, {
      access: "public",
      contentType: file.type,
    });

    const max = await prisma.productPhoto.aggregate({
      where: { catalogItemId: product.id },
      _max: { sortOrder: true },
    });
    const nextSort = (max._max.sortOrder ?? 0) + 1;

    const photo = await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.productPhoto.updateMany({
          where: { catalogItemId: product.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.productPhoto.create({
        data: {
          catalogItemId: product.id,
          url: blob.url,
          tag,
          kind,
          sourceUrl: sourceUrl ?? null,
          isPrimary,
          approvedBy: isPrimary ? auth.user!.email! : null,
          approvedAt: isPrimary ? new Date() : null,
          provider: provider ?? null,
          model: model ?? null,
          costCents: Number.isFinite(costCents) && costCents > 0 ? Math.round(costCents) : 0,
          provenance: {
            uploadedBy: auth.user!.email!,
            originalFilename: file.name,
            contentType: file.type,
            size: file.size,
            kind,
          },
          sortOrder: nextSort,
        },
      });
    });

    return NextResponse.json({ success: true, data: { photo } }, { status: 201 });
  } catch (error) {
    console.error("Error uploading product photo:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to upload product photo" } },
      { status: 500 }
    );
  }
}
