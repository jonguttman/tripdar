import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import { prepareCanonicalStaffReviewInvitationBatch } from "@/domain/myco/staffReviewInvitations";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  return session.user.email;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    partnerId?: unknown;
    send?: unknown;
    expiresInDays?: unknown;
    qaOnly?: unknown;
  };
  if (body.send === true) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: "Staff invitations are preview-only in KEWL-2912. send=false is required.",
          code: "send_not_authorized",
        },
      },
      { status: 403 }
    );
  }

  const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
  if (!partnerId) {
    return NextResponse.json(
      { success: false, error: { message: "partnerId is required" } },
      { status: 400 }
    );
  }

  try {
    const batch = await prepareCanonicalStaffReviewInvitationBatch({
      partnerId,
      issuedBy: auth,
      requestOrigin: request.nextUrl.origin,
      expiresInDays: Number(body.expiresInDays),
      qaOnly: body.qaOnly === true,
    });
    return NextResponse.json({ success: true, data: batch }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare staff invitations";
    const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 400;
    const code = typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;
    return NextResponse.json(
      { success: false, error: { message, ...(code ? { code } : {}) } },
      { status: statusCode }
    );
  }
}
