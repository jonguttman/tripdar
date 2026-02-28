/**
 * GET /api/v1/dosing-guide/[token]
 *
 * Public endpoint: serves a branded dose card as a mobile-optimized HTML page.
 * No API key required — token validation only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadStrainData } from "@/domain/strain/blob-store";
import { mapDoseSensitivity } from "@/domain/recommendation-engine/strain-profiles";
import { calculateAllDoseRanges } from "@/domain/dosing-guide/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const guide = await prisma.dosingGuideToken.findUnique({
    where: { token },
  });

  if (!guide) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "TOKEN_NOT_FOUND",
          message: "Invalid dosing guide token.",
        },
      },
      { status: 404 }
    );
  }

  // Record download
  const userAgent = request.headers.get("user-agent") || "";
  const referrer = request.headers.get("referer") || "";

  await prisma.$transaction([
    prisma.dosingGuideToken.update({
      where: { id: guide.id },
      data: {
        downloadCount: { increment: 1 },
        downloadedAt: guide.downloadedAt || new Date(),
        metadata: {
          userAgent,
          referrer,
          lastDownloadAt: new Date().toISOString(),
        },
      },
    }),
    prisma.analyticsEvent.create({
      data: {
        eventType: "dosing_guide_downloaded",
        entitySlug: guide.strainSlug,
        partnerId: guide.partnerId,
        sessionHash: guide.token,
        metadata: JSON.stringify({ userAgent, referrer }),
      },
    }),
  ]);

  // Load strain data
  const strains = await loadStrainData();
  const strain = strains.find(
    (s) =>
      s.id === guide.strainSlug ||
      s.name.toLowerCase().replace(/\s+/g, "-") === guide.strainSlug
  );

  if (!strain) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "STRAIN_NOT_FOUND",
          message: "Strain data not found.",
        },
      },
      { status: 404 }
    );
  }

  // Calculate dose ranges
  const sensitivity = mapDoseSensitivity(strain.potency, strain.name);
  const doseRanges = calculateAllDoseRanges(sensitivity);

  // Retailer branding
  const retailer = guide.retailerData as {
    logoUrl?: string;
    storeName?: string;
    address?: string;
    phone?: string;
  };

  // Sensitivity display label
  const sensitivityLabel: Record<string, string> = {
    gentle: "Gentle Potency",
    medium: "Medium Potency",
    steep: "High Potency",
    very_steep: "Very High Potency",
  };

  // Escape HTML helper
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Build dose rows
  const doseRowsHtml = doseRanges
    .map(
      (range) => `
      <div class="dose-row">
        <div class="dose-header">
          <div class="dose-left">
            <span class="dose-dot"></span>
            <span class="dose-name">${esc(range.name)}</span>
          </div>
          <span class="dose-value">${esc(range.display.primary)}</span>
        </div>
        ${range.display.secondary ? `<div class="dose-secondary">${esc(range.display.secondary)}</div>` : ""}
      </div>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <title>${esc(strain.name)} – Dosing Guide</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #e8e0d4;
      color: #3a3226;
      min-height: 100dvh;
      display: flex;
      justify-content: center;
      padding: 16px;
    }
    .card {
      background: #f5f0e8;
      border-radius: 20px;
      padding: 36px 28px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 4px 24px rgba(58,50,38,0.10);
      display: flex;
      flex-direction: column;
      align-self: flex-start;
    }
    .retailer-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 24px;
    }
    .retailer-logo {
      max-width: 120px;
      max-height: 120px;
      object-fit: contain;
      margin-bottom: 12px;
      border-radius: 8px;
    }
    .retailer-name {
      font-size: 20px;
      font-weight: 700;
      text-align: center;
    }
    .retailer-info {
      font-size: 13px;
      color: #6b5c4d;
      text-align: center;
      margin-top: 4px;
    }
    .divider {
      width: 100%;
      height: 1px;
      background: #d4c9b8;
      margin: 20px 0;
    }
    .strain-section {
      text-align: center;
      margin-bottom: 4px;
    }
    .strain-name {
      font-size: 26px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .strain-desc {
      font-size: 14px;
      color: #6b5c4d;
      line-height: 1.5;
    }
    .dose-guide-label {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #3a3226;
      margin-bottom: 2px;
    }
    .dose-sensitivity {
      font-size: 13px;
      color: #8a7b6b;
      margin-bottom: 16px;
    }
    .dose-row {
      margin-bottom: 12px;
    }
    .dose-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .dose-left {
      display: flex;
      align-items: center;
    }
    .dose-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      border: 2px solid #8a7b6b;
      margin-right: 10px;
      flex-shrink: 0;
    }
    .dose-name {
      font-size: 16px;
      font-weight: 600;
    }
    .dose-value {
      font-size: 16px;
      font-weight: 700;
    }
    .dose-secondary {
      font-size: 12px;
      color: #8a7b6b;
      text-align: right;
      margin-top: 2px;
    }
    .safety {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 20px;
    }
    .safety-item {
      display: flex;
      align-items: center;
      font-size: 14px;
      color: #6b5c4d;
    }
    .safety-icon {
      margin-right: 8px;
      font-size: 16px;
    }
    .powered-by {
      text-align: right;
      font-size: 12px;
      color: #a89882;
    }
    .save-hint {
      text-align: center;
      font-size: 12px;
      color: #a89882;
      margin-top: 16px;
      padding: 10px;
      background: rgba(168,152,130,0.08);
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    ${retailer.logoUrl ? `<div class="retailer-header">
      <img class="retailer-logo" src="${esc(retailer.logoUrl)}" alt="${esc(retailer.storeName || "Store logo")}">
      ${retailer.storeName ? `<div class="retailer-name">${esc(retailer.storeName)}</div>` : ""}
      ${retailer.address ? `<div class="retailer-info">${esc(retailer.address)}</div>` : ""}
      ${retailer.phone ? `<div class="retailer-info">${esc(retailer.phone)}</div>` : ""}
    </div>` : retailer.storeName ? `<div class="retailer-header">
      <div class="retailer-name">${esc(retailer.storeName)}</div>
      ${retailer.address ? `<div class="retailer-info">${esc(retailer.address)}</div>` : ""}
      ${retailer.phone ? `<div class="retailer-info">${esc(retailer.phone)}</div>` : ""}
    </div>` : ""}

    <div class="divider"></div>

    <div class="strain-section">
      <div class="strain-name">${esc(strain.name)}</div>
      <div class="strain-desc">${esc(strain.description || "")}</div>
    </div>

    <div class="divider"></div>

    <div class="dose-guide-label">Dosing Guide</div>
    <div class="dose-sensitivity">${esc(sensitivityLabel[sensitivity] || sensitivity)}</div>

    ${doseRowsHtml}

    <div class="divider"></div>

    <div class="safety">
      <div class="safety-item">
        <span class="safety-icon">&#9888;&#65039;</span>
        <span>Start low, go slow</span>
      </div>
      ${strain.onsetTime ? `<div class="safety-item">
        <span class="safety-icon">&#9888;&#65039;</span>
        <span>Allow ${esc(String(strain.onsetTime))} for onset</span>
      </div>` : ""}
    </div>

    <div class="powered-by">powered by tripd.ar</div>

    <div class="save-hint">Screenshot to save this guide to your phone</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
