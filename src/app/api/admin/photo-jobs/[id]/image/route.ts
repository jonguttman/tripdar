import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { getUserRole } from "@/domain/auth/role";
import {
  getPhotoJobAssetReference,
  PhotoReviewError,
  type PhotoReviewAssetKind,
} from "@/domain/photo-pipeline/review";

export const dynamic = "force-dynamic";

const assetKinds = new Set<PhotoReviewAssetKind>(["source", "catalog_safe", "premium"]);

function contentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return new NextResponse("Unauthorized", { status: 401 });
  if ((await getUserRole(email)) !== "super_admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const requestedKind = request.nextUrl.searchParams.get("kind");
  if (!requestedKind || !assetKinds.has(requestedKind as PhotoReviewAssetKind)) {
    return new NextResponse("Invalid image kind", { status: 400 });
  }

  try {
    const { id } = await context.params;
    const reference = await getPhotoJobAssetReference(
      id,
      requestedKind as PhotoReviewAssetKind,
    );
    if (!reference) return new NextResponse("Image not found", { status: 404 });
    if (/^https?:\/\//i.test(reference)) {
      return NextResponse.redirect(reference);
    }

    const assetRoot = path.resolve(process.env.PHOTO_PIPELINE_ROOT ?? "tripdar-product-images");
    const rootName = path.basename(assetRoot);
    const withoutLeadingSlash = reference.replace(/^\/+/, "");
    const relativeReference = withoutLeadingSlash.startsWith(`${rootName}/`)
      ? withoutLeadingSlash.slice(rootName.length + 1)
      : withoutLeadingSlash;
    const resolvedPath = path.resolve(assetRoot, relativeReference);
    const relativePath = path.relative(assetRoot, resolvedPath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return new NextResponse("Invalid image path", { status: 400 });
    }

    const bytes = await readFile(resolvedPath);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType(resolvedPath),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof PhotoReviewError) {
      return new NextResponse(error.message, { status: error.code === "not_found" ? 404 : 409 });
    }
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return new NextResponse("Image file not found", { status: 404 });
    }
    throw error;
  }
}
