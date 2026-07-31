import { NextRequest, NextResponse } from "next/server";

import { ADMIN_VIEW_AS_COOKIE } from "@/domain/auth/viewAs";

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo");
  const redirectUrl = new URL(
    returnTo?.startsWith("/admin") ? returnTo : "/admin",
    request.url
  );
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(ADMIN_VIEW_AS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

