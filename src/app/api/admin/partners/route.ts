/**
 * Partner Admin API
 *
 * Admin endpoints for managing partner API keys.
 * Protected by admin secret.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  registerPartner,
  listPartners,
} from "@/domain/partner/access";

// Admin secret - set in environment variables
const ADMIN_SECRET = process.env.TRIPDAR_ADMIN_SECRET || "change-me-in-production";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const [type, token] = authHeader.split(" ");
  return type === "Bearer" && token === ADMIN_SECRET;
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Invalid admin secret" } },
    { status: 401 }
  );
}

/**
 * GET /api/admin/partners - List all partners
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const partners = listPartners().map(p => ({
    id: p.id,
    name: p.name,
    allowedDomains: p.allowedDomains,
    rateLimit: p.rateLimit,
    active: p.active,
    createdAt: p.createdAt,
    lastActiveAt: p.lastActiveAt,
    notes: p.notes,
    // Don't expose the hash
  }));

  return NextResponse.json({
    success: true,
    data: { partners }
  });
}

/**
 * POST /api/admin/partners - Register a new partner
 *
 * Body: { name, allowedDomains, rateLimit?, notes? }
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  try {
    const body = await request.json();
    const { name, allowedDomains, rateLimit, notes } = body;

    if (!name || !allowedDomains || !Array.isArray(allowedDomains)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "name and allowedDomains are required" } },
        { status: 400 }
      );
    }

    const { partner, apiKey } = registerPartner(
      name,
      allowedDomains,
      rateLimit || 60,
      notes
    );

    return NextResponse.json({
      success: true,
      data: {
        partner: {
          id: partner.id,
          name: partner.name,
          allowedDomains: partner.allowedDomains,
          rateLimit: partner.rateLimit,
          active: partner.active,
          createdAt: partner.createdAt,
        },
        apiKey, // Only returned on creation!
      }
    });
  } catch (_error) {
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "Failed to register partner" } },
      { status: 500 }
    );
  }
}
