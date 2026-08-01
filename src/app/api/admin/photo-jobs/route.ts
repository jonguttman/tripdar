import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { getUserRole } from "@/domain/auth/role";
import { listPremiumPhotoJobs } from "@/domain/photo-pipeline/review";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  if ((await getUserRole(email)) !== "super_admin") {
    return NextResponse.json({ success: false, error: { message: "Forbidden" } }, { status: 403 });
  }

  const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? "25");
  const offsetValue = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  if (
    !Number.isInteger(limitValue) ||
    limitValue < 1 ||
    limitValue > 100 ||
    !Number.isInteger(offsetValue) ||
    offsetValue < 0
  ) {
    return NextResponse.json(
      { success: false, error: { message: "limit must be 1-100 and offset must be non-negative" } },
      { status: 400 },
    );
  }

  const data = await listPremiumPhotoJobs({ limit: limitValue, offset: offsetValue });
  return NextResponse.json({ success: true, data });
}
