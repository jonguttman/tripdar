import { NextResponse } from "next/server";
import { hashApiKey } from "@/domain/partner/access";

export async function GET() {
  const envKey = process.env.TRIPDAR_PARTNER_KEY;
  return NextResponse.json({
    hasEnvKey: !!envKey,
    envKeyLength: envKey?.length,
    envKeyHash: envKey ? hashApiKey(envKey.trim()) : null,
  });
}
