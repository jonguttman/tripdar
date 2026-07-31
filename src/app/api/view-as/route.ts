import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/domain/auth/config";
import { getUserRole } from "@/domain/auth/role";
import { createViewAsCookie, VIEW_AS_COOKIE } from "@/domain/auth/viewAs";
import { prisma } from "@/lib/prisma";

const COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;

async function requireActualSuperAdmin() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((await getUserRole(email)) !== "super_admin") {
    return NextResponse.json(
      { error: "View as is available only to super admins" },
      { status: 403 }
    );
  }
  return email;
}

export async function POST(request: NextRequest) {
  const auth = await requireActualSuperAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
  if (typeof body?.userId !== "string" || !body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, email: true },
  });
  if (!target?.email) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if ((await getUserRole(target.email)) !== "partner_admin") {
    return NextResponse.json(
      { error: "View as requires a partner_admin target" },
      { status: 400 }
    );
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("NEXTAUTH_SECRET is required to sign View-as state");
    return NextResponse.json({ error: "View as is unavailable" }, { status: 503 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: VIEW_AS_COOKIE,
    value: await createViewAsCookie(target.id, secret),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: VIEW_AS_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
