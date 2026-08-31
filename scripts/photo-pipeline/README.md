# Tripdar Photo Pipeline Worker

Catalog-safe and human-gated premium product photo processing.

## Commands

```sh
npm run photo:pipeline -- single --input ./photo.png --sku NF-BM20 --brand "Nocturnal Farms" --product "Blue Moon" --variant "20mg" --view front
npm run photo:pipeline -- single --mode premium --input ./photo.png --sku NF-BM20 --brand "Nocturnal Farms" --product "Blue Moon" --format "capsule bottle" --variant "20mg" --view front
npm run photo:pipeline -- batch --input-dir ./incoming --sku NF-BM20 --brand "Nocturnal Farms" --product "Blue Moon" --variant "20mg" --view front
npm run photo:pipeline -- make-fixtures --out "$PAPERCLIP_SCRATCH_DIR/photo-fixtures"
```

By default the worker uses Prisma when `DATABASE_URL` is set. In a local checkout with no database configured it uses `tripdar-product-images/logs/photo-job-ledger.json`; pass `--ledger prisma` to require the DB-backed path.

## Testing

The pipeline test is a Vitest suite (`pipeline.test.mjs` imports from `vitest`), so it **must** run under Vitest — Node's native test runner (`node --test`) will fail because it does not provide Vitest's worker state.

Run the focused photo-pipeline test:

```sh
npx vitest run scripts/photo-pipeline/pipeline.test.mjs
# equivalently, via the configured runner:
npm test -- scripts/photo-pipeline/pipeline.test.mjs
```

`npm test` (bare) runs the full `vitest run` suite. Use the focused command above for a fast, non-destructive readiness check before processing a real photo batch.

## External services

- `ANTHROPIC_API_KEY` enables Claude vision quality assessment.
- `OPENROUTER_API_KEY` enables deliberate premium image editing. The default model is `google/gemini-3.1-flash-image-preview`; override with `OPENROUTER_PREMIUM_MODEL` or `PHOTO_PIPELINE_PREMIUM_MODEL`.
- `VERCEL_AI_GATEWAY_BACKGROUND_REMOVAL_URL` plus `AI_GATEWAY_API_KEY` or `VERCEL_AI_GATEWAY_API_KEY` enables a hosted mask/cutout endpoint when one is provided.
- Without OpenRouter, `AI_GATEWAY_API_KEY` or `VERCEL_AI_GATEWAY_API_KEY` enables premium generation through Vercel AI Gateway with `PHOTO_PIPELINE_PREMIUM_MODEL`.
- `--strict-gateway` adds an explicit hosted-removal-required warning when hosted background removal is unavailable.

When those keys are absent, the worker still runs a deterministic local quality/mask fallback and records that fact in the manifest warnings. That fallback exists for development and corpus smoke tests only; it always routes to `needs_review` because it cannot prove catalog-safe product isolation on real photos.

Hosted cutouts are post-processed only at the alpha boundary before export: tiny disconnected alpha components are removed, light/gray edge contamination is de-emphasized, and opaque product pixels are preserved. If Claude Vision is unavailable, hosted runs also stay in `needs_review` for human catalog approval instead of auto-approving from heuristic QA alone.

Full-image results are never interpreted as background-removal responses. Custom catalog-safe endpoints must return `mask_base64` or `cutout_base64`; `image_base64` is rejected in that lane. Premium generation runs only when `--mode premium` is explicit, sends the source and the locked `premium_prompt.v1.txt` through OpenRouter or Vercel AI Gateway, writes the result under `premium-enhanced/`, and always stops in `needs_review`.

Premium validation compares source and generated label regions using structural/perceptual image signals, package and cap geometry, and a secondary OCR text diff. Changed numbers, dosage, quantity, ingredients, warnings, or product names are hard flags regardless of the aggregate score. The manifest stores the measured score, component signals, label regions, hard flags, warnings, catalog-safe outputs, and `requires_review: true`. Reviewers use `/admin/photo-jobs` to compare source, catalog-safe, and premium images and explicitly approve or reject. Provider-reported generation cost is accumulated into `PhotoJob.costCents`; the CLI prints `batch_total_cost_cents`, and proof JSON includes `total_cost_cents`.

## Outputs

Each job writes:

- immutable original under `tripdar-product-images/originals/`
- transparent 3000 square PNG under `transparent/`
- white 3000 square PNG under `catalog-safe/`
- AI-enhanced white 3000 square PNG under `premium-enhanced/` when a generative chat-image provider returned the cutout
- 1200 square WebP under `web/`
- 600 square WebP under `thumbnails/`
- one manifest under `manifests/{job_id}.json`
- one worker log under `logs/{job_id}.json`

Export filenames include the stable `job_id`, so multiple same-product views cannot overwrite each other. Duplicate successful images are detected by SHA-256 and skipped as a no-op.
