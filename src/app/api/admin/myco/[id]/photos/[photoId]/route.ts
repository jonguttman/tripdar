import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
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

function parseTag(value: unknown): PhotoTag | undefined {
  return typeof value === "string" && VALID_TAGS.includes(value as PhotoTag)
    ? (value as PhotoTag)
    : undefined;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; photoId?: string } }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    if (!params.photoId) {
      return NextResponse.json(
        { success: false, error: { message: "photoId is required" } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    const tag = parseTag(body.tag);
    if (tag) data.tag = tag;
    if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
      data.sortOrder = Math.round(body.sortOrder);
    }

    const photo = await prisma.productPhoto.update({
      where: { id: params.photoId },
      data,
    });

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
  _request: NextRequest,
  { params }: { params: { id: string; photoId?: string } }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    if (!params.photoId) {
      return NextResponse.json(
        { success: false, error: { message: "photoId is required" } },
        { status: 400 }
      );
    }

    await prisma.productPhoto.delete({ where: { id: params.photoId } });
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error deleting product photo:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to delete product photo" } },
      { status: 500 }
    );
  }
}
