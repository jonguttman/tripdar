/**
 * Password Login Endpoint (Audrey stopgap)
 *
 * Temporary alternative to email magic links while we sort out
 * email deliverability. Creates a real NextAuth database session
 * and sets the session cookie.
 *
 * Only one email/password pair is honored:
 *   - email: must be in ADMIN_EMAIL_WHITELIST
 *   - password: must equal ADMIN_PASSWORD env var
 *
 * Remove once magic link auth is reliable.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { isAuthorizedEmail } from "@/domain/auth/whitelist";

const SESSION_COOKIE = "__Secure-next-auth.session-token";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json(
      { error: "Password login not configured" },
      { status: 503 }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  if (!isAuthorizedEmail(email)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (password !== adminPassword) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Find or create the user
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, emailVerified: new Date() },
    });
  }

  // Create a NextAuth-compatible session row
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires,
    },
  });

  const res = NextResponse.json({ ok: true, redirect: "/admin/myco" });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
  return res;
}
