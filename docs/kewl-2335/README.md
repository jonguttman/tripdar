# KEWL-2335 — staff catalog review surface, phone evidence

All captured at **375 × 812, DPR 2, mobile + touch** (iPhone-class viewport) against a
live dev server on real Neon data — 27 products for The Mushroom Top.

| File | What it shows |
|---|---|
| `01-product-list-tiers-375px.png` | Product list. Coverage counter (`1 of 27 fully reviewed`), the "what's left for me" filter, and the **Disputed — needs a tiebreak** tier rendered first in red with the disputed field named. |
| `02-product-list-full-375px.png` | Full-page list with all urgency tiers visible: **3 (disputed) → 1 (nobody has reviewed) → 2 (you haven't reviewed) → 4 (you're done)**, plus the `Research only — never listed` badge on G23. |
| `03-product-detail-photo-question-375px.png` | Product detail. The explicit "Is this the correct photo for this product?" question leads the page, above every other field. |
| `04-product-detail-full-375px.png` | Full detail page: all 15 reviewable fields with tier badges, confirmation counts, source picker, per-field actions, the disputed field showing both competing values, the free-text note, and the blocking-listing summary. |
| `05-signin-bound-reviewer-375px.png` | Sign-in after the KEWL-2364 fix. The link identifies the reviewer, so the screen greets them by name and asks only for a PIN — the old "pick your name" roster step is gone. (The PIN dots are Chrome autofill, which does not fire React's `onChange`; that is why the button reads disabled in the capture.) |
| `06-unbound-link-fails-closed-375px.png` | A `staff_review` link with no bound reviewer. It fails closed with HTTP 410 rather than falling back to roster selection — this is what makes the old shared link unusable. |

Console was clean (no errors or warnings) across the whole flow.

Screens 01–04 predate the KEWL-2364 auth fix but remain accurate: that fix changed the
sign-in step only, not the list or detail surfaces.
