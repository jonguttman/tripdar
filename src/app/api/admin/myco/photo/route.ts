import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import { put } from "@vercel/blob";

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

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const productName = formData.get("productName") as string | null;

    if (!file || !productName) {
      return NextResponse.json(
        { success: false, error: { message: "file and productName are required" } },
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
    const sanitizedName = productName
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80);
    const filename = `Myco_Products/${Date.now()}_${sanitizedName}.${extension}`;
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
    console.error("Error uploading Myco product photo:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to upload product photo" } },
      { status: 500 }
    );
  }
}
