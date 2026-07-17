# Operator Guide — Tripdar Product Photo Pipeline

*Psilly by Nature, Enchanted by Choice.*

How you use this, Jon. One page. Drop in phone photos, get consistent, catalog-safe product images out the other side — with the original never touched and every output traceable back to it.

---

## The short version

1. **Drop untouched phone photos** into Jon's Desktop raw-drop folder. That folder is the immutable source; the pipeline never renames, edits, or sorts it in place.
2. Number One runs the **auto-group pre-processor** once. It compares visible brand, product, flavor/variant, dose, weight, count, UPC, and package details, then copies exact-package matches into separate working groups.
3. **Confirm anything flagged** as unreadable, low-confidence, or a near-identical variant. Different flavors, doses, counts, or recipes are never silently merged.
4. Number One runs the existing worker **once per confirmed group**, always with explicit `--sku` and `--product` metadata (plus brand/variant/view when known).
5. **Read the manifests** to trace every grouped copy and processed output back to the untouched raw file.

That is the safe Phase 1 loop. The worker intentionally applies one product identity to one batch; it does not guess identities across a mixed folder.

---

## 1. Drop raw photos, then group them safely

Jon's one obvious intake location is:

```
~/Desktop/Product Photos - Raw Drop/
```

Treat it as an immutable raw drop: keep the original JPG, JPEG, PNG, or HEIC files there unchanged. Do not rename, move, edit, or process files in place.

From the Tripdar repo, Number One creates working groups with one command:

```sh
npm run photo:pipeline -- group \
  --input-dir "$HOME/Desktop/Product Photos - Raw Drop" \
  --output-dir "$HOME/Desktop/Product Photos - Grouped/$(date +%Y%m%d-%H%M%S)"
```

The command uses package-visible identity, not filename or color alone. It writes `grouping-manifest.json`, copies confident matches under `groups/<identity>/`, and puts unreadable items under `needs-confirmation/`. If two packages share brand/product artwork but differ by visible flavor, dose, weight, count, recipe, or UPC, they remain separate and the manifest asks for one human confirmation.

After confirmation, run the worker separately for each group with explicit identity metadata:

```sh
npm run photo:pipeline -- batch \
  --input-dir "$HOME/Desktop/Product Photos - Grouped/<run>/groups/<confirmed-group>" \
  --sku "<confirmed SKU>" \
  --brand "<confirmed brand>" \
  --product "<confirmed product>" \
  --variant "<confirmed variant>"
```

`--sku` and `--product` are required by design. One invocation means one confirmed product identity. Never point `batch` directly at the mixed raw-drop folder.

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

- Desktop `Product Photos - Raw Drop/` — Jon's untouched mixed-source folder; never process it as one worker batch
- grouped run `groups/` — copied working sets, one confirmed package identity per folder
- grouped run `needs-confirmation/` — unreadable or ambiguous source copies awaiting a human decision
- `originals/` — the worker's untouched source copy, kept forever
- `working/` — in-progress intermediates
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
- **`label_fidelity_score`** — `null` in Phase 1, and that's correct. It only carries a number when the premium generative pass runs later and its result is checked against the source. Catalog-safe never regenerates a label, so there's nothing to score.
- **`approved_by`** — `null` on an auto-approved image. Phase 1 approves by score, with no manual sign-off; a name lands here once the review queue ships and someone approves by hand.
- **`source_file` + `job_id`** — your thread back to the untouched original in `originals/`. Nothing is ever a dead end.

---

## 5. What's coming later (not in Phase 1)

Two things are designed but arrive in later phases — so you know what you're *not* seeing yet:

- **Review queue** — a side-by-side interface to compare original, catalog-safe, and (when generated) premium versions, with a zoomed label view, and to approve, reject, reprocess, or request a retake in one place. For now, review items wait in `needs-review/` with their reason in the manifest.
- **Premium mode** — an optional, higher-polish generative pass. It will **never** silently replace a catalog-safe image, and any premium result will be marked *AI-enhanced — visual approval required* and checked against the source before it can become a catalog image.

Until those ship, Phase 1 gives you the dependable core: a one-command grouping pass with explicit human confirmation where identity is uncertain, followed by clean, consistent, honest catalog-safe processing per confirmed product group. Every output stays traceable to its original.

---

*Questions on a specific image? Start with its manifest in `manifests/` — the job ID and source file tell you everything about where it came from and where it went.*
