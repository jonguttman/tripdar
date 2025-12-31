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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/56ca748c-dbb2-49eb-b6b2-0ceb6afc7b30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/signals/route.ts:POST',message:'Request received',timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3,H4'})}).catch(()=>{});
  // #endregion

  try {
    const input = await req.json();

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/56ca748c-dbb2-49eb-b6b2-0ceb6afc7b30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/signals/route.ts:POST',message:'Input parsed',data:{input},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    const signal = await createSignal(prisma, input);

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/56ca748c-dbb2-49eb-b6b2-0ceb6afc7b30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/signals/route.ts:POST',message:'Signal created',data:{signalId:signal?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    return NextResponse.json({ id: signal.id }, { status: 201 });
  } catch (err: unknown) {
    let message = err instanceof Error ? err.message : "Invalid signal";
    
    // Provide clearer error for database connection issues
    if (message.includes("Cannot read properties of null") || 
        message.includes("prisma") || 
        message.includes("database") ||
        message.includes("connect")) {
      message = "Database not configured. Run: npx prisma migrate dev";
    }

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/56ca748c-dbb2-49eb-b6b2-0ceb6afc7b30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/signals/route.ts:POST',message:'Error caught',data:{errorMessage:message,errorType:err?.constructor?.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3,H4'})}).catch(()=>{});
    // #endregion

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

