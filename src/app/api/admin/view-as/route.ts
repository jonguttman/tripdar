import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/domain/auth/config";
import { getUserRole } from "@/domain/auth/role";
import {
  ADMIN_VIEW_AS_COOKIE,
  getAdminViewAsTarget,
  listAdminViewAsUsers,
  resolveAdminIdentity,
  viewAsWriteRefusal,
} from "@/domain/auth/viewAs";

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
    { status: 401 }
  );
}

function forbidden(message = "Only super admins can use View-as mode.") {
  return NextResponse.json(
    { success: false, error: { code: "VIEW_AS_FORBIDDEN", message } },
    { status: 403 }
  );
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return unauthorized();

  const role = await getUserRole(session.user.email);
  if (role !== "super_admin") return forbidden();

  const users = await listAdminViewAsUsers();
  return NextResponse.json({ success: true, data: { users } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return unauthorized();

  const identity = await resolveAdminIdentity(session.user.email, request);
  if (identity.isViewAsActive) return viewAsWriteRefusal(identity);
  if (identity.actualRole !== "super_admin") return forbidden();

  const body = await request.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: "userId is required" } },
      { status: 400 }
    );
  }

  const target = await getAdminViewAsTarget(userId);
  if (!target) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "View-as user not found" } },
      { status: 404 }
    );
  }

  const response = NextResponse.json({
    success: true,
    data: { user: target },
  });
  response.cookies.set(ADMIN_VIEW_AS_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

