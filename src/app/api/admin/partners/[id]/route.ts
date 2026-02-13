/**
 * Partner Admin API - Single Partner Operations
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getPartner,
  rotateApiKey,
  revokePartner,
} from "@/domain/partner/access";

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

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/partners/[id] - Get single partner
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const { id } = await params;
  const partner = getPartner(id);

  if (!partner) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Partner not found" } },
      { status: 404 }
    );
  }

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
        lastActiveAt: partner.lastActiveAt,
        notes: partner.notes,
      }
    }
  });
}

/**
 * POST /api/admin/partners/[id] - Partner actions (rotate key, revoke)
 *
 * Body: { action: "rotate_key" | "revoke" }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const { id } = await params;
  const partner = getPartner(id);

  if (!partner) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Partner not found" } },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "rotate_key") {
      const newKey = rotateApiKey(id);
      if (newKey) {
        return NextResponse.json({
          success: true,
          data: {
            message: "API key rotated successfully",
            apiKey: newKey, // Only returned once!
          }
        });
      }
    }

    if (action === "revoke") {
      revokePartner(id);
      return NextResponse.json({
        success: true,
        data: { message: "Partner revoked successfully" }
      });
    }

    return NextResponse.json(
      { success: false, error: { code: "INVALID_ACTION", message: "Unknown action" } },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "Action failed" } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/partners/[id] - Revoke partner
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const { id } = await params;
  const success = revokePartner(id);

  if (!success) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Partner not found" } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { message: "Partner revoked" }
  });
}
