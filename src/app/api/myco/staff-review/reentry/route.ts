import { after, NextRequest, NextResponse } from "next/server";
import { requestFingerprint } from "@/domain/myco/reviewerEnrollment";
import {
  requestStaffReviewReentry,
  STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE,
} from "@/domain/myco/staffReviewInvitations";

export const dynamic = "force-dynamic";

const SUCCESS_BODY = {
  success: true,
  data: { message: STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE },
};

function failure(message: string, code: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ success: false, error: { message, code } }, { status, headers });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) {
    return failure(
      "Enter the email address your invitation was sent to.",
      "invalid_request",
      400
    );
  }

  const result = await requestStaffReviewReentry({
    email,
    requestOrigin: request.nextUrl.origin,
    fingerprint: requestFingerprint(request.headers),
  });

  if (!result.ok) {
    return failure(result.message, result.code, result.status, {
      "Retry-After": String(result.retryAfter),
    });
  }

  if (result.afterResponse) {
    after(async () => {
      try {
        await result.afterResponse?.();
      } catch (error) {
        console.error("[staff-review-reentry] post-response mail failed", error);
      }
    });
  }

  return NextResponse.json(SUCCESS_BODY, { status: 202 });
}
