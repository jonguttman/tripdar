import { NextRequest, NextResponse } from "next/server";
import { REVIEWER_SESSION_COOKIE } from "@/domain/myco/staffReviewAuth";
import {
  confirmStaffReviewInvitation,
  setStaffReviewSessionCookie,
} from "@/domain/myco/staffReviewInvitations";

export const dynamic = "force-dynamic";

function failure(message: string, code: string, status: number) {
  return NextResponse.json({ success: false, error: { message, code } }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    csrfToken?: unknown;
  };
  const email = typeof body.email === "string" ? body.email : "";
  const csrfToken = typeof body.csrfToken === "string" ? body.csrfToken : "";
  if (!email || !csrfToken) {
    return failure("This invitation cannot be used.", "invalid_request", 400);
  }

  const result = await confirmStaffReviewInvitation({
    token,
    email,
    csrfToken,
    cookieValue: request.cookies.get(REVIEWER_SESSION_COOKIE)?.value,
  });
  if (!result.ok) return failure(result.message, result.code, result.status);

  const response = NextResponse.json({
    success: true,
    data: { redirectTo: result.redirectPath, status: result.status },
  });
  setStaffReviewSessionCookie(response, result.cookieValue, result.maxAge);
  return response;
}
