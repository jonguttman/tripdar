import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // List all blobs in the Strain_Graphics folder
    const { blobs } = await list({
      prefix: "Strain_Graphics/",
    });

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
    });
  } catch (error) {
    console.error("Error listing strain images:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to list strain images",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
