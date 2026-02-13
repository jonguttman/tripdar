/**
 * Tripdar Edge Middleware
 *
 * Runs at the edge before any /api/v1/* route.
 * Provides consistent authentication, rate limiting, and logging
 * without duplicating logic in each route handler.
 *
 * This is the first line of defense - requests that fail here
 * never reach the API routes.
 */

import { NextRequest, NextResponse } from "next/server";

// =============================================================================
// Configuration
// =============================================================================

const PARTNER_API_PREFIX = "/api/v1";

// In-memory rate limit store (edge-compatible)
// In production, use Vercel KV or similar edge-compatible store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Partner API keys (hashed) - in production, fetch from edge-compatible KV store
// This is a simplified version for the edge layer
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_RATE_LIMIT = 60; // requests per minute for unknown keys

// =============================================================================
// Utility Functions
// =============================================================================

function hashKey(key: string): string {
  // Simple hash for edge compatibility (no crypto module)
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return request.headers.get("x-api-key");
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// Edge Rate Limiting
// =============================================================================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

function checkEdgeRateLimit(identifier: string, limit: number): RateLimitResult {
  const now = Date.now();
  const existing = rateLimitStore.get(identifier);

  // Clean up old entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }

  if (!existing || existing.resetAt < now) {
    // New window
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(identifier, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, limit };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt, limit };
  }

  existing.count++;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt, limit };
}

// =============================================================================
// Middleware Handler
// =============================================================================

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only process partner API routes
  if (!pathname.startsWith(PARTNER_API_PREFIX)) {
    return NextResponse.next();
  }

  // Generate request ID for tracing
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Extract API key
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "MISSING_API_KEY",
          message: "API key required. Use Authorization: Bearer <key> or X-API-Key header.",
        },
      },
      {
        status: 401,
        headers: {
          "X-Request-ID": requestId,
          "X-Powered-By": "Tripdar",
        },
      }
    );
  }

  // Basic key format validation (must start with tripdar_)
  if (!apiKey.startsWith("tripdar_")) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_API_KEY_FORMAT",
          message: "Invalid API key format.",
        },
      },
      {
        status: 401,
        headers: {
          "X-Request-ID": requestId,
          "X-Powered-By": "Tripdar",
        },
      }
    );
  }

  // Rate limit by hashed API key
  const keyHash = hashKey(apiKey);
  const rateLimit = checkEdgeRateLimit(keyHash, DEFAULT_RATE_LIMIT);

  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Rate limit exceeded. Please try again later.",
        },
      },
      {
        status: 429,
        headers: {
          "X-Request-ID": requestId,
          "X-RateLimit-Limit": rateLimit.limit.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": rateLimit.resetAt.toString(),
          "Retry-After": retryAfter.toString(),
          "X-Powered-By": "Tripdar",
        },
      }
    );
  }

  // CORS preflight handling
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, X-API-Key, Content-Type",
        "Access-Control-Max-Age": "86400",
        "X-Request-ID": requestId,
      },
    });
  }

  // Determine allowed methods based on path
  const postAllowedPaths = ["/api/v1/quiz", "/api/v1/feedback"];
  const isPostAllowed = postAllowedPaths.some(p => pathname.startsWith(p));
  const allowedMethods = isPostAllowed ? ["GET", "POST"] : ["GET"];

  // Enforce allowed methods
  if (!allowedMethods.includes(request.method)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: `Only ${allowedMethods.join(", ")} requests are allowed on this endpoint.`,
        },
      },
      {
        status: 405,
        headers: {
          "X-Request-ID": requestId,
          Allow: [...allowedMethods, "OPTIONS"].join(", "),
          "X-Powered-By": "Tripdar",
        },
      }
    );
  }

  // Pass through to the route handler with enriched headers
  const response = NextResponse.next();

  // Add request metadata for downstream handlers
  response.headers.set("X-Request-ID", requestId);
  response.headers.set("X-Request-Start", startTime.toString());
  response.headers.set("X-RateLimit-Limit", rateLimit.limit.toString());
  response.headers.set("X-RateLimit-Remaining", rateLimit.remaining.toString());
  response.headers.set("X-RateLimit-Reset", rateLimit.resetAt.toString());

  return response;
}

// =============================================================================
// Middleware Config
// =============================================================================

export const config = {
  matcher: [
    // Match all /api/v1/* routes
    "/api/v1/:path*",
  ],
};
