# Myco Platform Spec
**Date:** 2026-05-21
**Author:** Number One
**Pilot:** The Other Path (themushroomtop.com)
**Status:** Ready for Paperclip

---

## What This Is

Myco is a conversational product recommendation guide built on Tripdar. It lives at a retailer subdomain (e.g. `top.tripd.ar`), embeds into their WordPress site via plugin, and runs on a tablet in-store. It is NOT a sales tool — it is a healer guide that helps customers understand what they want and which products are most likely to get them there.

Every screen carries: **"Everyone is different. Start low and go slow."**

Myco is also a data flywheel. Every conversation, choice, and outcome feeds a model that gets smarter over time — and that intelligence gets sold back to retailers and brands.

---

## Architecture

### Platform Layer
- **Tripdar** (Next.js 15 + Neon/Postgres + Prisma) — the platform
- Each retailer gets a subdomain: `[store].tripd.ar`
- Customer profiles live on Tripdar, portable across all retailers
- WordPress plugin = portal only — unregistered users explore, registered users are linked to Tripdar

### Pilot Setup
- Retailer: **The Other Path**
- Subdomain: `top.tripd.ar` 
- WordPress site: `themushroomtop.com`
- Plugin: replaces their existing "experience finder" — do NOT break the strain explorer plugin

---

## Core Components

### 1. Myco Conversation Engine

Myco is a **healer guide** — genuine, warm, curious. Not a chatbot, not a quiz. The conversation feels personal because the follow-up questions are dynamically shaped by previous answers.

**Three primary axes:**
1. **Intent** — what do you want to feel? (focus, creativity, sleep, anxiety relief, first-time curiosity, spiritual, social, healing)
2. **Experience level** — never tried, tried a few times, occasional, experienced
3. **Format preference** — capsule, edible, dried, tincture, other

**Dynamic follow-up logic:**
- If intent = "first-time curiosity" → Myco slows down, asks more orientation questions, emphasizes set and setting
- If experience = "never tried" → follow-ups focus on comfort and safety framing
- If intent = "sleep" + experience = "experienced" → follow-ups probe timing, tolerance, previous products
- Follow-up questions are LLM-generated based on the full conversation state, not a fixed tree

**Conversation ends with:**
- A short reflection back to the user: "Based on what you've told me, it sounds like you're looking for..."
- A product list (see Recommendation Output below)
- An invitation to save their profile

**Name:** Myco (not Sage — entirely different context, different persona)

---

### 2. Product Catalog & Vibe Mapping

Products are not always strain-specific. Many are blended formulas where the "vibe" needs to be defined intentionally.

**Initial product setup (our onboarding process):**
- We interview the retailer to map each product to intent axes
- We interview the brand directly if available (Psilly for TOP pilot)
- Output: each product gets a `vibeProfile` — an array of scored intent dimensions

**Store admin (day-to-day):**
- Toggle products on/off based on inventory (simple switch, low friction)
- Configure a product as "hits stronger" or "hits lighter" than standard weight-based guidance
- This offset influences dose guidance with a visible disclaimer: *"Community feedback suggests this product hits [stronger/lighter] than standard guidance. Adjust accordingly."*

**Vibe refinement over time:**
- Every user who selects a product and later submits feedback updates the vibe model
- If 80% of users who wanted "focus" and tried Apollo rate it highly → Apollo's focus score increases
- This happens automatically — no manual curation needed once the flywheel starts

---

### 3. Recommendation Output

The output screen shows:

- **Product cards** — name, format, photo, key vibes
- **Dose guidance** — weight-based starting dose with offset applied if configured
  - Format: *"A typical starting dose for your weight range is X–Ymg. This product is reported by our community to be [stronger/milder] than average — consider starting at the lower end."*
- **"Start low and go slow"** — persistent, on every screen, not hidden in fine print
- **Clear framing** — "These are recommendations based on your goals and community experience. They are not medical advice."
- **Save profile CTA** — email capture, like weed.menu magic link flow

---

### 4. Customer Profile System

- Email capture → Tripdar account (magic link, no passwords)
- Profile is **portable** — follows the customer across all Tripdar retailers
- Profile stores: intent history, products tried, outcomes reported, format preferences
- On return visits: Myco opens with "Welcome back — last time you were looking for [X]. What brings you in today?"

**Intent → Choice → Result pipeline:**
Every session captures:
1. What the customer said they wanted (intent)
2. What product they were recommended (choice)
3. What they actually reported back (result) — prompted via follow-up email or next visit

This is the core data asset.

---

### 5. User-Reported Products (Lead Gen + Data Enrichment)

When a logged-in user mentions a product Myco doesn't know about, or explicitly reports a new product:

1. Myco asks them to photograph the product (front + back)
2. Captures: retailer name, location, product name, format, any visible dosage info
3. Auto-creates:
   - A new `UnverifiedProduct` record in the DB
   - A **sales lead** for the non-partner retailer
   - A data enrichment task for our team to verify and onboard

This turns every user into a field researcher and every new retailer into a warm lead.

---

