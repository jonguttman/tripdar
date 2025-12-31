import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aggregateDimension } from "@/domain/aggregation/aggregateDimension";

/**
 * IMPORTANT (Meaning Layer v1.0):
 * - Returns language, not data
 * - No counts, percentages, or raw signals
 * - Aggregation logic lives ONLY in domain
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dimensionId = searchParams.get("dimensionId");

  if (!dimensionId) {
    return NextResponse.json(
      { error: "dimensionId is required" },
      { status: 400 }
    );
  }

  const signals = await prisma.signal.findMany({
    where: { dimensionId },
  });

  // For now, use a fixed strain name since we're in prototype phase
  // with a single-strain context (Golden Teacher).
  // Future: look up strain name from strainId if signals exist.
  const strainName = "Golden Teacher";

  const result = aggregateDimension(signals, strainName);

  if (result.status === "PATTERN_DETECTED") {
    return NextResponse.json({
      status: result.status,
      sentence: result.sentence,
    });
  }

  return NextResponse.json({ status: result.status });
}

