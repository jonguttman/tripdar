import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { matchFlavor } from "@/domain/myco/flavors";
import crypto from "crypto";

export const dynamic = "force-dynamic";

interface VotePayload {
  catalogItemId: string;
  voterName: string;
  voterEmail: string;
  voterPhone?: string;
  relationship?: string;
  clarityCognition?: number;
  moodSocial?: number;
  visualPattern?: number;
  somatic?: number;
  energyDirection?: number;
  depthDirection?: number;
  onsetBucket?: string;
  durationBucket?: string;
  unitsTaken?: number;
  flavor?: string;
  notes?: string;
}

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip + (process.env.NEXTAUTH_SECRET || "")).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as VotePayload;

    if (!body.catalogItemId || !body.voterName?.trim() || !body.voterEmail?.trim()) {
      return NextResponse.json({ error: "Missing required fields (catalogItemId, voterName, voterEmail)" }, { status: 400 });
    }

    const email = body.voterEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // Verify product exists
    const product = await prisma.storeProductCatalog.findUnique({
      where: { id: body.catalogItemId },
      select: { id: true, flavors: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Optional flavor attribution — only known flavors, canonical casing.
    // Unknown values are dropped (vote stays recipe-level) rather than
    // rejected, so a stale flavor list never blocks feedback.
    const flavor = body.flavor ? matchFlavor(body.flavor, product.flavors) : null;

    // Soft dedup: same email + product within 24h
    const recent = await prisma.testerVote.findFirst({
      where: {
        catalogItemId: body.catalogItemId,
        voterEmail: email,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recent) {
      return NextResponse.json({
        error: "You have already submitted feedback for this product in the last 24 hours.",
      }, { status: 409 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";

    const vote = await prisma.testerVote.create({
      data: {
        catalogItemId: body.catalogItemId,
        voterName: body.voterName.trim(),
        voterEmail: email,
        voterPhone: body.voterPhone?.trim() || null,
        relationship: body.relationship || null,
        clarityCognition: body.clarityCognition ?? null,
        moodSocial: body.moodSocial ?? null,
        visualPattern: body.visualPattern ?? null,
        somatic: body.somatic ?? null,
        energyDirection: body.energyDirection ?? null,
        depthDirection: body.depthDirection ?? null,
        onsetBucket: body.onsetBucket || null,
        durationBucket: body.durationBucket || null,
        unitsTaken: body.unitsTaken ?? null,
        flavor,
        notes: body.notes?.trim() || null,
        ipHash: hashIp(ip),
        userAgent: req.headers.get("user-agent")?.slice(0, 500) || null,
      },
    });

    return NextResponse.json({ ok: true, voteId: vote.id });
  } catch (err) {
    console.error("[tester-vote] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
