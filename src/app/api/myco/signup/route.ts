/**
 * Post-results email capture (public, no login).
 *
 * Stores the email + session token so results can be associated with a
 * person for follow-up. Deliberately NOT a NextAuth account: admin auth is
 * whitelist-gated and grants partner_admin by default, so customer accounts
 * need their own role model first (post-demo work).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIp } from "@/domain/myco/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const partnerSlug = typeof body.partnerSlug === "string" ? body.partnerSlug.trim() : "";
    const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken.trim() : "";

    const ip = clientIp(req);
    const limit = checkRateLimit(`signup:${ip}`, 6, 10 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please wait and try again." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }
    if (!sessionToken) {
      return NextResponse.json({ error: "Missing recommendation session" }, { status: 400 });
    }

    const partner = await prisma.partner.findFirst({
      where: { subdomain: partnerSlug, active: true },
      select: { id: true },
    });
    if (!partner) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Only accept signups tied to a real recommendation session for this partner.
    const session = await prisma.recommendationSession.findUnique({
      where: { sessionToken },
      select: { partnerId: true },
    });
    if (!session || session.partnerId !== partner.id) {
      return NextResponse.json({ error: "Recommendation session not found" }, { status: 404 });
    }

    // Idempotent per email + session
    await prisma.mycoProfileSignup.upsert({
      where: { partnerId_email_sessionToken: { partnerId: partner.id, email, sessionToken } },
      update: {},
      create: { email, partnerId: partner.id, sessionToken },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[myco] signup error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
