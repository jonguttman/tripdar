/**
 * Brand portal submission endpoint (KEWL-2331).
 *
 * GET  — current state of the brand and its products, for the `/b/<token>` page.
 * POST — a brand submission.
 *
 * Nothing written here touches a live product record. Field corrections land as
 * `pending` rows in the append-only `CatalogFieldChange` log tagged
 * `brand-provided`, and photos land as `pending` `ProductPhoto` rows. The review
 * queue (KEWL-2368) is what promotes either. A brand claim is a claim — it never
 * satisfies the staff verification gate, and it never blocks a product from being
 * displayed.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/domain/myco/rate-limit";
import { sendEmail } from "@/lib/email";
import { buildCatalogFieldChange } from "@/domain/myco/catalogProvenance";
import { loadBrandPortalContext, markTokenOpened } from "@/domain/myco/brandPortalData";
import {
  BRAND_PORTAL_SOURCE,
  BrandPortalValidationError,
  buildActorIdentity,
  parseBrandPortalSubmission,
  valuesDiffer,
  type ProductFieldSubmission,
} from "@/domain/myco/brandPortal";
import {
  BRAND_ASSET_KIND_LABELS,
  SINGLETON_BRAND_ASSET_KINDS,
  verifyBrandAssetHandle,
} from "@/domain/myco/brandPortalAssets";
import {
  buildAckHtml,
  buildAckSubject,
  buildAckText,
  formatAckValue,
  type AckProductLine,
} from "@/domain/myco/brandPortalAck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Human labels for the receipt and the review diff. */
const FIELD_LABELS: Record<string, string> = {
  productName: "Product name",
  sku: "SKU",
  format: "Format",
  productUnitMg: "mg per unit",
  unitsPerPack: "Units per pack",
  ingredients: "Ingredients",
  flavors: "Flavors",
  onsetMinutes: "Onset (minutes)",
  durationMinutes: "Duration (minutes)",
  brandDoseInstructions: "Dosing guidance",
  shortDescription: "About the brand",
  websiteUrl: "Website",
  supportEmail: "Support email",
  primaryColor: "Primary color",
  secondaryColor: "Secondary color",
  accentColor: "Accent color",
  socialHandles: "Social handles",
};

const DEFAULT_REVIEW_NOTIFY_RECIPIENTS = ["jonguttman@gmail.com", "scottyclaw@gmail.com"];

