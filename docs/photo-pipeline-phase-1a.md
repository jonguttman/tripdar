# Photo Pipeline Phase 1a Contracts

## Architecture Review

### Recommended architecture
Phase 1a adds a durable `PhotoJob` ledger and immutable Blob contract for catalog-safe product photos. Uploads are deduped by `sourceContentHash` (`sha256` of the original bytes), while human-facing IDs use `jobId` such as `tripdar-2026-000124`.

The state machine is exactly:

`uploaded -> analyzing -> processing -> validating -> needs_review -> approved -> rejected -> failed`

`processingMode` is restricted to `catalog_safe` or `premium`; Phase 1 workers must only run `catalog_safe`.

### Blob layout
All paths are rooted under `tripdar-product-images/`.

| Prefix | Stage contract |
| --- | --- |
| `incoming/` | Optional upload landing area before a `PhotoJob` is created. |
| `originals/` | Immutable source image. Written once after content hash is computed; never overwritten. |
| `working/` | Temporary/intermediate worker artifacts. |
| `catalog-safe/` | 3000x3000 white-background PNG master. |
| `transparent/` | 3000x3000 transparent PNG master. |
| `web/` | 1200x1200 WebP and optional marketplace/AVIF derivatives. |
| `thumbnails/` | 600x600 WebP thumbnail. |
| `needs-review/` | Review copies for jobs that fail automatic quality gates. |
| `rejected/` | Rejected outputs retained for audit/debugging. |
| `manifests/` | One JSON manifest per source image, named from `job_id`. |
| `logs/` | Worker logs and validation reports. |

Worker read/write flow:

1. Read from `incoming/` or direct upload stream.
2. Compute `sha256(original bytes)` and check `PhotoJob.sourceContentHash`.
3. Build the `originals/` path with `buildOriginalBlobPath()` and call `assertOriginalBlobIsNew()` against existing original pathnames before writing.
4. Write intermediate files to `working/`.
5. Write catalog-safe outputs to `transparent/`, `catalog-safe/`, `web/`, and `thumbnails/`.
6. If validation requires review, write review artifacts to `needs-review/`; rejected jobs write retained copies to `rejected/`.
7. Write the manifest JSON to `manifests/{job_id}.json` and mirror it into `PhotoJob.manifest`.
8. Write worker logs to `logs/`.

### Manifest schema
The canonical schema is `photo-pipeline/config/manifest.schema.json`. Required shape:

```json
{
  "job_id": "tripdar-2026-000124",
  "sku": "sku-001",
  "source_file": "IMG_1234.heic",
  "processing_mode": "catalog_safe",
  "status": "approved",
  "outputs": {
    "transparent_master": "tripdar-product-images/transparent/sku_brand_product_variant_front_catalog-safe_v01.png",
    "white_master": "tripdar-product-images/catalog-safe/sku_brand_product_variant_front_catalog-safe_v01.png",
    "web": "tripdar-product-images/web/sku_brand_product_variant_front_catalog-safe_v01.webp",
    "thumbnail": "tripdar-product-images/thumbnails/sku_brand_product_variant_front_catalog-safe_v01.webp"
  },
  "quality_score": 0.92,
  "label_fidelity_score": null,
  "warnings": [],
  "approved_by": "admin@example.com",
  "approved_at": "2026-07-16T19:15:00.000Z"
}
```

### Naming
Canonical template:

`{sku}_{brand}_{product}_{variant}_{view}_{mode}_v{NN}.{ext}`

Sanitizing is lowercase, NFKD accent stripping, unsafe characters to hyphens, repeated hyphens collapsed, edge hyphens stripped, max 60 characters per field, and `unknown` for empty fields. Use `sanitizePhotoNameField()` and `buildDeterministicPhotoFilename()` from `src/domain/photo-pipeline/naming.ts`.

### Catalog-safe preset
The locked v1 config is `photo-pipeline/config/catalog_safe_preset.v1.json`. It defines sRGB output, pure white `#FFFFFF`, 1:1 centered composition, product height target 76% clamped to 72-80%, soft low-opacity shadow directly beneath and slightly wider than the product base, required 3000 square PNG masters, 1200 square WebP, and 600 square thumbnail.

### Risks
- Security: Manifests and logs must not include credentials, signed upload tokens, or customer identity beyond approved operator metadata.
- Data integrity: `sourceContentHash` uniqueness prevents duplicate source processing, but worker retries must be idempotent across Blob writes and `PhotoJob` updates.
- Operational: Originals immutability depends on worker code calling the guard before Blob `put`; production workers must fail closed if an original pathname already exists.

### Migration impact
- Files affected: `prisma/schema.prisma`, `prisma/migrations/20260716121500_photo_pipeline_phase_1a/migration.sql`.
- Downtime: No expected downtime. This creates new enum types and a new table only.
- Rollback plan: Stop workers, drop `PhotoJob`, drop `PhotoJobStatus`, drop `PhotoJobProcessingMode`, and remove the schema/client references. Do not delete Blob originals during rollback.

### Files likely affected
- `prisma/schema.prisma`
- `prisma/migrations/20260716121500_photo_pipeline_phase_1a/migration.sql`
- `src/domain/photo-pipeline/*`
- `photo-pipeline/config/*`
- `docs/photo-pipeline-phase-1a.md`

### What must be tested
- Pre-deploy: `prisma validate`, TypeScript check, manifest schema validation with approved/needs_review examples, duplicate upload attempt by same SHA-256.
- Post-deploy: Confirm `PhotoJob` table and enum types exist, create one non-production test job, verify duplicate hash is rejected, verify original overwrite guard blocks existing path, verify manifest writes to `tripdar-product-images/manifests/`.

### Approval gates
Jon must explicitly approve applying this migration to any production database and enabling any worker that writes originals, manifests, or processed outputs.

### Decision rationale
This uses a separate `PhotoJob` ledger instead of extending `ProductPhoto` because processing jobs have retries, manifests, costs, review states, and immutable source audit needs that are distinct from customer-facing product photo display. Enums are used instead of unconstrained strings because the ticket requires exact mode/status contracts and Postgres supports the constraint directly.
