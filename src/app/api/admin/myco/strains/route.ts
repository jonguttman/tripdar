import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { getAllStrains } from "@/domain/strain/data";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }

  try {
    const strains = getAllStrains()
      .map((s) => ({ id: s.id, slug: s.id, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ success: true, data: { strains } });
  } catch (error) {
    console.error("Error loading strains:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load strains" } },
      { status: 500 }
    );
  }
}
