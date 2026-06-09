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

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const partnerSlug = typeof body.partnerSlug === "string" ? body.partnerSlug.trim() : "";
    const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken.trim() : null;

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    const partner = await prisma.partner.findFirst({
      where: { subdomain: partnerSlug, active: true },
      select: { id: true },
    });
    if (!partner) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Idempotent per email + session
    const existing = await prisma.mycoProfileSignup.findFirst({
      where: { email, partnerId: partner.id, sessionToken },
    });
    if (!existing) {
      await prisma.mycoProfileSignup.create({
        data: { email, partnerId: partner.id, sessionToken },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[myco] signup error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
