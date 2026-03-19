/**
 * Partner API Middleware
 *
 * Provides authentication, rate limiting, and logging for partner API routes.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  validateApiKey,
  isOriginAllowed,
  checkRateLimit,
  createRequestContext,
  logRequest,
  generateSessionHash,
  recordSignal,
} from "./access";
import { Partner, PartnerRequestContext, ApiErrorResponse } from "./types";

// =============================================================================
// Error Responses
// =============================================================================

function errorResponse(code: string, message: string, status: number): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status }
  );
}

// =============================================================================
// Authentication Middleware
// =============================================================================

export interface AuthenticatedRequest {
  partner: Partner;
  context: PartnerRequestContext;
  sessionHash: string;
}

/**
 * Authenticate a partner API request
 * Returns partner info and context if valid, or an error response
 */
export function authenticateRequest(
  request: NextRequest
): AuthenticatedRequest | NextResponse<ApiErrorResponse> {
  // Extract API key from header
  const authHeader = request.headers.get("authorization");
  const apiKey = (authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : request.headers.get("x-api-key"))?.trim();

  if (!apiKey) {
    return errorResponse(
      "MISSING_API_KEY",
      "API key required. Provide via Authorization: Bearer <key> or X-API-Key header.",
      401
    );
  }

  // Validate API key
  const partner = validateApiKey(apiKey);
  if (!partner) {
    return errorResponse("INVALID_API_KEY", "Invalid or revoked API key.", 401);
  }

  // Check origin (CORS)
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(partner, origin)) {
    return errorResponse(
      "ORIGIN_NOT_ALLOWED",
      `Origin "${origin}" is not authorized for this API key.`,
      403
    );
  }

  // Check rate limit
  const rateLimit = checkRateLimit(partner);
  if (!rateLimit.allowed) {
    const response = errorResponse(
      "RATE_LIMIT_EXCEEDED",
      "Rate limit exceeded. Please try again later.",
      429
    );
    response.headers.set("X-RateLimit-Limit", partner.rateLimit.toString());
    response.headers.set("X-RateLimit-Remaining", "0");
    response.headers.set("X-RateLimit-Reset", rateLimit.resetAt.toString());
    response.headers.set("Retry-After", Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString());
    return response;
  }

  // Create request context
  const context = createRequestContext(
    partner,
    origin || undefined,
    request.headers.get("user-agent") || undefined
  );

  // Generate session hash for anonymous analytics
  const sessionHash = generateSessionHash(
    request.headers.get("user-agent") || undefined,
    request.headers.get("accept-language") || undefined,
    context.timestamp
  );

  return {
    partner,
    context,
    sessionHash,
  };
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Add standard headers to a successful response
 */
export function addPartnerHeaders(
  response: NextResponse,
  partner: Partner,
  context: PartnerRequestContext
): NextResponse {
  const rateLimit = checkRateLimit(partner);

  response.headers.set("X-Request-ID", context.requestId);
  response.headers.set("X-RateLimit-Limit", partner.rateLimit.toString());
  response.headers.set("X-RateLimit-Remaining", rateLimit.remaining.toString());
  response.headers.set("X-RateLimit-Reset", rateLimit.resetAt.toString());
  response.headers.set("X-Powered-By", "Tripdar");

  // CORS headers
  if (context.origin) {
    response.headers.set("Access-Control-Allow-Origin", context.origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type");
    response.headers.set("Access-Control-Expose-Headers", "X-Request-ID, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset");
  }

  // Cache control - short cache to balance freshness and performance
  response.headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

  return response;
}

/**
 * Create a response handler that logs the request
 */
export function withLogging(
  context: PartnerRequestContext,
  endpoint: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const startTime = Date.now();

  return handler().then(response => {
    const duration = Date.now() - startTime;
    logRequest(context, endpoint, response.status, duration);
    return response;
  });
}

// =============================================================================
// Signal Recording Helpers
// =============================================================================

/**
 * Record a strain view signal
 */
export function recordStrainView(
  partnerId: string,
  sessionHash: string,
  strainSlug: string
): void {
  recordSignal(partnerId, "strain_view", sessionHash, [strainSlug]);
}

/**
 * Record a strain list signal
 */
export function recordStrainList(
  partnerId: string,
  sessionHash: string,
  filters?: Record<string, string>
): void {
  recordSignal(partnerId, "strain_list", sessionHash, undefined, filters);
}

/**
 * Record a search signal
 */
export function recordSearch(
  partnerId: string,
  sessionHash: string,
  searchTerms: string
): void {
  // Sanitize search terms - only keep alphanumeric and spaces
  const sanitized = searchTerms.replace(/[^a-zA-Z0-9\s]/g, "").slice(0, 50);
  recordSignal(partnerId, "search", sessionHash, undefined, { search_terms: sanitized });
}
