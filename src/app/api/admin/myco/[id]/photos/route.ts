import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { put } from "@vercel/blob";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";

const VALID_TAGS = ["stock", "package_front", "package_back", "lifestyle", "other"] as const;
type PhotoTag = (typeof VALID_TAGS)[number];

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

function parseTag(value: unknown): PhotoTag {
  return typeof value === "string" && VALID_TAGS.includes(value as PhotoTag)
    ? (value as PhotoTag)
    : "other";
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; photoId?: string } }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const product = await prisma.storeProductCatalog.findUnique({
      where: { id: params.id },
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

    const photo = await prisma.productPhoto.create({
      data: {
        catalogItemId: product.id,
        url: blob.url,
        tag,
        sortOrder: nextSort,
      },
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