### 6. WordPress Plugin

**Scope:** Portal for unregistered users. Does NOT replace the strain explorer. 

**What it does:**
- Embeds a "Find your experience" entry point on themushroomtop.com
- Unregistered users can browse products and see Myco's intro flow
- At the point of personalization (when Myco needs to ask personal questions), users are prompted to create a Tripdar profile (email)
- Registered users are recognized and linked to their Tripdar profile

**What it does NOT do:**
- Store customer data in WordPress
- Replace the existing strain explorer plugin
- Handle transactions or sales

---

### 7. Admin Panel (Store-Facing)

Low-friction. A store clerk should be able to run this in under 5 minutes.

**Product management:**
- Add product: name, format, photo, weight/dose per unit, strain (optional), brand
- Toggle on/off: single tap, immediate effect
- Set strength offset: "standard / hits stronger / hits lighter"
- View which products are being recommended most

**Store settings:**
- Store name, subdomain, contact info
- Myco intro customization (store can add a brief welcome message)
- Email notification preferences

**What we handle (not the store):**
- Initial vibe mapping (we do the retailer/brand interview)
- Subdomain setup
- WordPress plugin installation

---

## PsillyOps Vibe Data — Already Exists, Don't Rebuild

PsillyOps has a `PredictionProfile` model with curated vibe scores per product per experience mode (MICRO/MACRO):
- `transcend` — spiritual, introspective, journey
- `energize` — active, focused, social energy
- `create` — creative, flow state
- `transform` — healing, processing, change
- `connect` — social, empathic, bonding

Every Original Psilly product already has these scores set. For the TOP pilot, Myco reads from this data directly via a sync layer (`PsillyOpsProductSync`). No vibe mapping interview needed for Psilly products — the data is already there.

**PsillyOps read API:** Being built as KEWL-495. Three endpoints: `GET /api/tripdar/products`, `GET /api/tripdar/products/[id]`, `GET /api/tripdar/products/updated-since`. API key auth, read-only, machine-to-machine.

**Non-Psilly products (future retailers):** Vibe interview process still required. For any retailer whose products aren't in PsillyOps, we conduct a brand/retailer interview to manually set vibe dimension scores in Tripdar's `StoreProductCatalog`. These scores then refine over time from user outcome data.

**Myco intent → vibe dimension mapping:**

| Myco intent | Vibe dimension |
|---|---|
| Spiritual / journey | transcend |
| Focus / energy / active | energize |
| Creativity / flow | create |
| Healing / anxiety / processing | transform |
| Social / connection | connect |
| Sleep | transform + transcend (low dose) |
| First-time curiosity | balanced, MICRO mode preferred |

---

## Data Models — New (build on top of existing Tripdar models)

Reuse: `RecommendationSession`, `RecommendationResult`, `RecommendationFeedback`, `StrainRecommendationConfig`, `Partner`, `UserStrainProfile`

**New models needed:**

```
MycoChatSession       — the full conversation (linked to RecommendationSession)
MycoMessage           — individual messages in the conversation
StoreProductCatalog   — retailer's product list (linked to Partner)
ProductVibeProfile    — intent dimension scores per product
ProductStrengthOffset — "standard" | "stronger" | "lighter" + rationale
UserOutcomeReport     — post-experience feedback (intent vs actual)
UnverifiedProduct     — user-reported products from non-partner retailers
RetailerLead          — generated from UnverifiedProduct reports
```

---

## Dose Guidance Rules

- Weight-based starting dose is the default (use established community guidelines)
- Store-configured strength offset adjusts the guidance with a visible disclaimer
- Always show a range, never a single number
- Never use language like "we recommend" — use "community guidance suggests" or "a typical starting point is"
- Legal disclaimer on every screen: "This is not medical advice. Consult a healthcare provider."
- "Start low and go slow" is non-negotiable UI — every screen, above the fold

---

## Rollout Plan

### Phase 1 — TOP Pilot (tablet in-store)
- Seed TOP's product catalog via our onboarding interview with Psilly
- Build Myco conversation engine + recommendation output
- Build store admin (product on/off, strength offset)
- Deploy to `top.tripd.ar`
- Test on tablet in-store

### Phase 2 — WordPress Integration
- Build WordPress plugin (replaces experience finder, preserves strain explorer)
- Email profile capture linked to Tripdar
- Unregistered user flow

### Phase 3 — Data Flywheel
- Outcome reporting (post-experience feedback loop)
- Vibe model refinement from user data
- User-reported products + lead gen
- Retailer insights dashboard

### Phase 4 — Platform Scale
- Additional retailers onboarded
- Lightspeed POS integration (when warranted)
- Brand intelligence reports (sell data back to brands)

---

## Open Questions

1. Does TOP want a custom subdomain (top.tripd.ar) or their own domain (myco.themushroomtop.com)?
2. Do we need age verification / ID check at any point in the flow?
3. What's the legal review requirement before launch — do we need a lawyer to review the dose guidance language?
4. For the Psilly brand interview — who is the right person to sit down with for the initial product vibe mapping?
