# KEWL-2331 — brand self-serve portal, phone evidence

All captured at **375 × 812, DPR 2, mobile + touch** (iPhone-class viewport) against the
**merged tree** (`kewl2331-brand-portal` + `origin/main` = merge commit `a122591`), served
from a production `next start` build. Captured under KEWL-2446.

These replace the `17ce9c0` captures, which predated the KEWL-2390 grant gate and the
receipt-email field and therefore no longer showed the shipped UI.

## Data provenance

Real brand data — **Micro Mind**, 5 products, 13 photos — copied **read-only** from
production Neon into a throwaway local Postgres, with a portal token minted locally.

Production was **not** written to. This was deliberate: `GET /api/myco/brand-portal/<token>`
calls `markTokenOpened()`, which sets `openedAt` on the token row, so pointing the capture
run at a real production token would have burned that brand's "has the brand opened the
link yet?" signal. Product photos still load from live Vercel blob storage, so the images
below are the current production photos.

| File | What it shows |
|---|---|
| `01-brand-page-products-375px.png` | The brand page. Header, `5 PRODUCTS ON FILE`, and the product list rendering current production photos with per-product missing-field callouts. |
| `02-upload-grant-gate-locked-375px.png` | The upload area with the **KEWL-2390 image-usage grant gate closed**. The consent checkbox is unchecked and both upload tiles (Brand logo / Brand artwork) are rendered disabled beneath it — uploading is impossible before consent. |
| `03-contact-receipt-email-375px.png` | The contact block: name, role, follow-up consent, preferred channel, required email, and the **`EMAIL MY RECEIPT TO`** field with its "this is a receipt, not follow-up" copy. |
| `04-upload-grant-gate-granted-375px.png` | The same upload area after checking the consent box — copy flips to `Image display permission granted — uploads are open.` and both tiles become active. Included to show the gate actually toggles rather than being decorative. |

## Verification alongside these captures

- `GET /api/myco/brand-portal/<token>` → **200**, real brand + 5 products.
- Called 3×; the `PublicWriteRateLimitBucket` table stayed at **0 rows / 0 total**, so the
  GET path increments neither the IP nor the token bucket (KEWL-2383 fix intact after the merge).
- Console clean apart from a `/favicon.ico` 404, which is unrelated to the portal.
- All 5 product images returned 200 from `qy2kgxke97nsoem3.public.blob.vercel-storage.com`.
