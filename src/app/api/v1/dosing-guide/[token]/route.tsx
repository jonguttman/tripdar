/**
 * GET /api/v1/dosing-guide/[token]
 *
 * Public endpoint: serves a branded dose card PNG image.
 * No API key required — token validation only.
 */

import { ImageResponse } from "@vercel/og";
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

  // Fetch retailer logo (Satori supports PNG, JPEG, GIF, SVG only)
  // WordPress may auto-convert uploads to AVIF/WebP, so try the PNG original first
  let logoSrc: string | null = null;
  if (retailer.logoUrl) {
    try {
      let logoUrl = retailer.logoUrl;
      // If URL ends with .avif or .webp, try .png first (WordPress keeps originals)
      if (/\.(avif|webp)$/i.test(logoUrl)) {
        const pngUrl = logoUrl.replace(/\.(avif|webp)$/i, ".png");
        const pngRes = await fetch(pngUrl);
        if (pngRes.ok) {
          const contentType = pngRes.headers.get("content-type") || "";
          if (contentType.includes("image/png") || contentType.includes("image/jpeg")) {
            const buf = await pngRes.arrayBuffer();
            logoSrc = `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
          }
        }
        // If PNG fallback didn't work, try .jpg
        if (!logoSrc) {
          const jpgUrl = logoUrl.replace(/\.(avif|webp)$/i, ".jpg");
          const jpgRes = await fetch(jpgUrl);
          if (jpgRes.ok) {
            const ct = jpgRes.headers.get("content-type") || "";
            if (ct.includes("image/jpeg") || ct.includes("image/png")) {
              const buf = await jpgRes.arrayBuffer();
              logoSrc = `data:${ct};base64,${Buffer.from(buf).toString("base64")}`;
            }
          }
        }
      } else {
        // URL is already a supported format
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const contentType = logoRes.headers.get("content-type") || "";
          const supported = ["image/png", "image/jpeg", "image/gif", "image/svg+xml"];
          if (supported.some(t => contentType.includes(t))) {
            const buf = await logoRes.arrayBuffer();
            logoSrc = `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
          }
        }
      }
    } catch {
      // continue without logo
    }
  }

  // Sensitivity display label
  const sensitivityLabel: Record<string, string> = {
    gentle: "Gentle Potency",
    medium: "Medium Potency",
    steep: "High Potency",
    very_steep: "Very High Potency",
  };

  // Generate image with @vercel/og
  // Use 720x1280 (HD 9:16) — 1080x1920 exceeds Satori/Resvg WASM memory limits
  try {
  return new ImageResponse(
    (
      <div
        style={{
          width: "720px",
          height: "1280px",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f5f0e8",
          fontFamily: "sans-serif",
          color: "#3a3226",
          padding: "40px",
        }}
      >
        {/* Retailer Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: "28px",
          }}
        >
          {logoSrc && (
            <img
              src={logoSrc}
              width={130}
              height={130}
              style={{ objectFit: "contain", marginBottom: "14px" }}
            />
          )}
          {retailer.storeName && (
            <div
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                textAlign: "center",
              }}
            >
              {retailer.storeName}
            </div>
          )}
          {retailer.address && (
            <div
              style={{
                fontSize: "15px",
                color: "#6b5c4d",
                textAlign: "center",
                marginTop: "6px",
              }}
            >
              {retailer.address}
            </div>
          )}
          {retailer.phone && (
            <div
              style={{
                fontSize: "15px",
                color: "#6b5c4d",
                textAlign: "center",
                marginTop: "3px",
              }}
            >
              {retailer.phone}
            </div>
          )}
        </div>

        {/* Divider */}
        <div
          style={{
            width: "100%",
            height: "2px",
            backgroundColor: "#d4c9b8",
            marginBottom: "28px",
          }}
        />

        {/* Strain Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              fontSize: "28px",
              fontWeight: "bold",
              textAlign: "center",
            }}
          >
            {strain.name}
          </div>
          <div
            style={{
              fontSize: "15px",
              color: "#6b5c4d",
              textAlign: "center",
              marginTop: "6px",
              maxWidth: "540px",
            }}
          >
            {strain.description}
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            width: "100%",
            height: "2px",
            backgroundColor: "#d4c9b8",
            marginBottom: "20px",
          }}
        />

        {/* Dose Guide */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div
            style={{
              fontSize: "19px",
              fontWeight: "bold",
              marginBottom: "4px",
              letterSpacing: "1px",
            }}
          >
            DOSING GUIDE
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "#8a7b6b",
              marginBottom: "16px",
            }}
          >
            {sensitivityLabel[sensitivity] || sensitivity}
          </div>

          {doseRanges.map((range) => (
            <div
              key={range.level}
              style={{
                display: "flex",
                flexDirection: "column",
                marginBottom: "11px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      border: "2px solid #8a7b6b",
                      marginRight: "8px",
                    }}
                  />
                  <span style={{ fontSize: "17px", fontWeight: 600 }}>
                    {range.name}
                  </span>
                </div>
                <span style={{ fontSize: "17px", fontWeight: "bold" }}>
                  {range.display.primary}
                </span>
              </div>
              {range.display.secondary && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#8a7b6b",
                    textAlign: "right",
                    marginTop: "2px",
                  }}
                >
                  {range.display.secondary}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div
          style={{
            width: "100%",
            height: "2px",
            backgroundColor: "#d4c9b8",
            marginTop: "14px",
            marginBottom: "14px",
          }}
        />

        {/* Safety Footer */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "6px",
            }}
          >
            <span style={{ fontSize: "15px", marginRight: "6px" }}>
              &#9888;
            </span>
            <span style={{ fontSize: "15px", color: "#6b5c4d" }}>
              Start low, go slow
            </span>
          </div>
          {strain.onsetTime && (
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: "15px", marginRight: "6px" }}>
                &#9888;
              </span>
              <span style={{ fontSize: "15px", color: "#6b5c4d" }}>
                Allow {strain.onsetTime} for onset
              </span>
            </div>
          )}
        </div>

        {/* Powered By */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <span style={{ fontSize: "12px", color: "#a89882" }}>
            powered by tripd.ar
          </span>
        </div>
      </div>
    ),
    {
      width: 720,
      height: 1280,
      headers: {
        "Content-Disposition": `attachment; filename="${guide.strainSlug}-dose-card.png"`,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    }
  );
  } catch (renderError) {
    console.error("Dose card render error:", renderError);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RENDER_FAILED",
          message: "Failed to generate dose card image.",
        },
      },
      { status: 500 }
    );
  }
}
