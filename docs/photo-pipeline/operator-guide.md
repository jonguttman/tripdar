# Operator Guide — Tripdar Product Photo Pipeline

*Psilly by Nature, Enchanted by Choice.*

How you use this, Jon. One page. Drop in phone photos, get consistent, catalog-safe product images out the other side — with the original never touched and every output traceable back to it.

---

## The short version

1. **Upload a folder** of phone photos to `tripdar-product-images/incoming/`.
2. The pipeline **evaluates and processes each image automatically** — no clicks from you.
3. **Catalog-safe outputs land** in their folders, named so you can find them.
4. **Anything it isn't sure about** is set aside with a plain-English reason.
5. **Read the manifest** to see what happened to any image and where its files went.

That remains the default catalog-safe loop. Premium is an explicit, human-gated option described below.

---

## Run the worker

For a hosted review job, run the CLI with the same local env file that contains both `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`:

```bash
node --env-file=.env.local scripts/photo-pipeline/cli.mjs single \
  --input tripdar-product-images/incoming/example.png \
  --sku EXAMPLE-SKU \
  --product "Example Product" \
  --mode premium
```

Batch runs use the same env loading:

```bash
node --env-file=.env.local scripts/photo-pipeline/cli.mjs batch \
  --input-dir tripdar-product-images/incoming \
  --sku EXAMPLE-SKU \
  --product "Example Product" \
  --mode premium
```

`BLOB_READ_WRITE_TOKEN` is what uploads the original, catalog-safe, premium, web, and thumbnail review assets to Vercel Blob. If it is missing, the CLI prints a warning and writes local filesystem paths only; those are useful for local dry-runs, but hosted `/admin/photo-jobs` cannot render them. When `DATABASE_URL` is loaded, the worker writes Prisma `PhotoJob` rows and requires Blob upload capability before it will persist hosted-review jobs.

---

## 1. Upload a folder

Put your shots — JPG, JPEG, PNG, or HEIC straight off the iPhone — into:

```
tripdar-product-images/incoming/
```

If you can, name files or fill in the SKU, brand, product, and variant when you upload. When that's present, outputs get real, readable names. When it isn't, the pipeline still runs and falls back to a safe unique name — nothing gets lost, you just get a less pretty filename.

You can drop **one image or a whole batch.** Multiple angles of one product and products from different brands can go in together. Re-uploading the same file is detected by content and won't reprocess — it's safe to re-run a folder.

---

## 2. What happens automatically

Each image moves through the stages on its own. In order:

1. **Intake** — the untouched original is copied to `originals/` and never overwritten. A job ID (e.g. `tripdar-2026-000124`) is assigned and EXIF orientation is normalized.
2. **Quality check** — focus, resolution, glare, exposure, clipping, angle, and "is the whole product here / is there only one product" are measured against set thresholds. A clear failure routes the image to review with a specific retake reason.
3. **Geometry** — straightening, perspective correction, and centering on a square canvas.
4. **Background removal** — a clean product mask, exported transparent and on pure white (`#FFFFFF`).
5. **Catalog-safe retouch** — neutral white balance, gentle contrast, conservative sharpening, and removal of *isolated* dust or lint only. Nothing near printed text is ever altered.
6. **Shadow** — a soft, low grounding shadow from the product's own silhouette.
7. **Export** — standardized files in every required size (below).

The rule underneath all of it: **catalog-safe mode never repaints, regenerates, or rewrites a label.** If a fix can't be done without touching printed text, the pipeline skips it and flags the image instead of guessing.

---

## 3. Where the outputs land

Every approved image produces four required files, each in its own folder under `tripdar-product-images/`:

| Output | Folder | Format | Size |
|---|---|---|---|
| Transparent master | `transparent/` | PNG (transparent) | 3000 × 3000 |
| White master | `catalog-safe/` | PNG on pure white | 3000 × 3000 |
| Web image | `web/` | WebP | 1200 × 1200 |
| Thumbnail | `thumbnails/` | WebP | 600 × 600 |

(Optional larger marketplace and AVIF versions can also be generated.) All files are sRGB, and the product is always padded to fit — never stretched.

**Filenames are deterministic**, so you always know what you're looking at:

```
{sku}_{brand}_{product}_{variant}_{view}_{stage}_v{NN}.{ext}
```

For example:

```
NF-BM20_nocturnal-farms_blue-meanies-lions-mane_front_catalog-safe_v01.webp
```

**The other folders**, so the map is complete:

- `incoming/` — where you drop new photos
- `originals/` — the untouched source, kept forever
- `working/` — in-progress intermediates
- `premium-enhanced/` — generated premium candidates; never primary without human approval
- `needs-review/` — images set aside for you (see below)
- `rejected/` — images that failed outright, with a reason
- `manifests/` — one JSON record per image
- `logs/` — processing logs

---

## 4. How to read the manifest

Every source image gets one JSON file in `manifests/`. It's the receipt — it ties the outputs back to the exact original and tells you what the pipeline decided and why. Here's the shape:

```json
{
  "job_id": "tripdar-2026-000124",
  "sku": "NF-BM20",
  "source_file": "IMG_4821.HEIC",
  "processing_mode": "catalog_safe",
  "status": "approved",
  "outputs": {
    "transparent_master": "...",
    "white_master": "...",
    "web": "...",
    "thumbnail": "..."
  },
  "quality_score": 0.94,
  "label_fidelity_score": null,
  "warnings": [],
  "approved_by": null,
  "approved_at": "..."
}
```

What to look at:

- **`status`** — where the image ended up. In Phase 1 you'll mostly see `approved`, `needs_review`, or `rejected`.
- **`quality_score`** — the pipeline's confidence, 0 to 1. It auto-approves at **0.70 and above**; below that it routes to review.
- **`warnings`** — the specific things it noticed. An empty list is a clean pass. If an image was set aside, the retake reason lives here, in plain language.
- **`outputs`** — the exact paths to each finished file.
- **`label_fidelity_score`** — `null` for catalog-safe and a measured 0-to-1 score for premium. The premium score combines structural/perceptual label comparison, package geometry, and OCR. Never treat the score alone as approval; critical text changes are separate hard flags.
- **`approved_by`** — always `null` on a newly generated premium candidate. It is written with `approved_at` only after a super admin approves in `/admin/photo-jobs`.
- **`source_file` + `job_id`** — your thread back to the untouched original in `originals/`. Nothing is ever a dead end.

---

## 5. Premium mode and approval

Run premium deliberately with `--mode premium`. The worker uses the locked v1 prompt, records the provider-reported cost, preserves catalog-safe outputs, measures label fidelity, and stops at `needs_review` even on a clean result.

Open `/admin/photo-jobs` and compare the source, catalog-safe, and premium images. Zoom the detected label area and read every warning. A number, dosage, quantity, ingredient, warning, or product-name delta is a hard flag. Approve only after the label-verification checkbox is true; rejection and approval both persist on the job.

The full Phase 3 bulk queue, retake requests, and stage-specific reprocessing remain out of scope.

---

*Questions on a specific image? Start with its manifest in `manifests/` — the job ID and source file tell you everything about where it came from and where it went.*
