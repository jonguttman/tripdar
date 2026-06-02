import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";

async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }
  return session;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const brands = await prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json({ success: true, data: { brands } });
  } catch (error) {
    console.error("Error loading brands:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load brands" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json(
        { success: false, error: { message: "name is required" } },
        { status: 400 }
      );
    }

    const slug = slugify(name);

    if (!slug) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid brand name" } },
        { status: 400 }
      );
    }

    const existing = await prisma.brand.findFirst({
      where: { OR: [{ name }, { slug }] },
      select: { id: true, name: true, slug: true },
    });

    if (existing) {
      return NextResponse.json({ success: true, data: { brand: existing } });
    }

    const brand = await prisma.brand.create({
      data: { name, slug },
      select: { id: true, name: true, slug: true },
    });

    return NextResponse.json({ success: true, data: { brand } }, { status: 201 });
  } catch (error) {
    console.error("Error creating brand:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to create brand" } },
      { status: 500 }
    );
  }
}
