import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function GET() {
  const hasToken = !!process.env.BLOB_READ_WRITE_TOKEN;

  if (!hasToken) {
    return NextResponse.json({
      success: false,
      error: "BLOB_READ_WRITE_TOKEN not configured",
    });
  }

  try {
    // List ALL blobs without prefix to see what's stored
    const { blobs } = await list();

    return NextResponse.json({
      success: true,
      totalBlobs: blobs.length,
      blobs: blobs.map((b) => ({
        pathname: b.pathname,
        url: b.url,
        size: b.size,
      })),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
