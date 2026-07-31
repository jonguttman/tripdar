/**
 * Admin Strain Image Upload API
 *
 * POST /api/admin/strains/image - Upload a strain visualization image
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { put, del, list } from "@vercel/blob";

/**
 * Check if user is authenticated
 */
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

/**
 * POST /api/admin/strains/image
 * Upload a strain visualization image
 *
 * Form data:
 * - file: The image file
 * - strainName: The strain name (used for filename)
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const strainName = formData.get("strainName") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: { message: "No file provided" } },
        { status: 400 }
      );
    }

    if (!strainName) {
      return NextResponse.json(
        { success: false, error: { message: "No strain name provided" } },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid file type. Allowed: PNG, JPEG, WebP, GIF" } },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: { message: "File too large. Maximum 5MB" } },
        { status: 400 }
      );
    }

    // Generate filename from strain name
    const extension = file.type.split("/")[1];
    const sanitizedName = strainName
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "_");
    const filename = `Strain_Graphics/${sanitizedName}.${extension}`;

    // Delete existing image for this strain if exists
    try {
      const { blobs } = await list({ prefix: `Strain_Graphics/${sanitizedName}` });
      for (const blob of blobs) {
        if (blob.pathname.startsWith(`Strain_Graphics/${sanitizedName}.`)) {
          await del(blob.url);
        }
      }
    } catch (error) {
      console.error("Error deleting old image:", error);
    }

    // Upload new image
    const blob = await put(filename, file, {
      access: "public",
      contentType: file.type,
    });

    return NextResponse.json({
      success: true,
      data: {
        url: blob.url,
        pathname: blob.pathname,
      },
    });
  } catch (error) {
    console.error("Error uploading image:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to upload image" } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/strains/image
 * Delete a strain visualization image
 *
 * Query params:
 * - strainName: The strain name
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const strainName = request.nextUrl.searchParams.get("strainName");

    if (!strainName) {
      return NextResponse.json(
        { success: false, error: { message: "No strain name provided" } },
        { status: 400 }
      );
    }

    const sanitizedName = strainName
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "_");

    // Find and delete images for this strain
    const { blobs } = await list({ prefix: `Strain_Graphics/${sanitizedName}` });
    let deleted = 0;

    for (const blob of blobs) {
      if (blob.pathname.startsWith(`Strain_Graphics/${sanitizedName}.`)) {
        await del(blob.url);
        deleted++;
      }
    }

    return NextResponse.json({
      success: true,
      data: { deleted },
    });
  } catch (error) {
    console.error("Error deleting image:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to delete image" } },
      { status: 500 }
    );
  }
}
