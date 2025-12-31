import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSignal } from "@/domain/signal";

/**
 * IMPORTANT (Meaning Layer v1.0):
 * - Signals are append-only
 * - No updates or deletes
 * - No user identity
 */
export async function POST(req: NextRequest) {
  try {
    const input = await req.json();
    const signal = await createSignal(prisma, input);
    return NextResponse.json({ id: signal.id }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid signal";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

