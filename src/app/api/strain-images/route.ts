import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function GET() {
  // Check if token is configured
  const hasToken = !!process.env.BLOB_READ_WRITE_TOKEN;

  if (!hasToken) {
    return NextResponse.json({
      success: false,
      error: "BLOB_READ_WRITE_TOKEN not configured",
      images: [],
      count: 0,
    });
  }

  try {
    // List all blobs - try without prefix first to see what's there
    const result = await list({
      prefix: "Strain_Graphics/",
    });

    const { blobs } = result;

    // Map to a cleaner format with strain name extracted from filename
    const images = blobs.map((blob) => {
      // Extract strain name from path like "Strain_Graphics/Golden_Teacher.png"
      const filename = blob.pathname.replace("Strain_Graphics/", "");
      const strainName = filename
        .replace(/\.(png|jpg|jpeg|webp|gif)$/i, "")
        .replace(/_/g, " ");

      return {
        url: blob.url,
        pathname: blob.pathname,
        strainName,
        filename,
        size: blob.size,
        uploadedAt: blob.uploadedAt,
      };
    });

    return NextResponse.json({
      success: true,
      images,
      count: images.length,
      debug: {
        hasToken: true,
        totalBlobs: blobs.length,
        prefix: "Strain_Graphics/",
      },
    });
  } catch (error) {
    console.error("Error listing strain images:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to list strain images",
        details: error instanceof Error ? error.message : "Unknown error",
        images: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
