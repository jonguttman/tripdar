# Tripdar Data Value Features - Implementation Plan

## Executive Summary

This plan covers 7 features to maximize the value of Tripdar's strain data, plus lineage data verification. Implementation spans both the Next.js server and WordPress plugin.

---

## Lineage Data Verification (Secondary Goal)

### Current State: Infrastructure exists, data is EMPTY

The type definitions support lineage but **none of the 25 strains have lineage data populated**:
```typescript
parentStrains?: string[];    // IDs of parent strains
lineageNotes?: string;       // Breeding/cross notes
generation?: number;         // Distance from wild type
```

### Known Lineage Relationships (from strain descriptions)

| Strain | Parents | Notes | Gen |
|--------|---------|-------|-----|
| tidal-wave | penis-envy + b-plus | PE × B+ hybrid by Magic Myco | 1 |
| enigma | tidal-wave | Stabilized blob mutation | 2 |
| chodewave | tidal-wave | Tidal Wave phenotype selection | 2 |
| trinity | tidal-wave + ? | Stacked PE/Tidal Wave hybrid | 2+ |
| albino-penis-envy | penis-envy | Albino PE offshoot | 1 |
| avalanche | melmac | Yeti × Melmac (Yeti = TAT × PE) | 2 |
| jack-frost | ghost + albino-penis-envy | TAT × APE cross | 2 |
| ghost | golden-teacher | True Albino Teacher isolate | 1 |
| bluey-vuitton | melmac | Panama × Melmac PE hybrid | 1 |
| makilla-gorilla | albino-penis-envy + melmac | APE × DC Melmac | 2 |
| khmer-kong | cambodian | Cambodian derivative | 1 |
| ice | — | ATLY (Thai Lipa Yai) albino isolation | 1 |
| koh-samui-super-strain | — | Koh Samui Classic isolation | 1 |

**Wild types (generation 0):** golden-teacher, penis-envy, b-plus, cambodian, hillbilly, blue-meanie, pink-buffalo, melmac, tosohatchee

---

## Feature 1: Community-Validated Confidence Scores

### Purpose
Dynamically adjust strain confidence based on `strain_tried` + ratings. Display "Verified by X users" badges.

### Database Changes
```prisma
model StrainConfidence {
  id                 String   @id @default(cuid())
  strainSlug         String   @unique
  baseConfidence     Int      // From strain data
  triedCount         Int      @default(0)
  ratingCount        Int      @default(0)
  reportCount        Int      @default(0)
  avgRating          Float?
  computedConfidence Int      @default(0)
  verifiedTier       String   @default("emerging")
  lastUpdated        DateTime @default(now())
}
```

### API Endpoint
`GET /api/v1/strains/[slug]/confidence`

### Confidence Algorithm
```
communityConfidence = baseConfidence × 0.4 + communityScore × 0.6

Tiers:
- verified: 50+ engagements + avg rating ≥ 3.5
- established: 20+ engagements
- developing: 5+ engagements
- emerging: < 5 engagements
```

### WordPress Integration
- New API method: `get_confidence($slug)`
- Display badge on strain cards/detail

---

## Feature 2: Dosage Curves Per Strain

### Purpose
Aggregate trip reports to show expected intensity at different doses.

### Database Changes
```prisma
model DoseCurveData {
  id               String   @id @default(cuid())
  strainSlug       String
  doseCategory     String   // MICRODOSE, LOW, MODERATE, HIGH, HEROIC
  reportCount      Int      @default(0)
  avgPeakIntensity Float?
  minPeakIntensity Int?
  maxPeakIntensity Int?
  lastUpdated      DateTime @default(now())

  @@unique([strainSlug, doseCategory])
}
```

### API Endpoint
`GET /api/v1/strains/[slug]/dosage-curve`

### WordPress Integration
- New shortcode: `[tripdar_dosage_curve slug="golden-teacher"]`
- SVG chart showing intensity by dose category

---

## Feature 3: "People Like You" Recommendations

### Purpose
Collaborative filtering based on "tried" patterns.

### Database Changes
```prisma
model UserStrainProfile {
  id          String   @id @default(cuid())
  sessionHash String
  strainSlug  String
  tried       Boolean  @default(true)
  rating      Int?
  createdAt   DateTime @default(now())

  @@unique([sessionHash, strainSlug])
}

model StrainCorrelation {
  id                String @id @default(cuid())
  strainA           String
  strainB           String
  coOccurrenceCount Int    @default(0)
  similarityScore   Float  @default(0)

  @@unique([strainA, strainB])
}
```

