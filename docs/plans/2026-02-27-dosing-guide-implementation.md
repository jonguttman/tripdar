# Dosing Guide "To Go" Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a downloadable, retailer-branded dose card image to the recommendation results screen, with QR code delivery, server-side rendering, and full attribution tracking.

**Architecture:** New Prisma model `DosingGuideToken` links recommendation sessions to unique download tokens. WordPress plugin adds retailer branding settings, a "Get Your Dose Card" button on result cards, and QR/download logic. Server-side image generation via `@vercel/og` at `GET /api/v1/dosing-guide/[token]` renders the branded dose card as a PNG. Analytics events track creation and downloads for attribution.

**Tech Stack:** Next.js API routes, Prisma, `@vercel/og` (Satori), WordPress PHP + vanilla JS, QR code client-side generation.

**Design Doc:** `docs/plans/2026-02-27-dosing-guide-to-go-design.md`

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install @vercel/og**

Run: `cd /Users/jonathanguttman/Documents/Tripdar/tripdar && npm install @vercel/og`

**Step 2: Verify installation**

Run: `node -e "require('@vercel/og'); console.log('ok')"`
Expected: `ok`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @vercel/og for dosing guide image generation"
```

---

## Task 2: Add DosingGuideToken Prisma Model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add the DosingGuideToken model to the schema**

Add after the `RecommendationSignal` model (around line 310):

```prisma
model DosingGuideToken {
  id            String    @id @default(cuid())
  token         String    @unique
  sessionId     String
  session       RecommendationSession @relation(fields: [sessionId], references: [id])
  strainSlug    String
  partnerId     String
  retailerData  Json
  createdAt     DateTime  @default(now())
  downloadedAt  DateTime?
  downloadCount Int       @default(0)
  metadata      Json?

  @@index([partnerId, createdAt])
  @@index([token])
  @@index([sessionId])
}
```

Also add the reverse relation to `RecommendationSession`:

```prisma
// Inside RecommendationSession model, add:
dosingGuides  DosingGuideToken[]
```

**Step 2: Add dosing guide event types to the allowed events**

Modify: `src/app/api/v1/events/route.ts` — add `"dosing_guide_created"` and `"dosing_guide_downloaded"` to the `ALLOWED_EVENT_TYPES` array (around line 19).

**Step 3: Generate Prisma client and push schema**

Run: `cd /Users/jonathanguttman/Documents/Tripdar/tripdar && npx prisma generate && npx prisma db push`

Expected: Schema changes applied, new `DosingGuideToken` table created.

**Step 4: Commit**

```bash
git add prisma/schema.prisma src/app/api/v1/events/route.ts
git commit -m "feat: add DosingGuideToken model and dosing guide event types"
```

---

## Task 3: Create Dose Card Utility Functions

**Files:**
- Create: `src/domain/dosing-guide/utils.ts`
- Create: `src/domain/dosing-guide/utils.test.ts`

**Step 1: Write the failing tests**

Create `src/domain/dosing-guide/utils.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  generateDosingGuideToken,
  formatDoseForCard,
  calculateAllDoseRanges,
} from "./utils";

describe("generateDosingGuideToken", () => {
  it("should generate a token starting with dg_", () => {
    const token = generateDosingGuideToken();
    expect(token.startsWith("dg_")).toBe(true);
  });

  it("should generate unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateDosingGuideToken()));
    expect(tokens.size).toBe(100);
  });

  it("should be 15 characters long (dg_ + 12 chars)", () => {
    const token = generateDosingGuideToken();
    expect(token.length).toBe(15);
  });
});

describe("formatDoseForCard", () => {
  it("should format microdose in mg only", () => {
    const result = formatDoseForCard(1, 50, 200);
    expect(result).toEqual({ primary: "50-200 mg", secondary: null });
  });

  it("should format mini-dose in grams with mg secondary", () => {
    const result = formatDoseForCard(2, 250, 750);
    expect(result).toEqual({ primary: "0.25-0.75 g", secondary: "250-750 mg" });
  });

  it("should round grams to nearest 0.25", () => {
    const result = formatDoseForCard(2, 212, 637);
    expect(result).toEqual({ primary: "0.25-0.75 g", secondary: "250-750 mg" });
  });

  it("should round mg secondary to match rounded grams", () => {
    const result = formatDoseForCard(3, 425, 1700);
    expect(result).toEqual({ primary: "0.5-1.75 g", secondary: "500-1750 mg" });
  });

  it("should handle heroic dose ranges", () => {
    const result = formatDoseForCard(6, 4250, 6375);
    expect(result).toEqual({ primary: "4.25-6.5 g", secondary: "4250-6500 mg" });
  });
});

