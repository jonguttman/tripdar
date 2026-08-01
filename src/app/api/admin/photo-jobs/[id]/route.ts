import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { getUserRole } from "@/domain/auth/role";
import {
  decidePhotoJob,
  PhotoReviewError,
  type PhotoReviewAction,
} from "@/domain/photo-pipeline/review";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  if ((await getUserRole(email)) !== "super_admin") {
    return NextResponse.json({ success: false, error: { message: "Forbidden" } }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  if (!body || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json(
      { success: false, error: { message: "action must be approve or reject" } },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  if (!id.trim()) {
    return NextResponse.json({ success: false, error: { message: "Photo job id is required" } }, { status: 400 });
  }

  try {
    const job = await decidePhotoJob({
      id,
      action: body.action as PhotoReviewAction,
      reviewerEmail: email,
    });
    return NextResponse.json({ success: true, data: { job } });
  } catch (error) {
    if (error instanceof PhotoReviewError) {
      const status = error.code === "not_found" ? 404 : 409;
      return NextResponse.json({ success: false, error: { message: error.message } }, { status });
    }
    throw error;
  }
}
