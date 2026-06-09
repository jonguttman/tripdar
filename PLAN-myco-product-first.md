# PLAN: Product-First Myco — Trustworthy Catalog → Customer Recommendations

**Date:** 2026-06-09
**Target:** Soft demo **2026-06-20** (TMT / The Other Path)
**Status:** Awaiting approval
**Builds on:** `tripdar-spec/myco-platform-spec-2026-05-21.md`, existing Myco schema (`prisma/schema.prisma:384-580`), recommendation engine (`src/domain/recommendation-engine/`)

---

## Decisions locked (from Jon, 2026-06-09)

1. Buildable roadmap — implement on approval.
2. Workstreams run **in parallel** with a per-product readiness gate (incomplete products never reach customers).
3. Soft demo June 20.
4. Audrey's "needs work" view = completeness checklist + filter in admin. No email digests.
5. Audrey sets general dose guidance per product; **actual dose suggestion follows a predictable curve** from user goals + experience.
6. Vibe profiles use the **6-axis system** everywhere (already true in admin UI; normalize stragglers).
7. If a **strain-specific product** matches the user's needs, **highlight it**.
8. LLM usage = option (c): guided structured intake; LLM only generates the "why we recommended this" reflection, with deterministic fallback.
9. Each location gets its own **path** (`/m/[partnerSlug]`); subdomain mapping later once DNS is confirmed.
10. **Age gate** always for kiosk / signed-out users. Email capture comes **after** results ("save your results, track your journey") — invitational, never a gate.
11. **Kiosk mode** in-store (idle reset, big touch targets); **home mode** = caring-friend follow-up ("did it work? want to try something else?").
12. Feedback loop = option (c): auto-computed **community profile** shown beside admin profile; admin one-click accepts.
13. Confidence scores **admin-only**.
14. Partner self-service onboarding: deferred.
15. WordPress: untouched for now; keep embed-as-distribution in mind, don't break existing plugins.

---

## Current state (verified in code)

| Area | State |
|---|---|
| Product model | `StoreProductCatalog` has dose/unit/pack, brand, format, flavors, ingredients, onset, duration, photos, `active`/`archivedAt` (`prisma/schema.prisma:422`) |
| Vibe profiles | `ProductVibeProfile` (JSON scores, 6-axis in admin UI), `ProductStrengthOffset` exist |
| Admin | `/admin/myco` full CRUD with vibe sliders, dose tiers, photos — **no completeness indicators** |
| Engine | `src/domain/recommendation-engine/` scores **strains**, not products; product vibe profiles unused in scoring |
| Public | `/t/[id]` tester form (6-axis sliders) exists; **no customer-facing recommendation flow**; `/` is "coming soon" |
| Feedback | `TesterVote`, `UserOutcomeReport`, `RecommendationFeedback` models exist; **nothing aggregates back** into profiles or confidence |
| Sessions | `MycoChatSession`/`MycoMessage` models exist, unused by any route |

---

## Workstream A — Trustworthy Catalog (Audrey's source of truth)

### A1. Product readiness model
- New module `src/domain/myco/readiness.ts`: pure function `computeReadiness(product) → { ready: boolean; missing: string[]; warnings: string[] }`.
- **Required for "recommendation-ready":** ≥1 photo, `format`, `brandId`, `productUnitMg`, `unitsPerPack`, `onsetMinutes`, `durationMinutes`, vibe profile present, strength offset **confirmed**, at least one brand dose tier (micro/mini/macro units or `brandDoseTiers`).
- **Warnings (non-blocking):** `unitsPerPack × productUnitMg ≠ totalDoseMg`; dose outliers per format (e.g. capsule > 500mg/unit); missing flavors/ingredients/notes.
- Add `confirmed Boolean @default(false)` + `confirmedBy`/`confirmedAt` to `ProductStrengthOffset` (migration) so "offset confirmed" is explicit, not implied.

### A2. Admin completeness UI (`/admin/myco`)
- Readiness chip per row (✅ Ready / ⚠️ N missing) + expandable "missing: photos, onset…" detail.
- Filter tabs: **All / Needs attention / Ready / Archived**. Per BUG_LOG lesson: counts computed over the **full dataset** server-side, never from the current page.
- Summary header: "23 of 31 active products recommendation-ready."
- Inline validation warnings in the edit modal (dose math mismatch).

### A3. Hard gate
- Customer-facing candidate query = `active: true AND archivedAt: null AND readiness.ready` (computed server-side in the candidate service, single code path shared by API + page). Archived/inactive products can never surface. Unit-tested.

---

## Workstream B — Recommendation-Ready (product-first engine)

### B1. 6-axis normalization
- Audit existing `ProductVibeProfile.scores` rows; write a normalizer that keeps only the 6 canonical keys (`clarity_cognition`, `mood_social`, `visual_pattern`, `somatic`, `energy_direction`, `depth_direction`), clamped to [-1, 1]. One-off script + enforce via Zod on the admin API (`/api/admin/myco`).
- Shared canonical definition moves to `src/domain/myco/vibes.ts` (admin UI, tester form, engine all import it — today the list is duplicated in `page.tsx`).

### B2. Product-first scoring (`src/domain/myco/scoring.ts`)
- Score `StoreProductCatalog` items directly: cosine similarity between user intent vector (6-axis) and product vibe profile — reusing the math in `recommendation-engine/scoring.ts`, retargeted from strains to products.
- Format preference filter/boost; experience-level modifiers carried over.
- **Strain highlight:** when a candidate has `strainSlug` and the strain's profile also matches intent, mark `strainSpecificMatch: true` → UI badge "Strain-specific match: Golden Teacher".
- Existing strain engine (`/api/v1/recommend`) untouched — WP plugins keep working.

