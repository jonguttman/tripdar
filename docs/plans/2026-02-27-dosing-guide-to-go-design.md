# Dosing Guide "To Go" — Design Document

**Date:** 2026-02-27
**Status:** Approved

## Overview

A downloadable, phone-optimized dose card for each strain. Appears on the recommendation results screen. Branded to the retailer with a subtle "powered by Tripd.ar" footer. Each card gets a unique token for full attribution tracking from recommendation session through in-store QR scan.

## User Flow

1. User completes recommendation flow, sees results
2. Each result card has a "Get Your Dose Card" button
3. Button click triggers AJAX to tripd.ar, which creates a `DosingGuideToken` and returns a URL
4. **Mobile (default):** "Save to Phone" link triggers auto-download from tripd.ar
5. **Desktop (default):** QR code popover appears — scan with phone to download
6. **Force QR mode (admin override):** Always shows QR regardless of device — useful for in-store kiosks
7. When the tripd.ar URL is accessed: record analytics event, generate image, return PNG as attachment download

## Dose Card Image Layout (1080x1920px, portrait)

```
┌──────────────────────────────┐
│                              │
│        [RETAILER LOGO]       │
│        Store Name            │
│        Address               │
│        Phone                 │
│                              │
├──────────────────────────────┤
│                              │
│       [MUSHROOM IMAGE]       │
│                              │
│       Strain Name            │
│       Short description      │
│                              │
├──────────────────────────────┤
│                              │
│  DOSING GUIDE                │
│  sensitivity level           │
│                              │
│  ○ Microdose      50-200 mg  │
│  ○ Mini-dose    0.25-0.75 g  │
│                   250-750mg  │
│  ○ Macro Dose   0.5-1.75 g   │
│                  500-1750mg  │
│  ○ Museum Dose  1.25-3.0 g   │
│                 1250-3000mg  │
│  ○ Megadose     3.0-4.25 g   │
│                 3000-4250mg  │
│  ○ Heroic Dose  4.25-6.5 g   │
│                 4250-6500mg  │
│                              │
├──────────────────────────────┤
│  ⚠ Start low, go slow       │
│  ⚠ Allow 45-60 min onset    │
│                              │
│         powered by tripd.ar  │
└──────────────────────────────┘
```

### Dose display rules

- Microdose: milligrams only
- All levels above microdose: grams as primary unit (rounded to nearest 0.25g), milligrams in small print underneath
- Dose ranges are strain-specific, adjusted by dose sensitivity modifier (gentle 1.0x, medium 0.85x, steep 0.7x, very_steep 0.55x)
- Theme inherits from retailer's WordPress theme setting (parchment/dark/minimal)

## Data Model

### New Prisma model: DosingGuideToken

```prisma
model DosingGuideToken {
  id            String    @id @default(cuid())
  token         String    @unique   // "dg_" + 12 random chars
  sessionId     String
  session       RecommendationSession @relation(fields: [sessionId], references: [id])
  strainSlug    String
  partnerId     String
  retailerData  Json      // { logoUrl, storeName, address, phone }
  createdAt     DateTime  @default(now())
  downloadedAt  DateTime? // null until first access
  downloadCount Int       @default(0)
  metadata      Json?     // device info, referrer on download
}
```

## API Routes

### POST /api/v1/dosing-guide/create
- **Auth:** Partner API key
- **Body:** `{ sessionToken, strainSlug, retailerBranding: { logoUrl, storeName, address, phone } }`
- **Returns:** `{ success: true, data: { token, url } }`
- **Action:** Creates DosingGuideToken, records `dosing_guide_created` analytics event

### GET /api/v1/dosing-guide/[token]
- **Auth:** None (public URL — what QR codes point to)
- **Returns:** PNG image with `Content-Disposition: attachment; filename="[strain]-dose-card.png"`
- **Action:**
  1. Look up token, get strain data + retailer branding
  2. Record `dosing_guide_downloaded` analytics event (device, referrer, userAgent)
  3. Increment downloadCount, set downloadedAt on first access
  4. Generate image via `@vercel/og` (Satori), cache at edge
  5. Return PNG

### GET /api/v1/admin/dosing-guide/stats
- **Auth:** Partner API key
- **Returns:** `{ totalGenerated, totalDownloaded, conversionRate, byStrain: [...], recentDownloads: [...] }`

## WordPress Plugin Changes

### Admin settings — new "Dosing Guide" section

| Field | Type | Description |
|---|---|---|
| Enable Dosing Guide | checkbox | Show/hide "Get Your Dose Card" on result cards |
| Store Logo | media upload (PNG) | Retailer logo for the dose card |
| Store Name | text | Retailer name displayed on card |
| Store Address | textarea | Street address |
| Store Phone | text | Phone number |
| Always Show QR Code | checkbox | Override adaptive mobile/desktop behavior |

### New AJAX handler

`wp_ajax_tripdar_rec_dosing_guide` / `wp_ajax_nopriv_tripdar_rec_dosing_guide`
- Calls POST /api/v1/dosing-guide/create with retailer branding from WP settings
- Returns tripd.ar URL to frontend JS

### Frontend JS changes

- Add "Get Your Dose Card" button to each result card
- On click: call AJAX handler, get URL
- Detect mobile vs desktop (or check force-QR setting)
- Mobile: trigger download via hidden anchor with download attribute
- Desktop/force-QR: show popover with QR code (client-side QR generation via lightweight JS lib)

### New WordPress AJAX endpoint in API client

`create_dosing_guide($session_token, $strain_slug)` — POSTs to `/api/v1/dosing-guide/create`

## Image Generation

- Uses `@vercel/og` (Satori) for server-side image rendering
- JSX-based layout rendered to PNG
- Retailer logo fetched from URL, mushroom image from existing strain data
- Edge-cached per unique token (image content never changes after creation)
- 1080x1920px portrait orientation

## Analytics & Attribution

### Events tracked

| Event | Trigger | Data |
|---|---|---|
| `dosing_guide_created` | User clicks "Get Your Dose Card" | sessionToken, strainSlug, partnerId |
| `dosing_guide_downloaded` | QR scanned or download link accessed | token, device, referrer, userAgent |

### Attribution chain

```
Recommendation Session (rec_abc123)
  → Result (Golden Teacher, rank 1)
    → Dosing Guide Token (dg_x7k9m2)
      → Download Event (timestamp, device, referrer)
```

### Metrics available

- Guides generated vs downloaded (conversion rate)
- Per-strain download popularity
- Per-retailer engagement
- Time between recommendation and download
- Correlation between guide downloads and feedback quality
- Device/platform breakdown
- QR scan vs direct tap ratio

## Middleware Update

Add `/api/v1/dosing-guide` to `postAllowedPaths` in `src/middleware.ts` for the create endpoint. The GET endpoint (public download) also needs to pass through — no API key required for download, but token must be valid.

## Dependencies

- `@vercel/og` — server-side image generation (Vercel edge runtime)
- Lightweight QR code JS library for client-side QR rendering (e.g., `qrcode-generator` or similar, no heavy deps)
