"use client";

/**
 * The brand-facing portal UI (KEWL-2331).
 *
 * Design intent: the brand is *correcting*, not re-entering. Every field arrives
 * pre-filled with what we currently hold and every product shows the photo a
 * customer would see today, so the page reads as "here's how you look — fix what's
 * wrong" rather than as a data-entry chore. Only fields that actually changed are
 * sent, which is also what keeps the review-queue diff meaningful.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { portalTheme } from "./theme";

interface Photo {
  id: string;
  url: string;
  tag: string;
  isPrimary: boolean;
  status: string;
}

interface Product {
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
  photos: Photo[];
  missingFields: string[];
}

interface Brand {
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

interface UploadedAsset {
  handle: string;
  kind: string;
  tag: string | null;
  catalogItemId: string | null;
  previewUrl: string;
  originalFilename: string;
}

const PRODUCT_FIELDS: Array<{
  key: keyof Product;
  label: string;
  hint?: string;
  type: "text" | "number" | "list" | "textarea" | "format";
}> = [
  { key: "productName", label: "Product name", type: "text" },
  { key: "sku", label: "SKU", type: "text" },
  { key: "format", label: "Format", type: "format" },
  { key: "productUnitMg", label: "mg per unit", hint: "Active mg in one capsule / piece", type: "number" },
  { key: "unitsPerPack", label: "Units per pack", type: "number" },
  { key: "ingredients", label: "Ingredients", hint: "Comma separated", type: "list" },
  { key: "flavors", label: "Flavors", hint: "Comma separated", type: "list" },
  { key: "onsetMinutes", label: "Onset (minutes)", type: "number" },
  { key: "durationMinutes", label: "Duration (minutes)", type: "number" },
  { key: "brandDoseInstructions", label: "Dosing guidance", hint: "How you tell people to take it", type: "textarea" },
];

const FORMATS = ["capsule", "edible", "dried", "tincture", "other"];

/**
 * Kinds the brand has exactly one of. Mirrors `SINGLETON_BRAND_ASSET_KINDS` in
 * `@/domain/myco/brandPortalAssets`, restated here rather than imported so this
 * client bundle doesn't pull in the server-only image pipeline.
 */
const SINGLETON_ASSET_KINDS = ["brand_logo", "brand_artwork"];

const PHOTO_TAGS: Array<{ value: string; label: string; blurb: string }> = [
  { value: "package_front", label: "Packaging — front", blurb: "The label is how we verify dosing" },
  { value: "package_back", label: "Packaging — back", blurb: "Ingredients and mg panel" },
  { value: "stock", label: "Product shot", blurb: "The product itself" },
  { value: "lifestyle", label: "Lifestyle", blurb: "In context" },
];

function toInputValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export default function BrandPortalClient({
  token,
  brand,
  products,
  lastSubmissionAt,
}: {
  token: string;
  brand: Brand;
  products: Product[];
  lastSubmissionAt: string | null;
}) {
  const [productEdits, setProductEdits] = useState<Record<string, Record<string, string>>>({});
  const [discontinued, setDiscontinued] = useState<Record<string, boolean>>({});
  const [productNotes, setProductNotes] = useState<Record<string, string>>({});
  const [coaUrls, setCoaUrls] = useState<Record<string, string>>({});
  const [openProduct, setOpenProduct] = useState<string | null>(null);

  const [brandFields, setBrandFields] = useState({
    shortDescription: brand.shortDescription ?? "",
    websiteUrl: brand.websiteUrl ?? "",
    supportEmail: brand.supportEmail ?? "",
    primaryColor: brand.primaryColor ?? "",
    secondaryColor: brand.secondaryColor ?? "",
    accentColor: brand.accentColor ?? "",
    instagram: brand.socialHandles?.instagram ?? "",
    x: brand.socialHandles?.x ?? "",
    tiktok: brand.socialHandles?.tiktok ?? "",
    linkedin: brand.socialHandles?.linkedin ?? "",
  });

  const [missingProducts, setMissingProducts] = useState<
    Array<{ productName: string; format: string; productUnitMg: string; note: string }>
  >([]);

  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  const [contact, setContact] = useState({
    submitterName: "",
    submitterRole: "",
    contactPermission: true,
    preferredContactMethod: "email",
    contactHandle: "",
    // Separate from follow-up consent on purpose: a receipt for work you just did
    // is not a follow-up (KEWL-2390 gap 4).
    receiptEmail: "",
  });
  const [imageUsageGrant, setImageUsageGrant] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ acknowledgmentSent: boolean } | null>(null);

  const productsById = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, product])),
    [products],
  );

  const setProductField = useCallback((productId: string, field: string, value: string) => {
    setProductEdits((previous) => ({
      ...previous,
      [productId]: { ...(previous[productId] ?? {}), [field]: value },
    }));
  }, []);

  /** Only fields whose value actually differs from what we hold. */
  const changedFieldsFor = useCallback(
    (productId: string): Record<string, string> => {
      const edits = productEdits[productId];
      if (!edits) return {};
      const product = productsById[productId];
      const changed: Record<string, string> = {};
      for (const [field, value] of Object.entries(edits)) {
        if (value !== toInputValue(product[field as keyof Product])) changed[field] = value;
      }
      return changed;
    },
    [productEdits, productsById],
  );

  const changedBrandFields = useMemo(() => {
    const current: Record<string, string> = {
      shortDescription: brand.shortDescription ?? "",
      websiteUrl: brand.websiteUrl ?? "",
      supportEmail: brand.supportEmail ?? "",
      primaryColor: brand.primaryColor ?? "",
      secondaryColor: brand.secondaryColor ?? "",
      accentColor: brand.accentColor ?? "",
      instagram: brand.socialHandles?.instagram ?? "",
      x: brand.socialHandles?.x ?? "",
      tiktok: brand.socialHandles?.tiktok ?? "",
      linkedin: brand.socialHandles?.linkedin ?? "",
    };
    const changed: Record<string, string> = {};
    for (const [field, value] of Object.entries(brandFields)) {
      // An emptied box is a change too — it is how a brand withdraws a wrong
      // website or support address. The server reads "" as an explicit clear
      // (KEWL-2390 gap 1); dropping it here is what made corrections impossible.
      if (value !== current[field]) changed[field] = value;
    }
    return changed;
  }, [brandFields, brand]);

  const changeCount = useMemo(() => {
    let count = Object.keys(changedBrandFields).length + assets.length;
    for (const product of products) {
      count += Object.keys(changedFieldsFor(product.id)).length;
      if (discontinued[product.id]) count += 1;
      if (coaUrls[product.id]?.trim()) count += 1;
      if (productNotes[product.id]?.trim()) count += 1;
    }
    count += missingProducts.filter((entry) => entry.productName.trim()).length;
    return count;
  }, [
    changedBrandFields,
    assets,
    products,
    changedFieldsFor,
    discontinued,
    coaUrls,
    productNotes,
    missingProducts,
  ]);

  const upload = useCallback(
    async (files: FileList | null, kind: string, tag: string | null, catalogItemId: string | null) => {
      if (!files || !files.length) return;
      // The server refuses ungranted bytes outright; saying so before the upload
      // beats letting someone watch a 40 MB file fail (KEWL-2390 gap 3).
      if (!imageUsageGrant) {
        setError(
          "Tick the image permission box below before uploading — we can't accept images without it.",
        );
        return;
      }
      const slot = `${kind}:${catalogItemId ?? "brand"}:${tag ?? ""}`;
      setUploading(slot);
      setError(null);
      try {
        const form = new FormData();
        form.append("kind", kind);
        form.append("imageUsageGrant", "true");
        if (tag) form.append("tag", tag);
        if (catalogItemId) form.append("catalogItemId", catalogItemId);
        // Full-resolution originals — deliberately no client-side downscale, because
        // packaging labels are the point.
        for (const file of Array.from(files)) form.append("files", file);

        const response = await fetch(`/api/myco/brand-portal/${token}/upload`, {
          method: "POST",
          body: form,
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json?.error?.message ?? "Upload failed");
        }
        setAssets((previous) => [
          // A brand has one logo and one key visual, so a new one replaces the old
          // rather than queueing behind it to be discarded server-side (gap 2).
          ...(SINGLETON_ASSET_KINDS.includes(kind)
            ? previous.filter((asset) => asset.kind !== kind)
            : previous),
          ...json.data.uploads,
        ]);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
      } finally {
        setUploading(null);
      }
    },
    [token, imageUsageGrant],
  );

  const removeAsset = useCallback((handle: string) => {
    setAssets((previous) => previous.filter((asset) => asset.handle !== handle));
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      // `fields` may carry "" for a box the brand deliberately emptied — the server
      // reads that as an explicit clear, so it must survive serialisation.
      const productPayload = products
        .map((product) => {
          const fields = changedFieldsFor(product.id);
          const isDiscontinued = Boolean(discontinued[product.id]);
          const coaUrl = coaUrls[product.id]?.trim();
          const note = productNotes[product.id]?.trim();
          if (!Object.keys(fields).length && !isDiscontinued && !coaUrl && !note) return null;
          return {
            catalogItemId: product.id,
            ...fields,
            discontinued: isDiscontinued,
            ...(coaUrl ? { coaUrl } : {}),
            ...(note ? { note } : {}),
          };
        })
        .filter(Boolean);

      const response = await fetch(`/api/myco/brand-portal/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: {
            ...contact,
            contactHandle: contact.contactPermission ? contact.contactHandle : "",
            // Declining follow-up must not cost you the receipt.
            receiptEmail: contact.receiptEmail,
          },
          imageUsageGrant,
          brandFields: changedBrandFields,
          products: productPayload,
          missingProducts: missingProducts.filter((entry) => entry.productName.trim()),
          uploadIds: assets.map((asset) => asset.handle),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json?.error?.message ?? "Something went wrong");
      }
      setDone({ acknowledgmentSent: Boolean(json.data.acknowledgmentSent) });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }, [
    products,
    changedFieldsFor,
    discontinued,
    coaUrls,
    productNotes,
    token,
    contact,
    imageUsageGrant,
    changedBrandFields,
    missingProducts,
    assets,
  ]);

  const assetsFor = (kind: string, catalogItemId: string | null) =>
    assets.filter(
      (asset) => asset.kind === kind && (catalogItemId ? asset.catalogItemId === catalogItemId : true),
    );

  if (done) {
    return (
      <main className="bp">
        <style>{portalTheme}</style>
        <style>{PORTAL_CSS}</style>
        <div className="bp-done">
          <p className="portal-eyebrow">Tripdar</p>
          <h1>Thank you — we have it.</h1>
          <p className="bp-done-body">
            Your details for <strong>{brand.name}</strong> are with our team. A person reviews every
            change before it goes live, and we&apos;ll come back to you if anything needs a second
            look.
          </p>
          <p className="bp-done-body">
            {done.acknowledgmentSent
              ? "We've emailed you a copy of exactly what you sent, with a link back here."
              : "Your link stays open — come back any time to add more or change something."}
          </p>
          <button className="portal-button" onClick={() => window.location.reload()}>
            Add something else
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="bp">
      <style>{portalTheme}</style>
      <style>{PORTAL_CSS}</style>

      {/* ---------- Hero ---------- */}
      <header className="bp-hero">
        <div className="bp-hero-inner">
          <p className="portal-eyebrow">Tripdar · Brand portal</p>
          {brand.logoUrl ? (
            // Rendered as an image, never inlined — uploaded SVG is untrusted by default.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="bp-hero-logo" src={brand.logoUrl} alt={`${brand.name} logo`} />
          ) : null}
          <h1 className="bp-hero-title">{brand.name}</h1>
          <p className="bp-hero-sub">
            This is how your products appear to customers on Tripdar today. Anything wrong or
            missing, fix it right here — no account, no password.
          </p>
          <div className="bp-hero-rule" />
          <div className="bp-hero-meta">
            <span>
              {products.length} product{products.length === 1 ? "" : "s"} on file
            </span>
            {lastSubmissionAt ? (
              <span>Last update {new Date(lastSubmissionAt).toLocaleDateString()}</span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="bp-body">
        {/* ---------- Products ---------- */}
        <section className="bp-section">
          <p className="portal-eyebrow">Your products</p>
          <h2 className="bp-h2">What we have on you</h2>
          <p className="bp-lede">
            Tap any product to correct a field or add photos. We&apos;ve highlighted the gaps —
            those are the ones customers notice.
          </p>

          <div className="bp-products">
            {products.map((product) => {
              const isOpen = openProduct === product.id;
              const edits = changedFieldsFor(product.id);
              const editCount =
                Object.keys(edits).length +
                (discontinued[product.id] ? 1 : 0) +
                assetsFor("product_photo", product.id).length;
              const primaryPhoto = product.photos[0];

              return (
                <article key={product.id} className={`bp-card ${isOpen ? "is-open" : ""}`}>
                  <button
                    className="bp-card-head"
                    onClick={() => setOpenProduct(isOpen ? null : product.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="bp-card-thumb">
                      {primaryPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={primaryPhoto.url} alt={product.productName} />
                      ) : (
                        <span className="bp-card-thumb-empty">No photo</span>
                      )}
                    </div>
                    <div className="bp-card-summary">
                      <h3>{product.productName}</h3>
                      <p className="bp-card-spec">
                        {[
                          product.format,
                          product.productUnitMg ? `${product.productUnitMg} mg / unit` : null,
                          product.unitsPerPack ? `${product.unitsPerPack} per pack` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {product.missingFields.length ? (
                        <p className="bp-gaps">
                          Missing: {product.missingFields.join(", ")}
                        </p>
                      ) : (
                        <p className="bp-complete">Complete</p>
                      )}
                      {editCount ? (
                        <p className="bp-edited">
                          {editCount} change{editCount === 1 ? "" : "s"} ready
                        </p>
                      ) : null}
                    </div>
                    <span className="bp-chevron" aria-hidden>
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="bp-card-body">
                      <div className="bp-grid">
                        {PRODUCT_FIELDS.map((field) => {
                          const currentValue = toInputValue(product[field.key]);
                          const value = productEdits[product.id]?.[field.key] ?? currentValue;
                          const isChanged = value !== currentValue;
                          const isEmpty = !currentValue;
                          return (
                            <label
                              key={String(field.key)}
                              className={`bp-field ${field.type === "textarea" ? "is-wide" : ""} ${
                                isChanged ? "is-changed" : ""
                              }`}
                            >
                              <span className="bp-label">
                                {field.label}
                                {isEmpty ? <em className="bp-blank">blank</em> : null}
                              </span>
                              {field.type === "textarea" ? (
                                <textarea
                                  rows={3}
                                  value={value}
                                  placeholder={field.hint}
                                  onChange={(event) =>
                                    setProductField(product.id, String(field.key), event.target.value)
                                  }
                                />
                              ) : field.type === "format" ? (
                                <select
                                  value={value}
                                  onChange={(event) =>
                                    setProductField(product.id, String(field.key), event.target.value)
                                  }
                                >
                                  {FORMATS.map((format) => (
                                    <option key={format} value={format}>
                                      {format}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={field.type === "number" ? "number" : "text"}
                                  inputMode={field.type === "number" ? "numeric" : undefined}
                                  value={value}
                                  placeholder={field.hint}
                                  onChange={(event) =>
                                    setProductField(product.id, String(field.key), event.target.value)
                                  }
                                />
                              )}
                              {/* The hint doubles as the placeholder, so only show
                                  the standalone line once the box is filled. */}
                              {field.hint && field.type !== "textarea" && value ? (
                                <span className="bp-hint">{field.hint}</span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>

                      {/* Photos */}
                      <div className="bp-subsection">
                        <p className="bp-sub-title">Photos</p>
                        <p className="bp-sub-blurb">
                          Upload at full resolution — we don&apos;t compress them. Packaging shots
                          matter most: the label is how we confirm dosing.
                        </p>

                        {product.photos.length ? (
                          <div className="bp-photostrip">
                            {product.photos.map((photo) => (
                              <figure key={photo.id} className="bp-photo">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={photo.url} alt={photo.tag} />
                                <figcaption>
                                  {photo.tag.replace(/_/g, " ")}
                                  {photo.status === "pending" ? " · in review" : ""}
                                </figcaption>
                              </figure>
                            ))}
                          </div>
                        ) : null}

                        <ImageGrantGate granted={imageUsageGrant} onGrant={setImageUsageGrant} />

                        <div className="bp-uploads">
                          {PHOTO_TAGS.map((tag) => (
                            <UploadTile
                              key={tag.value}
                              label={tag.label}
                              blurb={tag.blurb}
                              busy={uploading === `product_photo:${product.id}:${tag.value}`}
                              disabled={!imageUsageGrant}
                              onFiles={(files) => upload(files, "product_photo", tag.value, product.id)}
                            />
                          ))}
                        </div>

                        {assetsFor("product_photo", product.id).length ? (
                          <div className="bp-pending">
                            {assetsFor("product_photo", product.id).map((asset) => (
                              <div key={asset.handle} className="bp-pending-item">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={asset.previewUrl} alt={asset.originalFilename} />
                                <button onClick={() => removeAsset(asset.handle)} aria-label="Remove">
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="bp-grid">
                        <label className="bp-field is-wide">
                          <span className="bp-label">COA / lab test link</span>
                          <input
                            type="url"
                            placeholder="https://…"
                            value={coaUrls[product.id] ?? ""}
                            onChange={(event) =>
                              setCoaUrls((prev) => ({ ...prev, [product.id]: event.target.value }))
                            }
                          />
                        </label>
                        <label className="bp-field is-wide">
                          <span className="bp-label">Anything else about this product</span>
                          <textarea
                            rows={2}
                            value={productNotes[product.id] ?? ""}
                            onChange={(event) =>
                              setProductNotes((prev) => ({ ...prev, [product.id]: event.target.value }))
                            }
                          />
                        </label>
                      </div>

                      <label className="bp-check bp-check-warn">
                        <input
                          type="checkbox"
                          checked={Boolean(discontinued[product.id])}
                          onChange={(event) =>
                            setDiscontinued((prev) => ({ ...prev, [product.id]: event.target.checked }))
                          }
                        />
                        <span>
                          We no longer make this product
                          <em>Tell us and we&apos;ll stop showing it as current.</em>
                        </span>
                      </label>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          {/* Missing products */}
          <div className="bp-missing">
            <p className="bp-sub-title">Are we missing anything?</p>
            <p className="bp-sub-blurb">
              If you make something that isn&apos;t listed above, add it here.
            </p>
            {missingProducts.map((entry, index) => (
              <div key={index} className="bp-missing-row">
                <input
                  placeholder="Product name"
                  value={entry.productName}
                  onChange={(event) =>
                    setMissingProducts((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, productName: event.target.value } : item,
                      ),
                    )
                  }
                />
                <select
                  value={entry.format}
                  onChange={(event) =>
                    setMissingProducts((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, format: event.target.value } : item,
                      ),
                    )
                  }
                >
                  {FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="mg / unit"
                  inputMode="numeric"
                  value={entry.productUnitMg}
                  onChange={(event) =>
                    setMissingProducts((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, productUnitMg: event.target.value } : item,
                      ),
                    )
                  }
                />
                <button
                  className="bp-ghost"
                  onClick={() =>
                    setMissingProducts((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="bp-ghost"
              onClick={() =>
                setMissingProducts((prev) => [
                  ...prev,
                  { productName: "", format: "capsule", productUnitMg: "", note: "" },
                ])
              }
            >
              + Add a product
            </button>
          </div>
        </section>

        {/* ---------- Brand ---------- */}
        <section className="bp-section">
          <p className="portal-eyebrow">Your brand</p>
          <h2 className="bp-h2">How you present</h2>
          <p className="bp-lede">
            Official artwork beats anything we can find ourselves. Send us the real thing.
          </p>

          <ImageGrantGate granted={imageUsageGrant} onGrant={setImageUsageGrant} />

          <div className="bp-uploads bp-uploads-brand">
            <UploadTile
              label="Brand logo"
              blurb="SVG or high-res PNG · one file"
              busy={uploading === "brand_logo:brand:"}
              disabled={!imageUsageGrant}
              multiple={false}
              onFiles={(files) => upload(files, "brand_logo", null, null)}
              accept="image/svg+xml,image/png,image/jpeg,image/webp"
            />
            <UploadTile
              label="Brand artwork"
              blurb="Key visual or pattern · one file"
              busy={uploading === "brand_artwork:brand:"}
              disabled={!imageUsageGrant}
              multiple={false}
              onFiles={(files) => upload(files, "brand_artwork", null, null)}
              accept="image/svg+xml,image/png,image/jpeg,image/webp"
            />
          </div>

          {assets.filter((asset) => asset.kind !== "product_photo").length ? (
            <div className="bp-pending">
              {assets
                .filter((asset) => asset.kind !== "product_photo")
                .map((asset) => (
                  <div key={asset.handle} className="bp-pending-item">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.previewUrl} alt={asset.originalFilename} />
                    <button onClick={() => removeAsset(asset.handle)} aria-label="Remove">
                      ×
                    </button>
                  </div>
                ))}
            </div>
          ) : null}

          <div className="bp-grid">
            <label className="bp-field is-wide">
              <span className="bp-label">About the brand</span>
              <textarea
                rows={3}
                placeholder="A couple of sentences customers should know."
                value={brandFields.shortDescription}
                onChange={(event) =>
                  setBrandFields((prev) => ({ ...prev, shortDescription: event.target.value }))
                }
              />
            </label>
            <label className="bp-field">
              <span className="bp-label">Website</span>
              <input
                type="url"
                placeholder="https://…"
                value={brandFields.websiteUrl}
                onChange={(event) =>
                  setBrandFields((prev) => ({ ...prev, websiteUrl: event.target.value }))
                }
              />
            </label>
            <label className="bp-field">
              <span className="bp-label">Customer support email</span>
              <input
                type="email"
                placeholder="hello@…"
                value={brandFields.supportEmail}
                onChange={(event) =>
                  setBrandFields((prev) => ({ ...prev, supportEmail: event.target.value }))
                }
              />
            </label>
            {(["instagram", "x", "tiktok", "linkedin"] as const).map((network) => (
              <label key={network} className="bp-field">
                <span className="bp-label">{network === "x" ? "X / Twitter" : network}</span>
                <input
                  placeholder="@handle"
                  value={brandFields[network]}
                  onChange={(event) =>
                    setBrandFields((prev) => ({ ...prev, [network]: event.target.value }))
                  }
                />
              </label>
            ))}
            {(["primaryColor", "secondaryColor", "accentColor"] as const).map((slot) => (
              <label key={slot} className="bp-field bp-field-color">
                <span className="bp-label">
                  {slot.replace("Color", "")} colour
                </span>
                <div className="bp-color-row">
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(brandFields[slot]) ? brandFields[slot] : "#d4a574"}
                    onChange={(event) =>
                      setBrandFields((prev) => ({ ...prev, [slot]: event.target.value }))
                    }
                  />
                  <input
                    placeholder="#000000"
                    value={brandFields[slot]}
                    onChange={(event) =>
                      setBrandFields((prev) => ({ ...prev, [slot]: event.target.value }))
                    }
                  />
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* ---------- Consent + contact ---------- */}
        <section className="bp-section">
          <p className="portal-eyebrow">Before you send</p>
          <h2 className="bp-h2">Permissions and who you are</h2>

          <label className="bp-check bp-check-grant">
            <input
              type="checkbox"
              checked={imageUsageGrant}
              onChange={(event) => setImageUsageGrant(event.target.checked)}
              // Unticking with files already attached would strand them: the server
              // rejects a submission carrying images without the grant, so remove
              // the images first.
              disabled={imageUsageGrant && assets.length > 0}
            />
            <span>
              I grant Tripdar permission to display the images I&apos;ve uploaded publicly.
              <em>
                {imageUsageGrant && assets.length > 0
                  ? "Remove the attached images first if you want to withdraw this."
                  : "We show these to customers. We record your name and the time with this permission."}
              </em>
            </span>
          </label>

          <div className="bp-grid">
            <label className="bp-field">
              <span className="bp-label">Your name *</span>
              <input
                value={contact.submitterName}
                onChange={(event) =>
                  setContact((prev) => ({ ...prev, submitterName: event.target.value }))
                }
              />
            </label>
            <label className="bp-field">
              <span className="bp-label">Your role *</span>
              <input
                placeholder="Founder, ops, marketing…"
                value={contact.submitterRole}
                onChange={(event) =>
                  setContact((prev) => ({ ...prev, submitterRole: event.target.value }))
                }
              />
            </label>
          </div>

          <label className="bp-check">
            <input
              type="checkbox"
              checked={contact.contactPermission}
              onChange={(event) =>
                setContact((prev) => ({ ...prev, contactPermission: event.target.checked }))
              }
            />
            <span>
              You can contact me with follow-up questions
              <em>Usually a one-line clarification about dosing, not a mailing list.</em>
            </span>
          </label>

          {contact.contactPermission ? (
            <div className="bp-grid">
              <label className="bp-field">
                <span className="bp-label">Best way to reach you</span>
                <select
                  value={contact.preferredContactMethod}
                  onChange={(event) =>
                    setContact((prev) => ({ ...prev, preferredContactMethod: event.target.value }))
                  }
                >
                  <option value="email">Email</option>
                  <option value="signal">Signal</option>
                  <option value="telegram">Telegram</option>
                </select>
              </label>
              <label className="bp-field">
                <span className="bp-label">
                  {contact.preferredContactMethod === "email"
                    ? "Email address *"
                    : contact.preferredContactMethod === "signal"
                      ? "Signal number *"
                      : "Telegram username *"}
                </span>
                <input
                  value={contact.contactHandle}
                  placeholder={
                    contact.preferredContactMethod === "email"
                      ? "you@brand.com"
                      : contact.preferredContactMethod === "signal"
                        ? "+1 555 000 1234"
                        : "@username"
                  }
                  onChange={(event) =>
                    setContact((prev) => ({ ...prev, contactHandle: event.target.value }))
                  }
                />
                <span className="bp-hint">
                  We need the actual address — the method alone isn&apos;t enough to reach you.
                </span>
              </label>
            </div>
          ) : null}

          <div className="bp-grid">
            <label className="bp-field is-wide">
              <span className="bp-label">Email my receipt to</span>
              <input
                type="email"
                placeholder="you@brand.com"
                value={contact.receiptEmail}
                onChange={(event) =>
                  setContact((prev) => ({ ...prev, receiptEmail: event.target.value }))
                }
              />
              <span className="bp-hint">
                Optional. We&apos;ll send a copy of exactly what you sent us — every field, every
                filename. This is a receipt, not follow-up: you get it even if you said no above.
                {contact.contactPermission && contact.preferredContactMethod === "email"
                  ? " Leave it blank and we'll use the email address above."
                  : ""}
              </span>
            </label>
          </div>
        </section>

        {error ? <p className="bp-error">{error}</p> : null}

        <div className="bp-footer">
          <p className="bp-footer-note">
            Nothing you send changes your listing straight away — a person reviews every change.
            Your products stay visible either way.
          </p>
        </div>
      </div>

      {/* ---------- Sticky submit ---------- */}
      <div className="bp-bar">
        <div className="bp-bar-inner">
          <span className="bp-bar-count">
            {changeCount ? `${changeCount} change${changeCount === 1 ? "" : "s"} ready` : "No changes yet"}
          </span>
          <button
            className="portal-button"
            disabled={submitting || !changeCount}
            onClick={submit}
          >
            {submitting ? "Sending…" : "Send to Tripdar"}
          </button>
        </div>
      </div>
    </main>
  );
}

/**
 * The image-usage grant, rendered wherever uploading is possible rather than only
 * at the bottom of the form. Publishing brand artwork rests entirely on this
 * permission, so the server refuses uploads without it — which means the submitter
 * has to be able to give it at the moment they reach for a file (KEWL-2390 gap 3).
 * It is one piece of state; ticking it here ticks it everywhere.
 */
function ImageGrantGate({
  granted,
  onGrant,
}: {
  granted: boolean;
  onGrant: (granted: boolean) => void;
}) {
  if (granted) {
    return (
      <p className="bp-grant-ok">Image display permission granted — uploads are open.</p>
    );
  }
  return (
    <label className="bp-check bp-check-grant bp-grant-gate">
      <input type="checkbox" checked={false} onChange={(event) => onGrant(event.target.checked)} />
      <span>
        I grant Tripdar permission to display these images publicly.
        <em>Required before uploading. We record your name and the time with this permission.</em>
      </span>
    </label>
  );
}

function UploadTile({
  label,
  blurb,
  busy,
  disabled = false,
  multiple = true,
  onFiles,
  accept = "image/jpeg,image/png,image/webp,image/heic,image/heif",
}: {
  label: string;
  blurb: string;
  busy: boolean;
  disabled?: boolean;
  /** False for the one-per-brand slots, so the picker can't offer what we'd discard. */
  multiple?: boolean;
  onFiles: (files: FileList | null) => void;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <button
      className={`bp-tile ${busy ? "is-busy" : ""} ${disabled ? "is-disabled" : ""}`}
      disabled={disabled || busy}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <span className="bp-tile-plus" aria-hidden>
        {busy ? "…" : "+"}
      </span>
      <span className="bp-tile-label">{label}</span>
      <span className="bp-tile-blurb">{blurb}</span>
    </button>
  );
}

const PORTAL_CSS = `
  .bp {
    min-height: 100dvh;
    background: radial-gradient(ellipse at 50% 0%, #1a1210 0%, #0d0a08 55%, #050303 100%);
    color: var(--portal-cream);
    font-family: var(--portal-serif);
    padding-bottom: 120px;
  }

  /* Hero */
  .bp-hero { padding: 56px 22px 40px; text-align: center; position: relative; overflow: hidden; }
  .bp-hero::before {
    content: ''; position: absolute; top: -20%; left: 50%; transform: translateX(-50%);
    width: 620px; height: 620px; pointer-events: none;
    background: radial-gradient(circle, rgba(212,165,116,0.07) 0%, transparent 70%);
  }
  .bp-hero-inner { position: relative; max-width: 44rem; margin: 0 auto; }
  .bp-hero-logo {
    max-height: 64px; max-width: 200px; object-fit: contain;
    margin: 0 auto 20px; display: block;
  }
  .bp-hero-title {
    font-size: clamp(38px, 11vw, 62px); font-weight: 300; letter-spacing: 1px;
    margin: 0 0 16px; line-height: 1.05; color: var(--portal-cream);
  }
  .bp-hero-sub {
    font-size: 17px; line-height: 1.65; color: var(--portal-soft);
    margin: 0 auto; max-width: 30rem; font-weight: 300;
  }
  .bp-hero-rule {
    width: 64px; height: 1px; margin: 32px auto 20px;
    background: linear-gradient(90deg, transparent, var(--portal-gold), transparent);
  }
  .bp-hero-meta {
    display: flex; gap: 18px; justify-content: center; flex-wrap: wrap;
    font-family: var(--portal-sans); font-size: 11px; letter-spacing: 1.5px;
    text-transform: uppercase; color: var(--portal-faint);
  }

  .bp-body { max-width: 46rem; margin: 0 auto; padding: 0 18px; }

  .bp-section { margin: 0 0 64px; }
  .bp-h2 {
    font-size: 30px; font-weight: 400; letter-spacing: 0.4px;
    margin: 0 0 10px; color: var(--portal-cream);
  }
  .bp-lede {
    font-size: 16px; line-height: 1.65; color: var(--portal-soft);
    margin: 0 0 26px; font-weight: 300; max-width: 34rem;
  }

  /* Product cards */
  .bp-products { display: flex; flex-direction: column; gap: 12px; }
  .bp-card {
    background: var(--portal-panel);
    border: 1px solid var(--portal-line-soft);
    border-radius: 4px; overflow: hidden;
    transition: border-color 0.25s ease, background 0.25s ease;
  }
  .bp-card.is-open { border-color: var(--portal-line); background: rgba(255,248,240,0.04); }
  .bp-card-head {
    width: 100%; display: flex; gap: 14px; align-items: center;
    padding: 14px; background: none; border: none; cursor: pointer; text-align: left;
    font-family: inherit; color: inherit;
  }
  .bp-card-thumb {
    width: 66px; height: 66px; flex-shrink: 0; border-radius: 3px; overflow: hidden;
    background: rgba(255,248,240,0.04); display: flex; align-items: center; justify-content: center;
  }
  .bp-card-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .bp-card-thumb-empty {
    font-family: var(--portal-sans); font-size: 9px; letter-spacing: 1px;
    text-transform: uppercase; color: var(--portal-faint);
  }
  .bp-card-summary { flex: 1; min-width: 0; }
  .bp-card-summary h3 {
    font-size: 20px; font-weight: 400; margin: 0 0 3px; color: var(--portal-cream);
    line-height: 1.25;
  }
  .bp-card-spec {
    font-family: var(--portal-sans); font-size: 11px; letter-spacing: 0.6px;
    color: var(--portal-muted); margin: 0 0 5px; text-transform: capitalize;
  }
  .bp-gaps, .bp-complete, .bp-edited {
    font-family: var(--portal-sans); font-size: 10.5px; letter-spacing: 0.5px; margin: 0;
  }
  .bp-gaps { color: #c98b4b; }
  .bp-complete { color: #6f8a5f; }
  .bp-edited { color: var(--portal-gold); margin-top: 3px; }
  .bp-chevron {
    font-size: 24px; color: var(--portal-muted); font-weight: 300;
    width: 26px; text-align: center; flex-shrink: 0;
  }
  .bp-card-body { padding: 4px 14px 20px; border-top: 1px solid var(--portal-line-soft); }

  /* Fields */
  .bp-grid {
    display: grid; grid-template-columns: 1fr; gap: 14px; margin: 18px 0;
  }
  @media (min-width: 620px) { .bp-grid { grid-template-columns: 1fr 1fr; } }
  .bp-field { display: flex; flex-direction: column; gap: 6px; }
  .bp-field.is-wide { grid-column: 1 / -1; }
  .bp-label {
    font-family: var(--portal-sans); font-size: 10px; letter-spacing: 1.6px;
    text-transform: uppercase; color: var(--portal-muted);
    display: flex; align-items: center; gap: 7px;
  }
  .bp-blank {
    font-style: normal; font-size: 8.5px; letter-spacing: 1px;
    color: #c98b4b; border: 1px solid rgba(201,139,75,0.35);
    padding: 1px 5px; border-radius: 2px;
  }
  .bp-field input, .bp-field textarea, .bp-field select,
  .bp-missing-row input, .bp-missing-row select {
    width: 100%; background: rgba(0,0,0,0.28);
    border: 1px solid var(--portal-line-soft); border-radius: 3px;
    padding: 11px 12px; color: var(--portal-cream);
    font-family: var(--portal-serif); font-size: 16px; /* 16px avoids iOS zoom-on-focus */
    transition: border-color 0.2s ease;
  }
  .bp-field textarea { resize: vertical; line-height: 1.55; }
  .bp-field input:focus, .bp-field textarea:focus, .bp-field select:focus {
    outline: none; border-color: var(--portal-gold);
  }
  .bp-field.is-changed input, .bp-field.is-changed textarea, .bp-field.is-changed select {
    border-color: var(--portal-gold); background: rgba(212,165,116,0.07);
  }
  .bp-hint {
    font-family: var(--portal-sans); font-size: 10.5px; color: var(--portal-faint);
    line-height: 1.45;
  }
  .bp-field-color .bp-color-row { display: flex; gap: 8px; align-items: center; }
  .bp-field-color input[type="color"] {
    width: 44px; height: 42px; padding: 2px; flex-shrink: 0; cursor: pointer;
  }

  /* Sub-sections */
  .bp-subsection { margin: 24px 0 8px; }
  .bp-sub-title {
    font-family: var(--portal-sans); font-size: 10px; letter-spacing: 2.2px;
    text-transform: uppercase; color: var(--portal-gold); margin: 0 0 6px;
  }
  .bp-sub-blurb {
    font-size: 14.5px; line-height: 1.6; color: var(--portal-soft);
    margin: 0 0 14px; font-weight: 300;
  }

  /* Photos */
  .bp-photostrip, .bp-pending {
    display: flex; gap: 9px; overflow-x: auto; padding: 2px 0 10px;
    -webkit-overflow-scrolling: touch;
  }
  .bp-photo { margin: 0; flex-shrink: 0; width: 92px; }
  .bp-photo img {
    width: 92px; height: 92px; object-fit: cover; border-radius: 3px;
    border: 1px solid var(--portal-line-soft); display: block;
  }
  .bp-photo figcaption {
    font-family: var(--portal-sans); font-size: 9px; letter-spacing: 0.5px;
    color: var(--portal-faint); margin-top: 5px; text-transform: capitalize;
    line-height: 1.3;
  }
  .bp-uploads {
    display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 4px;
  }
  .bp-uploads-brand { max-width: 26rem; }
  .bp-tile {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 3px; padding: 16px 10px; cursor: pointer;
    background: rgba(0,0,0,0.22); border: 1px dashed var(--portal-line);
    border-radius: 3px; color: var(--portal-cream); font-family: inherit;
    transition: border-color 0.2s ease, background 0.2s ease;
    min-height: 92px; text-align: center;
  }
  .bp-tile:hover { border-color: var(--portal-gold); background: rgba(212,165,116,0.06); }
  .bp-tile.is-busy { opacity: 0.55; }
  .bp-tile.is-disabled { opacity: 0.4; cursor: not-allowed; }
  .bp-tile.is-disabled:hover { border-color: var(--portal-line); background: rgba(0,0,0,0.22); }
  .bp-tile-plus { font-size: 20px; color: var(--portal-gold); line-height: 1; }
  .bp-tile-label {
    font-family: var(--portal-sans); font-size: 10.5px; letter-spacing: 0.8px;
    color: var(--portal-cream);
  }
  .bp-tile-blurb {
    font-family: var(--portal-sans); font-size: 9px; color: var(--portal-faint);
    line-height: 1.35;
  }
  .bp-pending-item { position: relative; flex-shrink: 0; }
  .bp-pending-item img {
    width: 76px; height: 76px; object-fit: cover; border-radius: 3px;
    border: 1px solid var(--portal-gold); display: block;
  }
  .bp-pending-item button {
    position: absolute; top: -6px; right: -6px; width: 21px; height: 21px;
    border-radius: 50%; border: none; background: var(--portal-gold);
    color: var(--portal-ink); font-size: 14px; line-height: 1; cursor: pointer;
  }

  /* Checkboxes */
  .bp-check {
    display: flex; gap: 11px; align-items: flex-start; margin: 16px 0;
    padding: 14px; border: 1px solid var(--portal-line-soft); border-radius: 3px;
    background: rgba(0,0,0,0.2); cursor: pointer;
  }
  .bp-check input { margin-top: 3px; width: 17px; height: 17px; flex-shrink: 0; accent-color: var(--portal-gold); }
  .bp-check span { font-size: 15.5px; line-height: 1.55; color: var(--portal-cream); font-weight: 300; }
  .bp-check em {
    display: block; font-style: normal; font-family: var(--portal-sans);
    font-size: 11px; color: var(--portal-faint); margin-top: 4px; line-height: 1.5;
  }
  .bp-check-grant { border-color: var(--portal-line); background: rgba(212,165,116,0.05); }
  .bp-check-warn span { color: var(--portal-soft); }
  .bp-grant-gate { margin: 0 0 14px; border-color: var(--portal-gold); }
  .bp-grant-ok {
    margin: 0 0 14px; font-family: var(--portal-sans); font-size: 11px;
    letter-spacing: 0.6px; color: var(--portal-soft);
  }

  /* Missing products */
  .bp-missing {
    margin-top: 28px; padding: 20px 16px;
    border: 1px solid var(--portal-line-soft); border-radius: 4px;
    background: rgba(0,0,0,0.18);
  }
  .bp-missing-row {
    display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 12px;
  }
  @media (min-width: 620px) {
    .bp-missing-row { grid-template-columns: 2fr 1fr 1fr auto; align-items: center; }
  }
  .bp-ghost {
    background: none; border: 1px solid var(--portal-line);
    color: var(--portal-gold); padding: 9px 15px; border-radius: 3px;
    font-family: var(--portal-sans); font-size: 11px; letter-spacing: 1.2px;
    cursor: pointer; transition: background 0.2s ease;
  }
  .bp-ghost:hover { background: rgba(212,165,116,0.09); }

  .bp-error {
    background: rgba(180,70,50,0.14); border: 1px solid rgba(200,90,70,0.4);
    color: #e8a894; padding: 13px 15px; border-radius: 3px;
    font-size: 15px; margin: 0 0 18px;
  }

  .bp-footer { padding: 0 0 20px; }
  .bp-footer-note {
    font-size: 14px; line-height: 1.65; color: var(--portal-faint);
    margin: 0; font-weight: 300;
  }

  /* Sticky submit bar */
  .bp-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: rgba(8,5,4,0.94); backdrop-filter: blur(12px);
    border-top: 1px solid var(--portal-line-soft); z-index: 20;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .bp-bar-inner {
    max-width: 46rem; margin: 0 auto; padding: 13px 18px;
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
  }
  .bp-bar-count {
    font-family: var(--portal-sans); font-size: 11px; letter-spacing: 1.3px;
    text-transform: uppercase; color: var(--portal-muted);
  }

  /* Done */
  .bp-done {
    min-height: 100dvh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
    padding: 40px 24px; max-width: 34rem; margin: 0 auto;
  }
  .bp-done h1 {
    font-size: clamp(30px, 8vw, 42px); font-weight: 300;
    margin: 0 0 20px; color: var(--portal-cream); letter-spacing: 0.5px;
  }
  .bp-done-body {
    font-size: 16.5px; line-height: 1.7; color: var(--portal-soft);
    margin: 0 0 18px; font-weight: 300;
  }
  .bp-done-body strong { color: var(--portal-cream); font-weight: 400; }
`;
