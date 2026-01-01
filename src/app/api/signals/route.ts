import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSignal } from "@/domain/signal/service";

/**
 * IMPORTANT (Meaning Layer v1.0):
 * - Signals are append-only
 * - No updates or deletes
 * - No user identity
 */
export async function POST(req: NextRequest) {
  try {
    const rawInput = await req.json();

    // Server-generated fields (Meaning Layer v1.0):
    // - id: unique signal identifier
    // - createdAt: timestamp of creation
    // - comparisonDose/comparisonStrainId: null for BASELINE reference frame
    const input = {
      ...rawInput,
      id: `sig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      createdAt: new Date(),
      comparisonDose: rawInput.comparisonDose ?? null,
      comparisonStrainId: rawInput.comparisonStrainId ?? null,
    };

    const signal = await createSignal(prisma, input);

    return NextResponse.json({ id: signal.id }, { status: 201 });
  } catch (err: unknown) {
    let message = err instanceof Error ? err.message : "Invalid signal";

    // Provide clearer error for database connection issues
    if (
      message.includes("Cannot read properties of null") ||
      message.includes("prisma") ||
      message.includes("database") ||
      message.includes("connect")
    ) {
      message = "Database not configured. Run: npx prisma migrate dev";
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
