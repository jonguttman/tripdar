# Tripdar Photo Pipeline Worker

Catalog-safe Phase 1 worker for product photo processing.

## Commands

```sh
npm run photo:pipeline -- single --input ./photo.png --sku NF-BM20 --brand "Nocturnal Farms" --product "Blue Moon" --variant "20mg" --view front
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
- `OPENROUTER_API_KEY` enables the OpenRouter-hosted image edit path. The default model is `google/gemini-3.1-flash-image-preview`; override with `OPENROUTER_BACKGROUND_MODEL` when needed.
- `VERCEL_AI_GATEWAY_BACKGROUND_REMOVAL_URL` plus `AI_GATEWAY_API_KEY` or `VERCEL_AI_GATEWAY_API_KEY` enables a hosted mask/cutout endpoint when one is provided.
- Without a custom endpoint, `AI_GATEWAY_API_KEY`, `VERCEL_AI_GATEWAY_API_KEY`, or `VERCEL_TOKEN` enables the documented Vercel AI Gateway chat image route with `PHOTO_PIPELINE_BACKGROUND_MODEL` (default: `google/gemini-3.1-flash-image-preview`).
- `--strict-gateway` adds an explicit hosted-removal-required warning when hosted background removal is unavailable.

When those keys are absent, the worker still runs a deterministic local quality/mask fallback and records that fact in the manifest warnings. That fallback exists for development and corpus smoke tests only; it always routes to `needs_review` because it cannot prove catalog-safe product isolation on real photos.

Hosted cutouts are post-processed only at the alpha boundary before export: tiny disconnected alpha components are removed, light/gray edge contamination is de-emphasized, and opaque product pixels are preserved. If Claude Vision is unavailable, hosted runs also stay in `needs_review` for human catalog approval instead of auto-approving from heuristic QA alone.

Policy decision for Phase 1: full-image results from generative chat-image providers, including OpenRouter, the Vercel AI Gateway chat route, and custom endpoints that return `image_base64`, are not catalog-safe outputs. The worker may save them as AI-enhanced review artifacts with `processing_mode: "premium"` and `status: "needs_review"`, but they cannot auto-approve or replace catalog-safe mask/cutout-only results without human label verification. Custom hosted endpoints must return `mask_base64` or `cutout_base64` to stay in the catalog-safe lane.

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
