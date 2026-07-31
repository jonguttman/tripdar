/**
 * Brand portal data access (KEWL-2331).
 *
 * Resolves a `/b/<token>` link to exactly one brand and that brand's products.
 * Brand isolation is enforced here, once, by always scoping the product query to
 * the brand id carried on the token record — never to anything the caller sent.
 */

import { prisma } from "@/lib/prisma";
import {
  evaluateCatalogAccessToken,
  hashCatalogAccessToken,
  type CatalogTokenValidation,
} from "./catalogTokens";

export type BrandPortalDenial = Extract<CatalogTokenValidation, { ok: false }>["reason"];

export interface BrandPortalPhoto {
  id: string;
  url: string;
  tag: string;
  isPrimary: boolean;
  status: string;
}

export interface BrandPortalProduct {
  id: string;
  productName: string;
  format: string;
  sku: string | null;
  productUnitMg: number | null;
  unitsPerPack: number | null;
  totalDoseMg: number | null;
  ingredients: string[];
  flavors: string[];
  onsetMinutes: number | null;
  durationMinutes: number | null;
  brandDoseInstructions: string | null;
  active: boolean;
  photos: BrandPortalPhoto[];
  /** Blank fields drive the "help us fill these in" affordance on the page. */
  missingFields: string[];
}

export interface BrandPortalBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  artworkUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  shortDescription: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  socialHandles: Record<string, string>;
}

export interface BrandPortalContext {
  tokenId: string;
  partnerId: string;
  brand: BrandPortalBrand;
  products: BrandPortalProduct[];
  /** A previous submission from this link, so the page can say "you already sent…". */
  lastSubmissionAt: Date | null;
}

/** Fields the page highlights as gaps when empty. */
const GAP_FIELDS: Array<{ key: string; label: string }> = [
  { key: "productUnitMg", label: "mg per unit" },
  { key: "unitsPerPack", label: "units per pack" },
  { key: "ingredients", label: "ingredients" },
  { key: "onsetMinutes", label: "onset time" },
  { key: "durationMinutes", label: "duration" },
  { key: "brandDoseInstructions", label: "dosing guidance" },
];

function computeMissingFields(product: {
  productUnitMg: number | null;
  unitsPerPack: number | null;
  ingredients: string[];
  onsetMinutes: number | null;
  durationMinutes: number | null;
  brandDoseInstructions: string | null;
}): string[] {
  const missing: string[] = [];
  for (const field of GAP_FIELDS) {
    const value = (product as unknown as Record<string, unknown>)[field.key];
    const empty =
      value === null ||
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (empty) missing.push(field.label);
  }
  return missing;
}

export type BrandPortalLookup =
  | { ok: true; context: BrandPortalContext }
  | { ok: false; reason: BrandPortalDenial | "no_brand" };

/**
 * Look up a portal token.
 *
 * `purpose` is pinned to `brand_portal`, so a staff-review token pasted into this
 * URL is rejected rather than silently granting brand-level edit rights.
 */
export async function loadBrandPortalContext(token: string): Promise<BrandPortalLookup> {
  if (typeof token !== "string" || token.length < 16 || token.length > 200) {
    return { ok: false, reason: "not_found" };
  }

  const record = await prisma.catalogAccessToken.findUnique({
    where: { tokenHash: hashCatalogAccessToken(token) },
    include: { brand: true },
  });

  const state = evaluateCatalogAccessToken(record, "brand_portal");
  if (!state.ok) return { ok: false, reason: state.reason };
  if (!record || !record.brand || !record.brandId) return { ok: false, reason: "no_brand" };

  const products = await prisma.storeProductCatalog.findMany({
    // The isolation boundary: brand id comes from the token record, never the request.
    where: { brandId: record.brandId, partnerId: record.partnerId },
    orderBy: [{ active: "desc" }, { productName: "asc" }],
    include: {
      photos: {
        where: { status: { in: ["approved", "pending"] } },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      },
    },
  });

  const lastSubmission = await prisma.brandSubmission.findFirst({
    where: { brandId: record.brandId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const brand = record.brand;

  return {
    ok: true,
    context: {
      tokenId: record.id,
      partnerId: record.partnerId,
      brand: {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        logoUrl: brand.logoUrl,
        artworkUrl: brand.artworkUrl,
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor,
        accentColor: brand.accentColor,
        shortDescription: brand.shortDescription,
        websiteUrl: brand.websiteUrl,
        supportEmail: brand.supportEmail,
        socialHandles: (brand.socialHandles ?? {}) as Record<string, string>,
      },
      products: products.map((product) => ({
        id: product.id,
        productName: product.productName,
        format: product.format,
        sku: product.sku,
        productUnitMg: product.productUnitMg,
        unitsPerPack: product.unitsPerPack,
        totalDoseMg: product.totalDoseMg,
        ingredients: product.ingredients,
        flavors: product.flavors,
        onsetMinutes: product.onsetMinutes,
        durationMinutes: product.durationMinutes,
        brandDoseInstructions: product.brandDoseInstructions,
        active: product.active,
        photos: product.photos.map((photo) => ({
          id: photo.id,
          url: photo.url,
          tag: photo.tag,
          isPrimary: photo.isPrimary,
          status: photo.status,
        })),
        missingFields: computeMissingFields(product),
      })),
      lastSubmissionAt: lastSubmission?.createdAt ?? null,
    },
  };
}

/** Records that the brand has actually opened the link — useful for chasing. */
export async function markTokenOpened(tokenId: string): Promise<void> {
  await prisma.catalogAccessToken.updateMany({
    where: { id: tokenId, openedAt: null },
    data: { openedAt: new Date() },
  });
}
