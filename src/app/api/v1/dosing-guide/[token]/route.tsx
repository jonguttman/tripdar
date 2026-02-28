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

  // Build dose rows with escalating intensity indicators
  const doseIntensity = ["I", "II", "III", "IV", "V", "VI"];
  const doseRowsHtml = doseRanges
    .map(
      (range, i) => `
      <div class="dose-row" style="animation-delay: ${0.3 + i * 0.08}s">
        <div class="dose-header">
          <div class="dose-left">
            <span class="dose-numeral">${doseIntensity[i] || (i + 1)}</span>
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
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#2c1810">
  <title>${esc(strain.name)} \u2013 Dosing Guide</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap');

    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --parchment: #faf6f1;
      --parchment-deep: #f0e6d8;
      --ink: #2c1810;
      --ink-light: #5c4033;
      --ink-muted: #8b7355;
      --gold: #d4a574;
      --gold-light: #e8c9a0;
      --gold-dim: rgba(212,165,116,0.25);
      --violet: #8b5cf6;
      --violet-dim: rgba(139,92,246,0.12);
      --moss: #4d7c5a;
    }

    body {
      font-family: 'Lora', Georgia, serif;
      background: var(--ink);
      color: var(--ink);
      min-height: 100dvh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      /* Subtle radial glow behind card */
      background: radial-gradient(ellipse at 50% 30%, #3d2a1e 0%, #2c1810 50%, #1a0f09 100%);
    }

    /* === SACRED SCROLL CARD === */
    .scroll {
      max-width: 440px;
      width: 100%;
      min-height: 100dvh;
      position: relative;
      background: var(--parchment);
      /* Parchment texture via layered gradients */
      background-image:
        repeating-linear-gradient(
          0deg,
          transparent,
          transparent 28px,
          rgba(44,24,16,0.018) 28px,
          rgba(44,24,16,0.018) 29px
        ),
        radial-gradient(ellipse at 20% 50%, rgba(212,165,116,0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.04) 0%, transparent 40%),
        radial-gradient(ellipse at 50% 80%, rgba(212,165,116,0.06) 0%, transparent 50%),
        linear-gradient(180deg, #faf6f1 0%, #f5efe5 40%, #f0e6d8 100%);
      box-shadow:
        0 0 60px rgba(212,165,116,0.15),
        0 0 120px rgba(44,24,16,0.3);
      overflow: hidden;
    }

    /* Decorative top border — golden compass line */
    .scroll::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg,
        transparent 0%,
        var(--gold-dim) 15%,
        var(--gold) 35%,
        var(--gold-light) 50%,
        var(--gold) 65%,
        var(--gold-dim) 85%,
        transparent 100%
      );
    }

    .scroll-inner {
      padding: 40px 32px 32px;
    }

    /* === ORNAMENTAL DIVIDERS === */
    .ornament {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin: 16px 0;
      opacity: 0.5;
    }
    .ornament::before,
    .ornament::after {
      content: '';
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--ink-muted), transparent);
    }
    .ornament-diamond {
      width: 6px;
      height: 6px;
      background: var(--gold);
      transform: rotate(45deg);
      flex-shrink: 0;
    }

    /* === COMPASS ROSE (sacred geometry centerpiece) === */
    .compass {
      display: flex;
      justify-content: center;
      margin: 0 0 8px;
    }
    .compass svg {
      width: 44px;
      height: 44px;
      opacity: 0.2;
      animation: slow-spin 120s linear infinite;
    }
    @keyframes slow-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* === RETAILER HEADER === */
    .retailer {
      text-align: center;
      animation: fade-up 0.6s ease-out both;
    }
    .retailer-logo {
      max-width: 100px;
      max-height: 100px;
      object-fit: contain;
      margin: 0 auto 14px;
      display: block;
      border-radius: 6px;
      filter: sepia(0.05) contrast(1.02);
    }
    .retailer-name {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.5px;
      color: var(--ink-light);
    }
    .retailer-detail {
      font-size: 12px;
      color: var(--ink-muted);
      margin-top: 3px;
      letter-spacing: 0.3px;
    }

    /* === STRAIN SECTION === */
    .strain {
      text-align: center;
      animation: fade-up 0.6s ease-out both;
      animation-delay: 0.1s;
    }
    .strain-name {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 32px;
      font-weight: 700;
      color: var(--ink);
      line-height: 1.15;
      letter-spacing: -0.5px;
      margin-bottom: 10px;
    }
    .strain-desc {
      font-size: 14px;
      color: var(--ink-muted);
      line-height: 1.65;
      max-width: 340px;
      margin: 0 auto;
      font-style: italic;
    }

    /* === DOSING GUIDE LABEL (above compass) === */
    .guide-label-top {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 3.5px;
      text-transform: uppercase;
      color: var(--ink-muted);
      text-align: center;
      margin-bottom: 8px;
      animation: fade-up 0.6s ease-out both;
      animation-delay: 0.1s;
    }
    .guide-sensitivity {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 18px;
      font-weight: 600;
      color: var(--ink-light);
      font-style: italic;
      margin-top: 4px;
      margin-bottom: 8px;
    }

    /* === DOSE ROWS === */
    .dose-row {
      padding: 10px 0;
      border-bottom: 1px solid rgba(44,24,16,0.06);
      animation: fade-up 0.5s ease-out both;
    }
    .dose-row:last-of-type {
      border-bottom: none;
    }
    .dose-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .dose-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .dose-numeral {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 13px;
      font-weight: 600;
      color: var(--gold);
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--gold-dim);
      border-radius: 50%;
      flex-shrink: 0;
      letter-spacing: 0;
    }
    .dose-name {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 17px;
      font-weight: 600;
      color: var(--ink);
    }
    .dose-value {
      font-family: 'Lora', Georgia, serif;
      font-size: 15px;
      font-weight: 600;
      color: var(--ink-light);
      letter-spacing: 0.3px;
    }
    .dose-secondary {
      font-size: 11px;
      color: var(--ink-muted);
      text-align: right;
      margin-top: 2px;
      padding-right: 2px;
      font-style: italic;
    }

    /* === SAFETY WISDOM === */
    .wisdom {
      background: linear-gradient(135deg, rgba(212,165,116,0.08) 0%, rgba(139,92,246,0.04) 100%);
      border: 1px solid rgba(212,165,116,0.15);
      border-radius: 10px;
      padding: 16px 18px;
      margin-top: 4px;
      animation: fade-up 0.6s ease-out both;
      animation-delay: 0.5s;
    }
    .wisdom-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: var(--ink-muted);
      margin-bottom: 10px;
    }
    .wisdom-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 13px;
      color: var(--ink-light);
      line-height: 1.5;
    }
    .wisdom-item + .wisdom-item {
      margin-top: 8px;
    }
    .wisdom-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      margin-top: 1px;
      opacity: 0.5;
    }

    /* === FOOTER === */
    .footer {
      margin-top: 28px;
      text-align: center;
      animation: fade-up 0.6s ease-out both;
      animation-delay: 0.6s;
    }
    .powered {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 12px;
      color: var(--ink-light);
      letter-spacing: 1.5px;
    }
    .save-hint {
      margin-top: 10px;
      font-size: 11px;
      color: var(--ink-light);
      opacity: 0.7;
      letter-spacing: 0.3px;
    }

    /* === ANIMATIONS === */
    @keyframes fade-up {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* === DESKTOP CENTERING === */
    @media (min-width: 480px) {
      body {
        padding: 32px 16px;
        align-items: flex-start;
      }
      .scroll {
        min-height: auto;
        border-radius: 16px;
        margin-top: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="scroll">
    <div class="scroll-inner">

      ${retailer.logoUrl || retailer.storeName ? `<div class="retailer">
        ${retailer.logoUrl ? `<img class="retailer-logo" src="${esc(retailer.logoUrl)}" alt="${esc(retailer.storeName || "")}" onerror="this.style.display='none'">` : ""}
        ${retailer.storeName ? `<div class="retailer-name">${esc(retailer.storeName)}</div>` : ""}
        ${retailer.address ? `<div class="retailer-detail">${esc(retailer.address)}</div>` : ""}
        ${retailer.phone ? `<div class="retailer-detail">${esc(retailer.phone)}</div>` : ""}
      </div>
      <div class="ornament"><span class="ornament-diamond"></span></div>` : ""}

      <!-- Dosing Guide label -->
      <div class="guide-label-top">Dosing Guide</div>

      <!-- Compass Rose -->
      <div class="compass">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="48" stroke="currentColor" stroke-width="0.5" opacity="0.3"/>
          <circle cx="50" cy="50" r="35" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
          <circle cx="50" cy="50" r="20" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
          <!-- Cardinal points -->
          <line x1="50" y1="2" x2="50" y2="98" stroke="currentColor" stroke-width="0.4" opacity="0.2"/>
          <line x1="2" y1="50" x2="98" y2="50" stroke="currentColor" stroke-width="0.4" opacity="0.2"/>
          <!-- Diagonal lines -->
          <line x1="15" y1="15" x2="85" y2="85" stroke="currentColor" stroke-width="0.3" opacity="0.12"/>
          <line x1="85" y1="15" x2="15" y2="85" stroke="currentColor" stroke-width="0.3" opacity="0.12"/>
          <!-- North arrow -->
          <polygon points="50,8 46,22 50,18 54,22" fill="currentColor" opacity="0.25"/>
          <!-- Center dot -->
          <circle cx="50" cy="50" r="2" fill="currentColor" opacity="0.3"/>
        </svg>
      </div>

      <!-- Strain + Sensitivity -->
      <div class="strain">
        <div class="strain-name">${esc(strain.name)}</div>
        <div class="guide-sensitivity">${esc(sensitivityLabel[sensitivity] || sensitivity)}</div>
        ${strain.description ? `<div class="strain-desc">${esc(strain.description)}</div>` : ""}
      </div>

      <div class="ornament"><span class="ornament-diamond"></span></div>

      ${doseRowsHtml}

      <div class="ornament"><span class="ornament-diamond"></span></div>

      <!-- Safety Wisdom -->
      <div class="wisdom">
        <div class="wisdom-title">For the Journey</div>
        <div class="wisdom-item">
          <svg class="wisdom-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12,6 12,12 16,14"/>
          </svg>
          <span>Start low, go slow \u2014 you can always take more</span>
        </div>
        ${strain.onsetTime ? `<div class="wisdom-item">
          <svg class="wisdom-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M12 2L12 6M12 18L12 22M2 12L6 12M18 12L22 12"/>
            <circle cx="12" cy="12" r="4"/>
          </svg>
          <span>Allow ${esc(String(strain.onsetTime))} for onset before redosing</span>
        </div>` : ""}
      </div>

      <!-- Footer -->
      <div class="footer">
        <div class="powered">powered by tripd.ar</div>
        <div class="save-hint">Screenshot to save this guide</div>
      </div>

    </div>
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
