/**
 * Brand portal upload endpoint (KEWL-2331).
 *
 * Unauthenticated: possession of the link is the only credential. Every file is
 * sniffed, validated and re-keyed server-side before it touches storage, and the
 * caller gets back a signed handle rather than a raw URL so it cannot attach an
 * arbitrary object to a submission later.
 */

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { loadBrandPortalContext } from "@/domain/myco/brandPortalData";
import {
  BRAND_ASSET_KIND_LABELS,
  BRAND_ASSET_KINDS,
  BRAND_ASSET_MAX_FILES_PER_REQUEST,
  BrandAssetError,
  PRODUCT_PHOTO_TAGS,
  buildBrandAssetPath,
  isSingletonBrandAssetKind,
  prepareBrandAsset,
  signBrandAssetHandle,
  type BrandAssetKind,
  type ProductPhotoTag,
} from "@/domain/myco/brandPortalAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Full-resolution originals; the derivative work is CPU-bound. */
export const maxDuration = 60;

function denied(reason: string) {
  const status = reason === "expired" || reason === "revoked" ? 410 : 404;
  return NextResponse.json(
    { success: false, error: { message: "This brand link is no longer valid" } },
    { status },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    // Public-write rate limiting is enforced solely in `src/middleware.ts` for the
    // `/api/myco/brand-portal` prefix. Calling the limiter here too would increment
    // the IP and token buckets a second time per request (KEWL-2383).

    const lookup = await loadBrandPortalContext(token);
    if (!lookup.ok) return denied(lookup.reason);
    const { brand, products } = lookup.context;

    const form = await request.formData();

    const kindRaw = String(form.get("kind") ?? "product_photo");
    if (!(BRAND_ASSET_KINDS as readonly string[]).includes(kindRaw)) {
      return NextResponse.json(
        { success: false, error: { message: "Unknown upload kind" } },
        { status: 400 },
      );
    }
    const kind = kindRaw as BrandAssetKind;

    // We are about to store someone else's artwork on our infrastructure and, once
    // reviewed, publish it. The written grant is the basis for doing that, so no
    // bytes are accepted without it (KEWL-2390 gap 3). The submission endpoint
    // re-checks it, but refusing here means we never hold ungranted images at all.
    const imageUsageGrant = String(form.get("imageUsageGrant") ?? "") === "true";
    if (!imageUsageGrant) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message:
              "Grant permission to display these images before uploading — tick the image permission box.",
            field: "imageUsageGrant",
          },
        },
        { status: 403 },
      );
    }

    let tag: ProductPhotoTag | null = null;
    let catalogItemId: string | null = null;

    if (kind === "product_photo") {
      const tagRaw = String(form.get("tag") ?? "other");
      if (!(PRODUCT_PHOTO_TAGS as readonly string[]).includes(tagRaw)) {
        return NextResponse.json(
          { success: false, error: { message: "Unknown photo type" } },
          { status: 400 },
        );
      }
      tag = tagRaw as ProductPhotoTag;

      catalogItemId = String(form.get("catalogItemId") ?? "");
      // Cross-brand isolation: the product must be one this token already exposes.
      if (!products.some((product) => product.id === catalogItemId)) {
        return NextResponse.json(
          { success: false, error: { message: "That product isn't on this brand's link" } },
          { status: 403 },
        );
      }
    }

    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (!files.length) {
      return NextResponse.json(
        { success: false, error: { message: "No file received" } },
        { status: 400 },
      );
    }
    if (files.length > BRAND_ASSET_MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        {
          success: false,
          error: { message: `Too many files at once. Maximum ${BRAND_ASSET_MAX_FILES_PER_REQUEST}` },
        },
        { status: 400 },
      );
    }
    // One logo, one key visual. Accepting a second and keeping only the first is
    // how the extras became orphaned blobs (KEWL-2390 gap 2).
    if (isSingletonBrandAssetKind(kind) && files.length > 1) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Send one ${BRAND_ASSET_KIND_LABELS[kind]} at a time — uploading a new one replaces it.`,
          },
        },
        { status: 400 },
      );
    }

    const uploaded: Array<Record<string, unknown>> = [];

    for (const file of files) {
      const prepared = await prepareBrandAsset(file, kind);

      // The original, byte-for-byte. Packaging labels are ground truth for dosing;
      // we never ship the brand a resized copy of their own evidence.
      const originalBlob = await put(
        buildBrandAssetPath({
          brandId: brand.id,
          kind,
          extension: prepared.original.extension,
          variant: "original",
        }),
        prepared.original.bytes,
        {
          access: "public",
          contentType: prepared.original.contentType,
          addRandomSuffix: false,
        },
      );

      let displayUrl: string | null = null;
      if (prepared.derivative) {
        const displayBlob = await put(
          buildBrandAssetPath({
            brandId: brand.id,
            kind,
            extension: prepared.derivative.extension,
            variant: "display",
          }),
          prepared.derivative.bytes,
          {
            access: "public",
            contentType: prepared.derivative.contentType,
            addRandomSuffix: false,
          },
        );
        displayUrl = displayBlob.url;
      }

      const handle = signBrandAssetHandle({
        brandId: brand.id,
        kind,
        tag,
        catalogItemId,
        url: originalBlob.url,
        displayUrl,
        originalFilename: prepared.originalFilename,
        contentType: prepared.original.contentType,
        size: prepared.originalSize,
        width: prepared.width,
        height: prepared.height,
        issuedAt: Date.now(),
      });

      uploaded.push({
        handle,
        kind,
        tag,
        catalogItemId,
        previewUrl: displayUrl ?? originalBlob.url,
        originalFilename: prepared.originalFilename,
        size: prepared.originalSize,
        width: prepared.width,
        height: prepared.height,
      });
    }

    return NextResponse.json({ success: true, data: { uploads: uploaded } }, { status: 201 });
  } catch (error) {
    if (error instanceof BrandAssetError) {
      return NextResponse.json(
        { success: false, error: { message: error.message } },
        { status: 400 },
      );
    }
    console.error("[brand-portal] upload failed:", error);
    return NextResponse.json(
      { success: false, error: { message: "We couldn't process that file. Please try again." } },
      { status: 500 },
    );
  }
}
