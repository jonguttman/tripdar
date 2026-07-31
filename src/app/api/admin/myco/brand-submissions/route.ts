/**
 * KEWL-2368 — inward brand-submission review queue.
 *
 * The public `/b/<token>` portal writes pending BrandSubmission, CatalogFieldChange,
 * and ProductPhoto rows. This admin route returns those submissions with field-level
 * diffs against the current catalog value, plus pending brand-level fields/assets
 * stored on the submission payload.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PRODUCT_FIELD_LABELS: Record<string, string> = {
  productName: "Product name",
  sku: "SKU",
  format: "Format",
  productUnitMg: "mg per unit",
  unitsPerPack: "Units per pack",
  ingredients: "Ingredients",
  flavors: "Flavors",
  onsetMinutes: "Onset",
  durationMinutes: "Duration",
  brandDoseInstructions: "Dosing guidance",
  active: "Discontinued / no longer produced",
  coaUrl: "COA / lab-test",
};

const BRAND_FIELD_LABELS: Record<string, string> = {
  shortDescription: "About the brand",
  websiteUrl: "Website",
  supportEmail: "Support email",
  primaryColor: "Primary color",
  secondaryColor: "Secondary color",
  accentColor: "Accent color",
  socialHandles: "Social handles",
};

const BRAND_ASSET_LABELS: Record<string, string> = {
  logo: "Brand logo",
  artwork: "Brand artwork",
};

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }
  return session.user.email;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function currentProductValue(item: Record<string, unknown> | null, fieldName: string): unknown {
  if (!item) return null;
  if (fieldName === "coaUrl") return null;
  return item[fieldName] ?? null;
}

function currentBrandValue(brand: Record<string, unknown>, fieldName: string): unknown {
  return brand[fieldName] ?? null;
}

function socialHandlesValue(value: unknown): Record<string, unknown> {
  return asObject(value);
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const submissions = await prisma.brandSubmission.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        partner: { select: { id: true, name: true } },
        brand: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            artworkUrl: true,
            primaryColor: true,
            secondaryColor: true,
            accentColor: true,
            shortDescription: true,
            websiteUrl: true,
            supportEmail: true,
            socialHandles: true,
          },
        },
        catalogItem: {
          select: {
            id: true,
            productName: true,
            sku: true,
            format: true,
            productUnitMg: true,
            unitsPerPack: true,
            ingredients: true,
            flavors: true,
            onsetMinutes: true,
            durationMinutes: true,
            brandDoseInstructions: true,
            active: true,
          },
        },
        fieldChanges: { orderBy: { createdAt: "asc" } },
        photos: { orderBy: { createdAt: "asc" } },
      },
    });

    const data = submissions.map((submission) => {
      const payload = asObject(submission.payload);
      const brandFields = asObject(payload.brandFields);
      const brandAssets = asObject(payload.brandAssets);
      const reviewDecisions = asObject(payload.reviewDecisions);
      const item = submission.catalogItem as unknown as Record<string, unknown> | null;
      const brand = submission.brand as unknown as Record<string, unknown>;

      return {
        id: submission.id,
        status: submission.status,
        createdAt: submission.createdAt,
        reviewedAt: submission.reviewedAt,
        reviewedBy: submission.reviewedBy,
        partner: submission.partner,
        brand: submission.brand,
        catalogItem: submission.catalogItem,
        submitter: {
          name: submission.submitterName,
          role: submission.submitterRole,
          contactPermission: submission.contactPermission,
          preferredContactMethod: submission.preferredContactMethod,
          contactHandle: submission.contactHandle,
          consentToContactAt: submission.consentToContactAt,
          imageUsageGrant: submission.imageUsageGrant,
          imageUsageGrantedAt: submission.imageUsageGrantedAt,
          imageUsageGrantedBy: submission.imageUsageGrantedBy,
        },
        productFields: submission.fieldChanges.map((change) => ({
          id: change.id,
          fieldName: change.fieldName,
          label: PRODUCT_FIELD_LABELS[change.fieldName] ?? change.fieldName,
          previousValue: change.previousValue,
          currentValue: currentProductValue(item, change.fieldName),
          submittedValue: change.submittedValue,
          disposition: change.disposition,
          dispositionBy: change.dispositionBy,
          dispositionAt: change.dispositionAt,
          dispositionReason: change.dispositionReason,
          createdAt: change.createdAt,
        })),
        brandFields: Object.entries(brandFields).map(([fieldName, submittedValue]) => ({
          fieldName,
          label: BRAND_FIELD_LABELS[fieldName] ?? fieldName,
          currentValue:
            fieldName === "socialHandles"
              ? socialHandlesValue(brand.socialHandles)
              : currentBrandValue(brand, fieldName),
          submittedValue,
          decision: asObject(asObject(reviewDecisions.brandFields)[fieldName]).decision ?? "pending",
          reason: asObject(asObject(reviewDecisions.brandFields)[fieldName]).reason ?? null,
        })),
        productPhotos: submission.photos.map((photo) => ({
          id: photo.id,
          catalogItemId: photo.catalogItemId,
          url: photo.url,
          sourceUrl: photo.sourceUrl,
          tag: photo.tag,
          flavor: photo.flavor,
          status: photo.status,
          approvedBy: photo.approvedBy,
          approvedAt: photo.approvedAt,
          rejectedBy: photo.rejectedBy,
          rejectedAt: photo.rejectedAt,
          rejectionReason: photo.rejectionReason,
          provenance: photo.provenance,
          createdAt: photo.createdAt,
        })),
        brandAssets: Object.entries(brandAssets)
          .filter(([, asset]) => Boolean(asset))
          .map(([kind, asset]) => ({
            kind,
            label: BRAND_ASSET_LABELS[kind] ?? kind,
            asset,
            currentValue: kind === "logo" ? submission.brand.logoUrl : submission.brand.artworkUrl,
            decision: asObject(asObject(reviewDecisions.brandAssets)[kind]).decision ?? "pending",
            reason: asObject(asObject(reviewDecisions.brandAssets)[kind]).reason ?? null,
          })),
        missingProducts: Array.isArray(payload.missingProducts) ? payload.missingProducts : [],
      };
    });

    return NextResponse.json({ success: true, data: { submissions: data } });
  } catch (error) {
    console.error("[brand-submissions] load failed:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load brand submissions" } },
      { status: 500 },
    );
  }
}