describe("calculateAllDoseRanges", () => {
  it("should return 6 dose levels for gentle sensitivity", () => {
    const ranges = calculateAllDoseRanges("gentle");
    expect(ranges).toHaveLength(6);
    expect(ranges[0].name).toBe("Microdose");
    expect(ranges[0].lowMg).toBe(50);
    expect(ranges[0].highMg).toBe(250);
  });

  it("should apply medium sensitivity modifier (0.85x)", () => {
    const ranges = calculateAllDoseRanges("medium");
    // Microdose: 50*0.85=42.5 → rounded to 0.25g boundaries
    expect(ranges[0].lowMg).toBeLessThan(50);
  });

  it("should apply very_steep sensitivity modifier (0.55x)", () => {
    const ranges = calculateAllDoseRanges("very_steep");
    expect(ranges[0].lowMg).toBeLessThan(ranges[0].highMg);
    // All ranges should be significantly lower than gentle
    const gentleRanges = calculateAllDoseRanges("gentle");
    for (let i = 0; i < 6; i++) {
      expect(ranges[i].highMg).toBeLessThan(gentleRanges[i].highMg);
    }
  });

  it("should include formatted display strings", () => {
    const ranges = calculateAllDoseRanges("gentle");
    expect(ranges[0].display.primary).toBe("50-250 mg");
    expect(ranges[0].display.secondary).toBeNull();
    expect(ranges[1].display.primary).toBe("0.25-0.75 g");
    expect(ranges[1].display.secondary).toBe("250-750 mg");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/jonathanguttman/Documents/Tripdar/tripdar && npx vitest run src/domain/dosing-guide/utils.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/domain/dosing-guide/utils.ts`:

```typescript
import {
  CANONICAL_DOSE_LEVELS,
  DOSE_SENSITIVITY_MODIFIERS,
  type DoseSensitivity,
} from "../recommendation-engine/types";

/**
 * Generate a unique dosing guide token.
 * Format: dg_ + 12 random alphanumeric chars.
 */
export function generateDosingGuideToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "dg_";
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Round milligrams to the nearest 0.25g boundary, return as mg.
 */
function roundToQuarterGram(mg: number): number {
  return Math.round((mg / 1000) * 4) / 4 * 1000;
}

/**
 * Format a dose range for display on the dose card.
 * - Level 1 (Microdose): mg only
 * - Levels 2-6: grams primary (rounded to 0.25g), mg secondary
 */
export function formatDoseForCard(
  level: number,
  lowMg: number,
  highMg: number
): { primary: string; secondary: string | null } {
  if (level === 1) {
    const roundedLow = roundToQuarterGram(lowMg);
    const roundedHigh = roundToQuarterGram(highMg);
    return {
      primary: `${roundedLow}-${roundedHigh} mg`,
      secondary: null,
    };
  }

  const roundedLowMg = roundToQuarterGram(lowMg);
  const roundedHighMg = roundToQuarterGram(highMg);
  const lowG = roundedLowMg / 1000;
  const highG = roundedHighMg / 1000;

  return {
    primary: `${lowG}-${highG} g`,
    secondary: `${roundedLowMg}-${roundedHighMg} mg`,
  };
}

export interface DoseRangeForCard {
  level: number;
  name: string;
  lowMg: number;
  highMg: number;
  descriptors: string[];
  display: { primary: string; secondary: string | null };
}

/**
 * Calculate all 6 dose ranges for a given sensitivity, formatted for the dose card.
 */
export function calculateAllDoseRanges(sensitivity: DoseSensitivity): DoseRangeForCard[] {
  const modifier = DOSE_SENSITIVITY_MODIFIERS[sensitivity];

  return CANONICAL_DOSE_LEVELS.map((level) => {
    const lowMg = Math.round(level.standardLowMg * modifier);
    const highMg = Math.round(level.standardHighMg * modifier);

    return {
      level: level.level,
      name: level.name,
      lowMg,
      highMg,
      descriptors: level.descriptors,
      display: formatDoseForCard(level.level, lowMg, highMg),
    };
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/jonathanguttman/Documents/Tripdar/tripdar && npx vitest run src/domain/dosing-guide/utils.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/domain/dosing-guide/utils.ts src/domain/dosing-guide/utils.test.ts
git commit -m "feat: add dose card utility functions with formatting and token generation"
```

---

## Task 4: Create POST /api/v1/dosing-guide/create Route

**Files:**
- Create: `src/app/api/v1/dosing-guide/create/route.ts`
- Modify: `src/middleware.ts` (add to postAllowedPaths)

**Step 1: Update middleware to allow POST to /api/v1/dosing-guide**

In `src/middleware.ts`, find `postAllowedPaths` (line 198) and add `"/api/v1/dosing-guide"`:

```typescript
const postAllowedPaths = ["/api/v1/quiz", "/api/v1/feedback", "/api/v1/events", "/api/v1/reports", "/api/v1/recommend", "/api/v1/dosing-guide"];
```

**Step 2: Create the route handler**

Create `src/app/api/v1/dosing-guide/create/route.ts`:

```typescript
/**
 * POST /api/v1/dosing-guide/create
 *
 * Creates a dosing guide token for a specific strain from a recommendation session.
 * Returns a public URL that serves the branded dose card image.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authenticateRequest, withLogging, createMeta, addPartnerHeaders } from "@/domain/partner/access";
import { generateDosingGuideToken } from "@/domain/dosing-guide/utils";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/dosing-guide/create", async () => {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
        { status: 400 }
      );
    }

    const { sessionToken, strainSlug, retailerBranding } = body as {
      sessionToken?: string;
      strainSlug?: string;
      retailerBranding?: { logoUrl?: string; storeName?: string; address?: string; phone?: string };
    };

    // Validate required fields
    if (!sessionToken || typeof sessionToken !== "string") {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_SESSION_TOKEN", message: "sessionToken is required." } },
        { status: 400 }
      );
    }

    if (!strainSlug || typeof strainSlug !== "string") {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_STRAIN_SLUG", message: "strainSlug is required." } },
        { status: 400 }
      );
    }

    // Verify session exists and belongs to this partner
    const session = await prisma.recommendationSession.findUnique({
      where: { sessionToken },
    });

    if (!session || session.partnerId !== partner.id) {
      return NextResponse.json(
        { success: false, error: { code: "SESSION_NOT_FOUND", message: "Recommendation session not found." } },
        { status: 404 }
      );
    }

    // Generate token and create record
    const token = generateDosingGuideToken();

    const guide = await prisma.dosingGuideToken.create({
      data: {
        token,
        sessionId: session.id,
        strainSlug,
        partnerId: partner.id,
        retailerData: retailerBranding || {},
      },
    });

    // Record analytics event
    await prisma.analyticsEvent.create({
      data: {
        eventType: "dosing_guide_created",
        entitySlug: strainSlug,
        partnerId: partner.id,
        sessionHash: sessionToken,
        metadata: { guideToken: token },
      },
    });

    const url = `https://www.tripd.ar/api/v1/dosing-guide/${token}`;

    const response = NextResponse.json({
      success: true,
      data: { token, url, meta: createMeta(context) },
    });

    return addPartnerHeaders(response, partner);
  });
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, X-API-Key, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
```

**Step 3: Verify the app builds**

Run: `cd /Users/jonathanguttman/Documents/Tripdar/tripdar && npx next build`
Expected: Build succeeds (or at minimum no TypeScript errors on new files)

**Step 4: Commit**

```bash
git add src/app/api/v1/dosing-guide/create/route.ts src/middleware.ts
git commit -m "feat: add POST /api/v1/dosing-guide/create endpoint with attribution tracking"
```

---

## Task 5: Create GET /api/v1/dosing-guide/[token] Image Route

This is the public endpoint that serves the branded PNG dose card image. No authentication required — only a valid token.

**Files:**
- Create: `src/app/api/v1/dosing-guide/[token]/route.tsx`

**Step 1: Create the image generation route**

Create `src/app/api/v1/dosing-guide/[token]/route.tsx`:

```tsx
/**
 * GET /api/v1/dosing-guide/[token]
 *
 * Public endpoint: serves a branded dose card PNG image.
 * No API key required — token validation only.
 * Uses @vercel/og (Satori) for server-side image generation.
 */

import { ImageResponse } from "@vercel/og";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { loadStrainData } from "@/domain/strain/blob-store";
import { mapDoseSensitivity } from "@/domain/strain/strain-profiles";
import { calculateAllDoseRanges } from "@/domain/dosing-guide/utils";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Look up token
  const guide = await prisma.dosingGuideToken.findUnique({
    where: { token },
  });

  if (!guide) {
    return NextResponse.json(
      { success: false, error: { code: "TOKEN_NOT_FOUND", message: "Invalid dosing guide token." } },
      { status: 404 }
    );
  }

  // Record download event
  const userAgent = request.headers.get("user-agent") || "";
  const referrer = request.headers.get("referer") || "";

  await prisma.$transaction([
    prisma.dosingGuideToken.update({
      where: { id: guide.id },
      data: {
        downloadCount: { increment: 1 },
        downloadedAt: guide.downloadedAt || new Date(),
        metadata: { userAgent, referrer, lastDownloadAt: new Date().toISOString() },
      },
    }),
    prisma.analyticsEvent.create({
      data: {
        eventType: "dosing_guide_downloaded",
        entitySlug: guide.strainSlug,
        partnerId: guide.partnerId,
        sessionHash: guide.token,
        metadata: { userAgent, referrer },
      },
    }),
  ]);

  // Load strain data
  const strains = await loadStrainData();
  const strain = strains.find((s) => s.id === guide.strainSlug || s.name.toLowerCase().replace(/\s+/g, "-") === guide.strainSlug);

  if (!strain) {
    return NextResponse.json(
      { success: false, error: { code: "STRAIN_NOT_FOUND", message: "Strain data not found." } },
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

  // Fetch retailer logo if provided
  let logoData: ArrayBuffer | null = null;
  if (retailer.logoUrl) {
    try {
      const logoRes = await fetch(retailer.logoUrl);
      if (logoRes.ok) logoData = await logoRes.arrayBuffer();
    } catch {
      // Logo fetch failed — continue without it
    }
  }

  // Fetch strain visualization if available
  let strainImageData: ArrayBuffer | null = null;
  try {
    const vizRes = await fetch(
      `https://www.tripd.ar/api/v1/strains/${guide.strainSlug}/visualization`,
      { headers: { "X-API-Key": process.env.TRIPDAR_INTERNAL_KEY || "" } }
    );
    if (vizRes.ok) {
      const vizJson = await vizRes.json();
      if (vizJson.data?.visualizationUrl) {
        const imgRes = await fetch(vizJson.data.visualizationUrl);
        if (imgRes.ok) strainImageData = await imgRes.arrayBuffer();
      }
    }
  } catch {
    // Strain image not available — continue without it
  }

  // Sensitivity display label
  const sensitivityLabel = {
    gentle: "Gentle Potency",
    medium: "Medium Potency",
    steep: "High Potency",
    very_steep: "Very High Potency",
  }[sensitivity];

  // Generate image
  return new ImageResponse(
    (
      <div
        style={{
          width: "1080px",
          height: "1920px",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f5f0e8",
          fontFamily: "sans-serif",
          color: "#3a3226",
          padding: "60px",
        }}
      >
        {/* Retailer Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "40px" }}>
          {logoData && (
            <img
              src={`data:image/png;base64,${Buffer.from(logoData).toString("base64")}`}
              width={200}
              height={200}
              style={{ objectFit: "contain", marginBottom: "20px" }}
            />
          )}
          {retailer.storeName && (
            <div style={{ fontSize: "36px", fontWeight: "bold", textAlign: "center" }}>
              {retailer.storeName}
            </div>
          )}
          {retailer.address && (
            <div style={{ fontSize: "22px", color: "#6b5c4d", textAlign: "center", marginTop: "8px" }}>
              {retailer.address}
            </div>
          )}
          {retailer.phone && (
            <div style={{ fontSize: "22px", color: "#6b5c4d", textAlign: "center", marginTop: "4px" }}>
              {retailer.phone}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: "100%", height: "2px", backgroundColor: "#d4c9b8", marginBottom: "40px" }} />

        {/* Strain Section */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "40px" }}>
          {strainImageData && (
            <img
              src={`data:image/png;base64,${Buffer.from(strainImageData).toString("base64")}`}
              width={280}
              height={280}
              style={{ objectFit: "contain", marginBottom: "20px", borderRadius: "20px" }}
            />
          )}
          <div style={{ fontSize: "42px", fontWeight: "bold", textAlign: "center" }}>
            {strain.name}
          </div>
          <div style={{ fontSize: "22px", color: "#6b5c4d", textAlign: "center", marginTop: "8px", maxWidth: "800px" }}>
            {strain.description}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: "100%", height: "2px", backgroundColor: "#d4c9b8", marginBottom: "30px" }} />

        {/* Dose Guide */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: "28px", fontWeight: "bold", marginBottom: "6px", letterSpacing: "2px" }}>
            DOSING GUIDE
          </div>
          <div style={{ fontSize: "20px", color: "#8a7b6b", marginBottom: "24px" }}>
            {sensitivityLabel}
          </div>

          {doseRanges.map((range) => (
            <div key={range.level} style={{ display: "flex", flexDirection: "column", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    border: "2px solid #8a7b6b",
                    marginRight: "12px",
                  }} />
                  <span style={{ fontSize: "26px", fontWeight: "600" }}>{range.name}</span>
                </div>
                <span style={{ fontSize: "26px", fontWeight: "bold" }}>{range.display.primary}</span>
              </div>
              {range.display.secondary && (
                <div style={{ fontSize: "18px", color: "#8a7b6b", textAlign: "right", marginTop: "2px" }}>
                  {range.display.secondary}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: "100%", height: "2px", backgroundColor: "#d4c9b8", marginTop: "20px", marginBottom: "20px" }} />

        {/* Safety Footer */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: "30px" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "22px", marginRight: "8px" }}>⚠</span>
            <span style={{ fontSize: "22px", color: "#6b5c4d" }}>Start low, go slow</span>
          </div>
          {strain.onsetTime && (
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: "22px", marginRight: "8px" }}>⚠</span>
              <span style={{ fontSize: "22px", color: "#6b5c4d" }}>
                Allow {strain.onsetTime} for onset
              </span>
            </div>
          )}
        </div>

        {/* Powered By */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <span style={{ fontSize: "18px", color: "#a89882" }}>powered by tripd.ar</span>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      headers: {
        "Content-Disposition": `attachment; filename="${guide.strainSlug}-dose-card.png"`,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    }
  );
}
```

**Step 2: Handle middleware bypass for public GET endpoint**

The GET endpoint at `/api/v1/dosing-guide/[token]` is public (no API key). The middleware currently blocks all `/api/v1/*` requests without an API key.

In `src/middleware.ts`, add a bypass before the API key check (after line 103):

```typescript
// Public endpoints that don't require API key
const publicPaths = ["/api/v1/dosing-guide/"];
const isPublicGet = request.method === "GET" && publicPaths.some(p => pathname.startsWith(p) && pathname.length > p.length);

if (isPublicGet) {
  const response = NextResponse.next();
  response.headers.set("X-Request-ID", requestId);
  return response;
}
```

Add this BEFORE the `if (!apiKey)` check.

**Step 3: Verify build**

Run: `cd /Users/jonathanguttman/Documents/Tripdar/tripdar && npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/api/v1/dosing-guide/[token]/route.tsx src/middleware.ts
git commit -m "feat: add public dosing guide image endpoint with @vercel/og rendering"
```

---

## Task 6: WordPress Admin Settings for Dosing Guide

**Files:**
- Modify: `wordpress-plugin/tripdar-recommendation-engine/admin/class-admin.php`
- Modify: `wordpress-plugin/tripdar-recommendation-engine/admin/views/settings.php`

**Step 1: Register new settings in class-admin.php**

In the `register_settings()` method, add these new settings registrations:

```php
register_setting('tripdar_rec_settings', 'tripdar_rec_dosing_guide_enabled', [
    'type' => 'boolean',
    'sanitize_callback' => 'rest_sanitize_boolean',
    'default' => false,
]);
register_setting('tripdar_rec_settings', 'tripdar_rec_store_logo', [
    'type' => 'string',
    'sanitize_callback' => 'esc_url_raw',
    'default' => '',
]);
register_setting('tripdar_rec_settings', 'tripdar_rec_store_name', [
    'type' => 'string',
    'sanitize_callback' => 'sanitize_text_field',
    'default' => '',
]);
register_setting('tripdar_rec_settings', 'tripdar_rec_store_address', [
    'type' => 'string',
    'sanitize_callback' => 'sanitize_textarea_field',
    'default' => '',
]);
register_setting('tripdar_rec_settings', 'tripdar_rec_store_phone', [
    'type' => 'string',
    'sanitize_callback' => 'sanitize_text_field',
    'default' => '',
]);
register_setting('tripdar_rec_settings', 'tripdar_rec_force_qr', [
    'type' => 'boolean',
    'sanitize_callback' => 'rest_sanitize_boolean',
    'default' => false,
]);
```

**Step 2: Add the media uploader script to admin assets**

In the `enqueue_admin_assets()` method, add:

```php
wp_enqueue_media(); // For the logo upload button
```

**Step 3: Add AJAX handler for dosing guide creation**

In the `register()` method, add:

```php
add_action('wp_ajax_tripdar_rec_dosing_guide', [$this, 'ajax_create_dosing_guide']);
add_action('wp_ajax_nopriv_tripdar_rec_dosing_guide', [$this, 'ajax_create_dosing_guide']);
```

Add the handler method:

```php
public function ajax_create_dosing_guide() {
    check_ajax_referer('tripdar_rec_nonce', 'nonce');

    $session_token = isset($_POST['sessionToken']) ? sanitize_text_field($_POST['sessionToken']) : '';
    $strain_slug = isset($_POST['strainSlug']) ? sanitize_text_field($_POST['strainSlug']) : '';

    if (empty($session_token) || empty($strain_slug)) {
        wp_send_json_error(['message' => 'Missing required fields']);
    }

    $retailer_branding = [
        'logoUrl' => get_option('tripdar_rec_store_logo', ''),
        'storeName' => get_option('tripdar_rec_store_name', ''),
        'address' => get_option('tripdar_rec_store_address', ''),
        'phone' => get_option('tripdar_rec_store_phone', ''),
    ];

    $response = $this->api->create_dosing_guide($session_token, $strain_slug, $retailer_branding);

    if ($response && isset($response['success']) && $response['success']) {
        wp_send_json_success($response['data']);
    } else {
        wp_send_json_error($response['error'] ?? ['message' => 'Failed to create dosing guide']);
    }
}
```

**Step 4: Add the settings UI to settings.php**

Add a new section at the bottom of the settings form, before the closing `</form>` tag:

```php
<h2 class="title">Dosing Guide Settings</h2>
<table class="form-table">
    <tr>
        <th scope="row">Enable Dosing Guide</th>
        <td>
            <label>
                <input type="checkbox" name="tripdar_rec_dosing_guide_enabled" value="1"
                    <?php checked(get_option('tripdar_rec_dosing_guide_enabled', false)); ?>>
                Show "Get Your Dose Card" button on result cards
            </label>
        </td>
    </tr>
    <tr>
        <th scope="row">Store Logo</th>
        <td>
            <?php $logo_url = get_option('tripdar_rec_store_logo', ''); ?>
            <div id="tripdar-logo-preview" style="margin-bottom: 10px;">
                <?php if ($logo_url): ?>
                    <img src="<?php echo esc_url($logo_url); ?>" style="max-width: 200px; max-height: 200px;">
                <?php endif; ?>
            </div>
            <input type="hidden" name="tripdar_rec_store_logo" id="tripdar-store-logo" value="<?php echo esc_attr($logo_url); ?>">
            <button type="button" class="button" id="tripdar-upload-logo">Upload Logo</button>
            <?php if ($logo_url): ?>
                <button type="button" class="button" id="tripdar-remove-logo">Remove</button>
            <?php endif; ?>
            <p class="description">PNG recommended. This appears at the top of the dose card.</p>
        </td>
    </tr>
    <tr>
        <th scope="row">Store Name</th>
        <td>
            <input type="text" name="tripdar_rec_store_name" class="regular-text"
                value="<?php echo esc_attr(get_option('tripdar_rec_store_name', '')); ?>">
        </td>
    </tr>
    <tr>
        <th scope="row">Store Address</th>
        <td>
            <textarea name="tripdar_rec_store_address" class="large-text" rows="2"><?php echo esc_textarea(get_option('tripdar_rec_store_address', '')); ?></textarea>
        </td>
    </tr>
    <tr>
        <th scope="row">Store Phone</th>
        <td>
            <input type="text" name="tripdar_rec_store_phone" class="regular-text"
                value="<?php echo esc_attr(get_option('tripdar_rec_store_phone', '')); ?>">
        </td>
    </tr>
    <tr>
        <th scope="row">Always Show QR Code</th>
        <td>
            <label>
                <input type="checkbox" name="tripdar_rec_force_qr" value="1"
                    <?php checked(get_option('tripdar_rec_force_qr', false)); ?>>
                Show QR code on all devices (useful for in-store kiosks)
            </label>
        </td>
    </tr>
</table>

<script>
jQuery(function($) {
    $('#tripdar-upload-logo').on('click', function(e) {
        e.preventDefault();
        var frame = wp.media({ title: 'Select Store Logo', multiple: false, library: { type: 'image' } });
        frame.on('select', function() {
            var attachment = frame.state().get('selection').first().toJSON();
            $('#tripdar-store-logo').val(attachment.url);
            $('#tripdar-logo-preview').html('<img src="' + attachment.url + '" style="max-width: 200px; max-height: 200px;">');
        });
        frame.open();
    });
    $('#tripdar-remove-logo').on('click', function(e) {
        e.preventDefault();
        $('#tripdar-store-logo').val('');
        $('#tripdar-logo-preview').html('');
        $(this).hide();
    });
});
</script>
```

**Step 5: Add API client method**

In `wordpress-plugin/tripdar-recommendation-engine/includes/class-api-client.php`, add:

```php
public function create_dosing_guide($session_token, $strain_slug, $retailer_branding) {
    return $this->post('/dosing-guide/create', [
        'sessionToken' => $session_token,
        'strainSlug' => $strain_slug,
        'retailerBranding' => $retailer_branding,
    ]);
}
```

**Step 6: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/admin/class-admin.php \
        wordpress-plugin/tripdar-recommendation-engine/admin/views/settings.php \
        wordpress-plugin/tripdar-recommendation-engine/includes/class-api-client.php
git commit -m "feat: add dosing guide admin settings with logo upload and store branding"
```

---

## Task 7: Frontend JS — Dose Card Button and QR/Download Logic

**Files:**
- Modify: `wordpress-plugin/tripdar-recommendation-engine/assets/js/recommendation-engine.js`
- Modify: `wordpress-plugin/tripdar-recommendation-engine/includes/class-shortcodes.php`
- Modify: `wordpress-plugin/tripdar-recommendation-engine/assets/css/recommendation-engine.css`

**Step 1: Add dosing guide config to wp_localize_script**

In `tripdar-recommendation-engine.php`, modify the `enqueue_frontend_assets()` method to include dosing guide settings in the localized data:

```php
wp_localize_script('tripdar-recommendation-engine', 'tripdarRec', [
    'ajaxUrl' => admin_url('admin-ajax.php'),
    'nonce' => wp_create_nonce('tripdar_rec_nonce'),
    'dosingGuideEnabled' => (bool) get_option('tripdar_rec_dosing_guide_enabled', false),
    'forceQr' => (bool) get_option('tripdar_rec_force_qr', false),
]);
```

**Step 2: Add QR code generation to the JS**

At the top of `recommendation-engine.js`, add a minimal QR code generator (or use the inline QR approach). For simplicity, we'll use the QR code API from `api.qrserver.com` which requires no JS library:

In the `TripdarRecommendationEngine` class, add these methods:

```javascript
async requestDoseCard(btn) {
    var strainSlug = btn.dataset.strainSlug;
    var sessionToken = this.sessionToken;

    if (!sessionToken || !strainSlug) return;

    // Show loading state
    var originalText = btn.innerHTML;
    btn.innerHTML = '<span class="tripdar-rec__loading-spinner-small"></span> Creating...';
    btn.disabled = true;

    try {
        var response = await this.ajax('tripdar_rec_dosing_guide', {
            sessionToken: sessionToken,
            strainSlug: strainSlug,
        });

        if (response.success && response.data && response.data.url) {
            var url = response.data.url;
            var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            var forceQr = typeof tripdarRec !== 'undefined' && tripdarRec.forceQr;

            if (isMobile && !forceQr) {
                // Direct download
                this.triggerDownload(url, strainSlug);
                btn.innerHTML = '✓ Saved!';
                setTimeout(function() { btn.innerHTML = originalText; btn.disabled = false; }, 3000);
            } else {
                // Show QR popover
                this.showQrPopover(btn, url, strainSlug);
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } else {
            btn.innerHTML = 'Try Again';
            btn.disabled = false;
            setTimeout(function() { btn.innerHTML = originalText; }, 3000);
        }
    } catch (e) {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

triggerDownload(url, strainSlug) {
    var a = document.createElement('a');
    a.href = url;
    a.download = strainSlug + '-dose-card.png';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

showQrPopover(btn, url, strainSlug) {
    // Remove any existing popover
    var existing = this.container.querySelector('.tripdar-rec__qr-popover');
    if (existing) existing.remove();

    var popover = document.createElement('div');
    popover.className = 'tripdar-rec__qr-popover';
    popover.innerHTML = '<div class="tripdar-rec__qr-popover-inner">'
        + '<button type="button" class="tripdar-rec__qr-close">&times;</button>'
        + '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url) + '" '
        + 'alt="QR Code" width="200" height="200">'
        + '<p>Scan to save your dose card</p>'
        + '<a href="' + url + '" download="' + strainSlug + '-dose-card.png" class="tripdar-rec__qr-download">Or download here</a>'
        + '</div>';

    btn.parentNode.style.position = 'relative';
    btn.parentNode.appendChild(popover);

    popover.querySelector('.tripdar-rec__qr-close').addEventListener('click', function() {
        popover.remove();
    });
}
```

**Step 3: Bind the dose card buttons in bindEvents()**

In the `bindEvents()` method, add:

```javascript
// Dose card buttons
this.container.querySelectorAll('.tripdar-rec__get-dose-card').forEach(btn => {
    btn.addEventListener('click', () => this.requestDoseCard(btn));
});
```

**Step 4: Add the button to result card rendering**

In the result card rendering section of the JS (the `renderResults` or `showResults` method), add the button HTML to each card. Find where result cards are built and add after the existing card content:

```javascript
// Inside the result card HTML template, at the bottom of each card:
if (typeof tripdarRec !== 'undefined' && tripdarRec.dosingGuideEnabled) {
    cardHtml += '<button type="button" class="tripdar-rec__get-dose-card" data-strain-slug="' + result.strainSlug + '">'
        + '📲 Get Your Dose Card'
        + '</button>';
}
```

After rendering the cards, re-bind dose card button events since they're dynamically created:

```javascript
// After inserting result card HTML:
this.container.querySelectorAll('.tripdar-rec__get-dose-card').forEach(btn => {
    btn.addEventListener('click', () => this.requestDoseCard(btn));
});
```

**Step 5: Add CSS for the dose card button and QR popover**

Add to `recommendation-engine.css`:

```css
/* Dose Card Button */
.tripdar-rec__get-dose-card {
    display: block;
    width: 100%;
    padding: var(--tripdar-space-sm) var(--tripdar-space-md);
    margin-top: var(--tripdar-space-md);
    background: var(--tripdar-cream, #f5f0e8);
    border: 2px solid var(--tripdar-ink-light, #6b5c4d);
    border-radius: var(--tripdar-radius, 12px);
    font-family: var(--tripdar-font-body);
    font-size: 1rem;
    font-weight: 600;
    color: var(--tripdar-ink, #3a3226);
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
    text-align: center;
}

.tripdar-rec__get-dose-card:hover {
    background: var(--tripdar-ink-light, #6b5c4d);
    color: var(--tripdar-cream, #f5f0e8);
}

.tripdar-rec__get-dose-card:active {
    transform: scale(0.98);
}

.tripdar-rec__get-dose-card:disabled {
    opacity: 0.6;
    cursor: wait;
}

/* Loading spinner for button */
.tripdar-rec__loading-spinner-small {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: tripdar-spin 0.8s linear infinite;
    vertical-align: middle;
    margin-right: 6px;
}

/* QR Popover */
.tripdar-rec__qr-popover {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    margin-bottom: 10px;
}

.tripdar-rec__qr-popover-inner {
    background: var(--tripdar-cream, #f5f0e8);
    border: 2px solid var(--tripdar-ink-light, #6b5c4d);
    border-radius: var(--tripdar-radius, 12px);
    padding: var(--tripdar-space-md);
    text-align: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    min-width: 260px;
}

.tripdar-rec__qr-close {
    position: absolute;
    top: 8px;
    right: 12px;
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--tripdar-ink-light, #6b5c4d);
    line-height: 1;
}

.tripdar-rec__qr-popover img {
    display: block;
    margin: 0 auto var(--tripdar-space-sm);
}

.tripdar-rec__qr-popover p {
    font-family: var(--tripdar-font-body);
    font-size: 0.9rem;
    color: var(--tripdar-ink-light, #6b5c4d);
    margin: 0 0 var(--tripdar-space-xs);
}

.tripdar-rec__qr-download {
    font-family: var(--tripdar-font-body);
    font-size: 0.85rem;
    color: var(--tripdar-accent, #c17f3a);
}
```

**Step 6: Commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/tripdar-recommendation-engine.php \
        wordpress-plugin/tripdar-recommendation-engine/assets/js/recommendation-engine.js \
        wordpress-plugin/tripdar-recommendation-engine/assets/css/recommendation-engine.css
git commit -m "feat: add Get Your Dose Card button with QR popover and mobile download"
```

---

## Task 8: Version Bump, Zip, and Deploy

**Files:**
- Modify: `wordpress-plugin/tripdar-recommendation-engine/tripdar-recommendation-engine.php` (version bump)

**Step 1: Bump plugin version**

Update version from `1.0.7` to `1.1.0` (new feature = minor bump) in both the file header comment and the `TRIPDAR_REC_VERSION` constant.

**Step 2: Update CHANGELOG.md**

Add entry to `docs/CHANGELOG.md`:

```markdown
## [1.1.0] - 2026-02-27

### Added
- Dosing guide "to go" feature: downloadable, retailer-branded dose cards
- Server-side image generation via @vercel/og (Satori)
- QR code display for desktop, direct download for mobile
- Admin settings for store logo, name, address, phone, force QR mode
- DosingGuideToken model for attribution tracking
- Analytics events: dosing_guide_created, dosing_guide_downloaded
- POST /api/v1/dosing-guide/create endpoint
- GET /api/v1/dosing-guide/[token] public image endpoint
```

**Step 3: Create plugin zip**

Run:
```bash
cd /Users/jonathanguttman/Documents/Tripdar/tripdar/wordpress-plugin && \
zip -r ~/Desktop/tripdar-recommendation-engine-v1.1.0.zip tripdar-recommendation-engine/ \
  -x "*.DS_Store" "*__MACOSX*"
```

**Step 4: Push to Vercel**

```bash
cd /Users/jonathanguttman/Documents/Tripdar/tripdar && git push origin main
```

**Step 5: Final commit**

```bash
git add wordpress-plugin/tripdar-recommendation-engine/tripdar-recommendation-engine.php docs/CHANGELOG.md
git commit -m "chore: bump recommendation engine to v1.1.0 with dosing guide feature"
```

---

## Task 9: Manual Testing Checklist

After deploying, verify:

1. **WordPress Admin:**
   - [ ] Dosing Guide Settings section appears on settings page
   - [ ] Logo upload works via media library
   - [ ] Store name, address, phone fields save correctly
   - [ ] Enable/disable toggle works
   - [ ] Force QR checkbox works

2. **Frontend (mobile):**
   - [ ] "Get Your Dose Card" button appears on each result card (when enabled)
   - [ ] Clicking button shows loading state
   - [ ] Image auto-downloads on mobile
   - [ ] Downloaded image is correct 1080x1920 PNG
   - [ ] Retailer logo, name, address, phone display correctly
   - [ ] Strain name, description, image display correctly
   - [ ] Dose ranges are strain-specific (adjusted by sensitivity)
   - [ ] Microdose shows mg only; others show g primary, mg secondary
   - [ ] Gram values rounded to nearest 0.25

3. **Frontend (desktop):**
   - [ ] QR code popover appears
   - [ ] Scanning QR code downloads the image
   - [ ] "Or download here" link works
   - [ ] Close button dismisses popover

4. **Force QR mode:**
   - [ ] When enabled, QR shows on mobile too

5. **Attribution:**
   - [ ] AnalyticsEvent records `dosing_guide_created` on button click
   - [ ] AnalyticsEvent records `dosing_guide_downloaded` on image access
   - [ ] DosingGuideToken.downloadCount increments
   - [ ] DosingGuideToken.downloadedAt set on first download