### B3. Deterministic dose curve (`src/domain/myco/dose.ts`)
- Inputs: user goal **intensity** (derived from intent answers), **experience level**, product's `productUnitMg` + brand tiers (micro/mini/macro units) + strength offset.
- Predictable curve: experience × intensity selects a tier on the brand's own ladder; offset shifts toward the lower/upper end of the tier's range; output is **always a range in units + mg**, never a single number.
- Copy rules from spec: "a typical starting point is…", offset disclaimer, "start low and go slow" mandatory.
- Pure function, full unit-test matrix (4 experience levels × 3 intensities × 3 offsets).

---

## Workstream C — Customer-Facing Myco Flow

### C1. Routes & modes
- `/m/[partnerSlug]` — public, no login, partner resolved from slug (add `slug` to `Partner`, migration + admin field). Path-based now; host-header rewrite middleware for `[store].tripd.ar` later when DNS is confirmed.
- `?kiosk=1` (persisted in sessionStorage): large touch targets, idle timeout → reset to age gate, no session carryover between customers.

### C2. Age gate
- Interstitial before any content for kiosk/signed-out users (configurable minimum-age copy + "not medical advice" disclaimer). Kiosk: re-gates every reset. Browser: remembered in localStorage.
- **Open item for Jon:** confirm age threshold + legal copy before public launch (demo can ship with placeholder 21+ copy).

### C3. Guided intake
- 3–5 step structured flow (warm Myco voice, one question per screen): intent (8 spec intents → 6-axis vector mapping in `src/domain/myco/intents.ts`), experience level, format preference, intensity ("how deep do you want to go?").
- Persists to `MycoChatSession` (+ `RecommendationSession`) with anonymous `sessionHash` — models already exist.

### C4. Results screen
- Product cards: photo, name, brand, format, key vibes (top 2 axes), dose range from B3, offset disclaimer, strain-highlight badge.
- "Why this matched" per card: one **LLM-generated reflection** (Anthropic API; model chosen at implementation) from the session's intent summary — with a **deterministic template fallback** so the flow never blocks on the API.
- Persistent footer on every screen: "Everyone is different. Start low and go slow." + not-medical-advice line.

### C5. Email capture (after results)
- CTA: "Save your matches — we'll check in and help you track what works." → magic link via existing NextAuth email (Resend). Optional; skipping never hides results.
- Saved session links `RecommendationSession` to the user for the home follow-up loop (D3).

### C6. New API
- `POST /api/myco/session` (create/advance intake), `POST /api/myco/recommend` (candidates gated by A3, scored by B2, dosed by B3). Public endpoints scoped by partner slug, rate-limited; Zod-validated.

---

## Workstream D — Feedback Loop

### D1. Community profile aggregation (`src/domain/myco/community.ts`)
- Aggregate `TesterVote` 6-axis sliders per product → mean per axis (votes are 0–100; map to [-1,1]) + vote count + per-axis spread. Full-dataset aggregation query, separate from any paginated display (BUG_LOG lesson).

### D2. Admin: community vs. admin profile
- In `/admin/myco` edit modal: community profile rendered beside admin sliders ("Community (n=7)"), per-axis delta highlighted when divergence > threshold.
- **"Accept community profile"** button → overwrites `ProductVibeProfile.scores`, sets `source: "flywheel"`.
- **Confidence (admin-only):** per-product score from vote count + agreement → Low / Building / Solid badge in product list, so Audrey/Jon see well-understood vs. uncertain at a glance.

### D3. Home follow-up ("caring friend") — minimal slice for demo, grows after
- Signed-in `/my` page: saved matches, "How did it go?" → existing `UserOutcomeReport` (intended vs. actual on 6 axes + rating). If it missed: "want to try something different?" → re-run scoring with the outcome as a corrective signal.
- Outcome reports feed the same confidence math as tester votes.
- Follow-up **email** prompts: post-demo (Resend infra exists; not needed for June 20).

---

## Workstream E — Partner-ready / WordPress
**Deferred** per decisions 14–15. Constraints honored now: partner scoping on all new public APIs (slug → partnerId, no cross-partner leakage), `/api/v1/*` and WP plugins untouched.

---

## Schedule (today → June 20)

| Days | Deliverables |
|---|---|
| **Jun 9–11** | A1–A3 (readiness model, admin completeness UI, hard gate) · B1 (6-axis normalization, shared `vibes.ts`) |
| **Jun 11–13** | B2 product scoring + strain highlight · B3 dose curve + test matrix · C6 API skeleton |
| **Jun 14–17** | C1–C4 public flow (age gate, intake, results, kiosk mode) · LLM reflection + fallback |
| **Jun 17–19** | C5 email capture · D1–D2 community profiles + confidence badges · seed/verify TMT catalog with Audrey using the new completeness view · kiosk walkthrough polish |
| **Jun 20** | **Soft demo:** Audrey opens `/admin/myco`, sees what's ready vs. needs work → customer walks through `/m/top?kiosk=1` age gate → intake → real TMT product cards with dose ranges + "why" → email capture CTA → admin shows community-vs-admin profile on a tested product |
| Post-demo | D3 full follow-up loop, follow-up emails, subdomain mapping, then Workstream E |

Each merged step gets a CHANGELOG entry per repo convention (A = 1.10.0, C flow = 1.11.0, etc.).

## Risks & open items
1. **Legal/age-gate copy** — placeholder for demo; Jon to confirm threshold + dose-language review before public launch (spec open question #2/#3).
2. **Anthropic API key** needed in Vercel env for reflections; deterministic fallback means demo works without it.
3. **Catalog data entry** is human work — the completeness view lands first (Jun 11) so Audrey has maximum runway before the 20th.
4. **Subdomain DNS** unknown → path-based demo; middleware designed so subdomains bolt on without route changes.