function reviewNotifyRecipients(): string[] {
  const configured = process.env.BRAND_SUBMISSION_NOTIFY_EMAILS?.split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_REVIEW_NOTIFY_RECIPIENTS;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function labelFor(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function denied(reason: string) {
  const status = reason === "expired" || reason === "revoked" ? 410 : 404;
  const message =
    reason === "revoked"
      ? "This brand link has been turned off. Get in touch and we'll send a fresh one."
      : reason === "expired"
        ? "This brand link has expired. Get in touch and we'll send a fresh one."
        : "This brand link is no longer valid";
  return NextResponse.json({ success: false, error: { message } }, { status });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const lookup = await loadBrandPortalContext(token);
    if (!lookup.ok) return denied(lookup.reason);
    await markTokenOpened(lookup.context.tokenId);
    return NextResponse.json({
      success: true,
      data: { brand: lookup.context.brand, products: lookup.context.products },
    });
  } catch (error) {
    console.error("[brand-portal] load failed:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load brand portal" } },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    // Public-write rate limiting is enforced solely in `src/middleware.ts` for the
    // `/api/myco/brand-portal` prefix. Calling the limiter here too would increment
    // the IP and token buckets a second time per request (KEWL-2383).

    const lookup = await loadBrandPortalContext(token);
    if (!lookup.ok) return denied(lookup.reason);
    const { brand, products, tokenId, partnerId } = lookup.context;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: { message: "Malformed submission" } },
        { status: 400 },
      );
    }

    const now = new Date();
    const submission = parseBrandPortalSubmission(body, now);

    // Only products this token exposes. A correction aimed at another brand's
    // product is dropped rather than silently accepted.
    const productsById = new Map(products.map((product) => [product.id, product]));
    const scopedProducts: ProductFieldSubmission[] = submission.products.filter((entry) =>
      productsById.has(entry.catalogItemId),
    );
    if (scopedProducts.length !== submission.products.length) {
      return NextResponse.json(
        { success: false, error: { message: "One of those products isn't on this brand's link" } },
        { status: 403 },
      );
    }

    // Signed handles only — an unsigned or foreign-brand handle is rejected outright.
    const assets = submission.uploadIds
      .map((handle) => verifyBrandAssetHandle(handle, brand.id, now.getTime()))
      .filter((descriptor): descriptor is NonNullable<typeof descriptor> => descriptor !== null);
    if (assets.length !== submission.uploadIds.length) {
      return NextResponse.json(
        { success: false, error: { message: "Some uploads expired. Please re-add them." } },
        { status: 400 },
      );
    }
    const photoAssets = assets.filter(
      (asset) => asset.kind === "product_photo" && asset.catalogItemId,
    );
    if (photoAssets.some((asset) => !productsById.has(asset.catalogItemId!))) {
      return NextResponse.json(
        { success: false, error: { message: "A photo referenced a product not on this link" } },
        { status: 403 },
      );
    }

    // A brand has one logo and one key visual. Rejecting the second is honest;
    // silently keeping the first and orphaning the rest is what we're fixing.
    for (const kind of SINGLETON_BRAND_ASSET_KINDS) {
      if (assets.filter((asset) => asset.kind === kind).length > 1) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: `Only one ${BRAND_ASSET_KIND_LABELS[kind]} per submission — remove the extras and send again.`,
            },
          },
          { status: 400 },
        );
      }
    }

    const actorIdentity = buildActorIdentity(submission.contact, brand.name);

    // Build the field changes against what we currently hold, so the log records a
    // real before/after rather than a re-statement of the form.
    interface PendingChange {
      catalogItemId: string;
      fieldName: string;
      previousValue: unknown;
      submittedValue: unknown;
    }
    const pendingChanges: PendingChange[] = [];
    const ackProducts: AckProductLine[] = [];

    for (const entry of scopedProducts) {
      const current = productsById.get(entry.catalogItemId)!;
      const changeLines: AckProductLine["changes"] = [];

      for (const [fieldName, submittedValue] of Object.entries(entry.fields)) {
        const previousValue = (current as unknown as Record<string, unknown>)[fieldName] ?? null;
        if (!valuesDiffer(previousValue, submittedValue)) continue;
        pendingChanges.push({
          catalogItemId: entry.catalogItemId,
          fieldName,
          previousValue,
          submittedValue,
        });
        changeLines.push({
          label: labelFor(fieldName),
          from: formatAckValue(previousValue),
          to: submittedValue === null ? "(cleared)" : formatAckValue(submittedValue),
        });
      }

      // "No longer produced" is a claim about the product, so it rides the same
      // append-only log and gets reviewed like any other field.
      if (entry.discontinued) {
        pendingChanges.push({
          catalogItemId: entry.catalogItemId,
          fieldName: "active",
          previousValue: current.active,
          submittedValue: false,
        });
      }
      if (entry.coaUrl) {
        pendingChanges.push({
          catalogItemId: entry.catalogItemId,
          fieldName: "coaUrl",
          previousValue: null,
          submittedValue: entry.coaUrl,
        });
        changeLines.push({ label: "COA / lab test", from: "—", to: entry.coaUrl });
      }

      // Named, not counted — the receipt has to let a submitter check our record of
      // their files against theirs.
      const photoFilenames = photoAssets
        .filter((asset) => asset.catalogItemId === entry.catalogItemId)
        .map((asset) => asset.originalFilename);

      if (changeLines.length || entry.discontinued || photoFilenames.length || entry.note) {
        ackProducts.push({
          productName: current.productName,
          changes: changeLines,
          discontinued: entry.discontinued,
          photoFilenames,
          note: entry.note,
        });
      }
    }

    // Photos attached to a product that had no field edits still deserve a receipt line.
    for (const asset of photoAssets) {
      const current = productsById.get(asset.catalogItemId!)!;
      if (ackProducts.some((line) => line.productName === current.productName)) continue;
      ackProducts.push({
        productName: current.productName,
        changes: [],
        discontinued: false,
        photoFilenames: photoAssets
          .filter((item) => item.catalogItemId === asset.catalogItemId)
          .map((item) => item.originalFilename),
      });
    }

    // Singleton-checked above, so `find` is now the only possible answer rather than
    // a silent truncation.
    const logoAsset = assets.find((asset) => asset.kind === "brand_logo") ?? null;
    const artworkAsset = assets.find((asset) => asset.kind === "brand_artwork") ?? null;

    const created = await prisma.$transaction(async (tx) => {
      const brandSubmission = await tx.brandSubmission.create({
        data: {
          partnerId,
          brandId: brand.id,
          accessTokenId: tokenId,
          status: "pending",
          submitterName: submission.contact.submitterName,
          submitterRole: submission.contact.submitterRole,
          contactPermission: submission.contact.contactPermission,
          preferredContactMethod: submission.contact.preferredContactMethod,
          contactHandle: submission.contact.contactHandle,
          consentToContactAt: submission.contact.consentToContactAt,
          imageUsageGrant: submission.imageUsageGrant,
          imageUsageGrantedAt: submission.imageUsageGrantedAt,
          imageUsageGrantedBy: submission.imageUsageGrant ? actorIdentity : null,
          payload: {
            brandFields: submission.brandFields,
            missingProducts: submission.missingProducts,
            productNotes: scopedProducts
              .filter((entry) => entry.note)
              .map((entry) => ({ catalogItemId: entry.catalogItemId, note: entry.note })),
            discontinued: scopedProducts
              .filter((entry) => entry.discontinued)
              .map((entry) => entry.catalogItemId),
            // Brand-level assets stay pending here; the review queue promotes them
            // onto Brand.logoUrl / artworkUrl.
            brandAssets: {
              logo: logoAsset
                ? { url: logoAsset.url, displayUrl: logoAsset.displayUrl, filename: logoAsset.originalFilename }
                : null,
              artwork: artworkAsset
                ? {
                    url: artworkAsset.url,
                    displayUrl: artworkAsset.displayUrl,
                    filename: artworkAsset.originalFilename,
                  }
                : null,
            },
            submittedFromIp: clientIp(request),
          } as unknown as Prisma.InputJsonValue,
        },
      });

      if (pendingChanges.length) {
        await tx.catalogFieldChange.createMany({
          data: pendingChanges.map((change) => {
            const built = buildCatalogFieldChange({
              fieldName: change.fieldName,
              previousValue: change.previousValue,
              submittedValue: change.submittedValue,
              actorType: "brand",
              actorIdentity,
              source: BRAND_PORTAL_SOURCE,
              disposition: "pending",
            });
            return {
              ...built,
              // A field we held nothing for is SQL NULL, not the JSON value `null`,
              // so "we had no value" stays distinguishable from "the value was null".
              previousValue:
                built.previousValue === null
                  ? Prisma.DbNull
                  : (built.previousValue as Prisma.InputJsonValue),
              // The submitted side reads the other way: the brand always submitted
              // *something*, so the JSON value `null` is the positive instruction
              // "empty this field" rather than an absence (KEWL-2390 gap 1). A
              // reviewer seeing JSON null is being asked to withdraw the value.
              submittedValue:
                built.submittedValue === null
                  ? Prisma.JsonNull
                  : (built.submittedValue as Prisma.InputJsonValue),
              catalogItemId: change.catalogItemId,
              brandSubmissionId: brandSubmission.id,
            };
          }),
        });
      }

      if (photoAssets.length) {
        await tx.productPhoto.createMany({
          data: photoAssets.map((asset) => ({
            catalogItemId: asset.catalogItemId!,
            // Prefer the display derivative for rendering; the untouched original
            // is kept on the provenance record for label reading.
            url: asset.displayUrl ?? asset.url,
            sourceUrl: asset.url,
            tag: asset.tag ?? "other",
            kind: "source",
            status: "pending",
            submissionSource: "brand",
            brandSubmissionId: brandSubmission.id,
            isPrimary: false,
            provenance: {
              originalUrl: asset.url,
              originalFilename: asset.originalFilename,
              contentType: asset.contentType,
              size: asset.size,
              width: asset.width,
              height: asset.height,
              submittedBy: actorIdentity,
              imageUsageGrant: submission.imageUsageGrant,
              imageUsageGrantedAt: submission.imageUsageGrantedAt?.toISOString() ?? null,
            },
          })),
        });
      }

      return brandSubmission;
    });

    // The receipt is best-effort: a failed send must never cost the brand its work.
    // It goes wherever we hold an email address, whatever channel they picked for
    // follow-up and whether or not they wanted follow-up at all (KEWL-2390 gap 4).
    let acknowledgmentSent = false;
    const ackEmail = submission.contact.receiptEmail;
    if (ackEmail) {
      try {
        const origin = new URL(request.url).origin;
        const ackPayload = {
          brandName: brand.name,
          submitterName: submission.contact.submitterName,
          portalUrl: `${origin}/b/${token}`,
          submittedAt: now,
          products: ackProducts,
          brandFieldChanges: Object.entries(submission.brandFields).map(([field, value]) => ({
            label: labelFor(field),
            // `null` is a deliberate clear, and the receipt says so plainly rather
            // than echoing the word "null" back at the submitter.
            value:
              field === "socialHandles"
                ? Object.entries(value as Record<string, string | null>)
                    .map(([network, handle]) =>
                      handle === null ? `${network}: removed` : `${network}: @${handle}`,
                    )
                    .join(", ")
                : value === null
                  ? "(cleared)"
                  : formatAckValue(value),
          })),
          // The whole missing-product report, not just its name — the submitter
          // typed format, strength and pack size, so the receipt has to show them.
          missingProducts: submission.missingProducts,
          brandAssets: [
            logoAsset
              ? { label: "Brand logo", filename: logoAsset.originalFilename }
              : null,
            artworkAsset
              ? { label: "Brand artwork", filename: artworkAsset.originalFilename }
              : null,
          ].filter((asset): asset is { label: string; filename: string } => asset !== null),
          imageUsageGrant: submission.imageUsageGrant,
          contactMethod: submission.contact.preferredContactMethod,
          contactHandle: submission.contact.contactHandle,
        };
        await sendEmail({
          to: ackEmail,
          subject: buildAckSubject(brand.name),
          html: buildAckHtml(ackPayload),
          text: buildAckText(ackPayload),
        });
        acknowledgmentSent = true;
      } catch (error) {
        console.error("[brand-portal] acknowledgment send failed:", error);
      }
    }

    // Internal arrival notification is separate from the submitter receipt. These
    // submissions are rare and should land in front of Jon/Scotty immediately.
    try {
      const origin = new URL(request.url).origin;
      const reviewUrl = `${origin}/admin/myco/brand-submissions`;
      const safeBrandName = escapeHtml(brand.name);
      const safeSubmitterName = escapeHtml(submission.contact.submitterName);
      const safeSubmitterRole = escapeHtml(submission.contact.submitterRole);
      await sendEmail({
        to: reviewNotifyRecipients(),
        subject: `Brand submission ready for review: ${brand.name}`,
        html: `
          <div style="font-family: sans-serif; line-height: 1.6;">
            <h2 style="margin: 0 0 12px;">Brand submission ready for review</h2>
            <p><strong>Brand:</strong> ${safeBrandName}</p>
            <p><strong>Submitter:</strong> ${safeSubmitterName} (${safeSubmitterRole})</p>
            <p><strong>Saved changes:</strong> ${pendingChanges.length} field claim(s), ${photoAssets.length} product photo(s), ${submission.missingProducts.length} missing product report(s).</p>
            <p><a href="${reviewUrl}">Open the review queue</a></p>
          </div>
        `,
        text: [
          `Brand submission ready for review: ${brand.name}`,
          `Submitter: ${submission.contact.submitterName} (${submission.contact.submitterRole})`,
          `Saved changes: ${pendingChanges.length} field claim(s), ${photoAssets.length} product photo(s), ${submission.missingProducts.length} missing product report(s).`,
          `Review queue: ${reviewUrl}`,
        ].join("\n"),
      });
    } catch (error) {
      console.error("[brand-portal] review notification send failed:", error);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          submissionId: created.id,
          fieldChanges: pendingChanges.length,
          photos: photoAssets.length,
          acknowledgmentSent,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BrandPortalValidationError) {
      return NextResponse.json(
        { success: false, error: { message: error.message, field: error.field } },
        { status: 400 },
      );
    }
    console.error("[brand-portal] submission failed:", error);
    return NextResponse.json(
      { success: false, error: { message: "We couldn't save that. Please try again." } },
      { status: 500 },
    );
  }
}