### API Endpoints
- `GET /api/v1/recommendations?sessionHash=xxx`
- `GET /api/v1/strains/[slug]/similar`

### WordPress Integration
- New shortcode: `[tripdar_recommendations]`
- Sync localStorage tried list with server

---

## Feature 4: Setting Correlations

### Purpose
Analyze trip reports by setting to surface insights.

### Database Changes
```prisma
model SettingInsight {
  id                  String   @id @default(cuid())
  strainSlug          String
  setting             String
  reportCount         Int      @default(0)
  avgIntensity        Float?
  recommendationScore Float    @default(0)

  @@unique([strainSlug, setting])
}
```

### API Endpoints
- `GET /api/v1/strains/[slug]/settings`
- `GET /api/v1/settings/[setting]/top-strains`

### WordPress Integration
- Setting badges on strain cards ("Best in Nature")
- Setting filter in explorer

---

## Feature 5: Comparative Tool

### Purpose
Side-by-side strain comparison with goal-based recommendations.

### API Endpoint
`GET /api/v1/compare?strains=golden-teacher,penis-envy,b-plus`

Returns:
- All strain data side-by-side
- Attribute-by-attribute winners
- Goal recommendations ("For beginners: Golden Teacher")

### WordPress Integration
- New shortcode: `[tripdar_compare]`
- Multi-strain selector UI
- Comparison table with visual bars

---

## Feature 6: Expand Strain Attributes

### New Fields
```typescript
interface InternalStrain {
  // Existing fields...

  // New experiential attributes
  onsetTime?: string;          // "15-30 min", "30-60 min", etc.
  typicalDuration?: string;    // "3-4 hours", "4-6 hours", etc.
  bodyHeadBalance?: string;    // "body-heavy", "balanced", "head-heavy"
  emotionalCharacter?: string[]; // ["euphoric", "grounding", "challenging"]
  comeUpIntensity?: string;    // "gentle", "moderate", "intense"
  peakCharacter?: string;      // "sustained", "waves", "sharp-peak"
}
```

### Implementation
1. Update `src/domain/strain/types.ts`
2. Update `src/domain/partner/types.ts` (public view)
3. Update admin UI form fields
4. Populate data for all 25 strains
5. Update WordPress shortcode rendering

---

## Feature 7: Lineage Explorer

### Purpose
Interactive visualization of strain genetic relationships.

### API Endpoints
- `GET /api/v1/lineage/tree` — Full tree from wild types
- `GET /api/v1/lineage/path?from=X&to=Y` — Path between strains

### WordPress Integration
- Enhanced `[tripdar_lineage slug="X"]` shortcode
- New `[tripdar_lineage_tree]` for full tree
- Interactive D3.js or SVG tree visualization

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Feature 6: Add new strain attributes to types
- [ ] Feature 6: Update admin UI with new fields
- [ ] Lineage: Populate parentStrains for all 25 strains
- [ ] Lineage: Verify relationships against external sources

### Phase 2: Core Analytics (Week 3-4)
- [ ] Feature 1: StrainConfidence schema + service
- [ ] Feature 1: Confidence API + WordPress badges
- [ ] Feature 2: DoseCurveData schema + service
- [ ] Feature 2: Dosage curve API + WordPress chart

### Phase 3: Insights (Week 5-6)
- [ ] Feature 4: SettingInsight schema + service
- [ ] Feature 4: Settings API + WordPress integration
- [ ] Feature 7: Full lineage tree API
- [ ] Feature 7: Interactive tree visualization

### Phase 4: Advanced (Week 7-8)
- [ ] Feature 3: UserStrainProfile + StrainCorrelation schemas
- [ ] Feature 3: Recommendations engine + API
- [ ] Feature 5: Compare API + WordPress shortcode
- [ ] Feature 5: Comparison UI with goal recommendations

---

## Critical Files

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | 5 new models |
| `src/domain/strain/types.ts` | 6 new attribute fields |
| `src/domain/strain/data.ts` | Lineage + new attributes for 25 strains |
| `src/app/admin/strains/page.tsx` | New form fields |
| `wordpress-plugin/.../class-api-client.php` | 7 new API methods |
| `wordpress-plugin/.../class-shortcodes.php` | 4 new shortcodes, updated rendering |
| `wordpress-plugin/.../storybook.css` | New component styles |

---

## Data Collection Flywheel

```
More Users → More strain_tried/ratings/reports
     ↓
Better Confidence Scores → Better Recommendations
     ↓
Higher Trust → More Users
```

This creates a defensible data moat that becomes more valuable over time.
