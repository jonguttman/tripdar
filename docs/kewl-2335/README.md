# KEWL-2335 — staff catalog review surface, phone evidence

All captured at **375 × 812, DPR 2, mobile + touch** (iPhone-class viewport) against a
live dev server on real Neon data — 27 products for The Mushroom Top.

| File | What it shows |
|---|---|
| `01-product-list-tiers-375px.png` | Product list. Coverage counter (`1 of 27 fully reviewed`), the "what's left for me" filter, and the **Disputed — needs a tiebreak** tier rendered first in red with the disputed field named. |
| `02-product-list-full-375px.png` | Full-page list with all urgency tiers visible: **3 (disputed) → 1 (nobody has reviewed) → 2 (you haven't reviewed) → 4 (you're done)**, plus the `Research only — never listed` badge on G23. |
| `03-product-detail-photo-question-375px.png` | Product detail. The explicit "Is this the correct photo for this product?" question leads the page, above every other field. |
| `04-product-detail-full-375px.png` | Full detail page: all 15 reviewable fields with tier badges, confirmation counts, source picker, per-field actions, the disputed field showing both competing values, the free-text note, and the blocking-listing summary. |

Console was clean (no errors or warnings) across the whole flow.
