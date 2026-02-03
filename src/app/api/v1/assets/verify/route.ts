/**
 * Asset Verification Endpoint
 *
 * GET /api/v1/assets/verify?token=<signed_token>
 *
 * Verifies signed asset URLs and redirects to the actual asset.
 * This prevents hotlinking and enforces URL expiry.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySignedUrl } from "@/domain/partner/signedUrls";
import { recordSignal } from "@/domain/partner/access";
import { generateSessionHash } from "@/domain/partner/access";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "MISSING_TOKEN",
          message: "Asset token is required",
        },
      },
      { status: 400 }
    );
  }

  // Verify the signed URL
  const verification = verifySignedUrl(token);

  if (!verification.valid) {
    const statusCode = verification.error === "TOKEN_EXPIRED" ? 410 : 403;
    const message =
      verification.error === "TOKEN_EXPIRED"
        ? "This asset URL has expired. Please request a new one."
        : "Invalid or tampered asset URL.";

    return NextResponse.json(
      {
        success: false,
        error: {
          code: verification.error || "VERIFICATION_FAILED",
          message,
        },
      },
      { status: statusCode }
    );
  }

  // Record asset access signal (anonymous)
  const sessionHash = generateSessionHash(
    request.headers.get("user-agent") || undefined,
    request.headers.get("accept-language") || undefined,
    new Date()
  );

  recordSignal(
    verification.partnerId!,
    "visualization_request",
    sessionHash,
    [verification.strainSlug!]
  );

  // Redirect to the actual asset
  // Using 302 (temporary) so browsers don't cache the redirect
  return NextResponse.redirect(verification.assetUrl!, {
    status: 302,
    headers: {
      // Prevent caching of the redirect
      "Cache-Control": "no-store, no-cache, must-revalidate",
      // Security headers
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}
