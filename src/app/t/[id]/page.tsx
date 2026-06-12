import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import TesterVoteForm from "./TesterVoteForm";

export const dynamic = "force-dynamic";

type BrandDoseTier = {
  id?: string;
  category?: string;
  label: string;
  quantityText: string;
  quantityMin?: number;
  quantityMax?: number | null;
  unit: string;
};

function unitForFormat(format: string): string {
  if (format === "capsule") return "capsule";
  if (format === "edible") return "gummy";
  if (format === "tincture") return "dropper";
  return "unit";
}

function readBrandDoseTiers(product: {
  brandDoseTiers: unknown;
  brandMicroUnits: number | null;
  brandMiniUnits: number | null;
  brandMacroUnits: number | null;
  format: string;
}): BrandDoseTier[] {
  if (Array.isArray(product.brandDoseTiers)) {
    return product.brandDoseTiers.filter((tier): tier is BrandDoseTier => {
      return Boolean(
        tier &&
          typeof tier === "object" &&
          "label" in tier &&
          "quantityText" in tier &&
          "unit" in tier
      );
    });
  }

  const unit = unitForFormat(product.format);
  return [
    product.brandMicroUnits
      ? { label: "Microdose", quantityText: String(product.brandMicroUnits), unit }
      : null,
    product.brandMiniUnits
      ? { label: "Mini-dose", quantityText: String(product.brandMiniUnits), unit }
      : null,
    product.brandMacroUnits
      ? { label: "Macro Dose", quantityText: String(product.brandMacroUnits), unit }
      : null,
  ].filter((tier): tier is BrandDoseTier => Boolean(tier));
}

function formatBrandDoseTier(tier: BrandDoseTier): string {
  return `${tier.quantityText}${tier.unit ? ` ${tier.unit}` : ""} = ${tier.label}`;
}

export default async function TesterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const product = await prisma.storeProductCatalog.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { sortOrder: "asc" }, take: 1 },
      brandRef: true,
      partner: { select: { name: true } },
    },
  });

  if (!product || !product.active) notFound();

  const photoUrl = product.photos[0]?.url || product.photoUrl || null;
  const brandName = product.brandRef?.name || product.brand || null;
  const brandDoseTiers = readBrandDoseTiers(product);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #faf5ff 0%, #fdf2f8 100%)",
      padding: "1.5rem 1rem 3rem",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#1a1a1a",
    }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c3aed", fontWeight: 600 }}>
            🍄 Tripdar Tester
          </div>
          <div style={{ fontSize: "0.85rem", color: "#666", marginTop: 4 }}>
            {product.partner.name}
          </div>
        </div>

        <div style={{
          background: "white",
          borderRadius: 16,
          padding: "1.25rem",
          boxShadow: "0 4px 20px rgba(124,58,237,0.08)",
          marginBottom: "1rem",
        }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {photoUrl ? (
              <img src={photoUrl} alt={product.productName} style={{
                width: 72, height: 72, borderRadius: 12, objectFit: "cover", flexShrink: 0,
              }} />
            ) : (
              <div style={{
                width: 72, height: 72, borderRadius: 12, background: "#f3e8ff",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0,
              }}>🍄</div>
            )}
            <div style={{ minWidth: 0 }}>
              {brandName && (
                <div style={{ fontSize: "0.75rem", color: "#7c3aed", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {brandName}
                </div>
              )}
              <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: 2 }}>
                {product.productName}
              </div>
              {product.productUnitMg && (
                <div style={{ fontSize: "0.8rem", color: "#666", marginTop: 2 }}>
                  {product.productUnitMg}mg per unit
                </div>
              )}
            </div>
          </div>
        </div>

        {(brandDoseTiers.length > 0 || product.brandDoseInstructions) && (
          <div style={{
            background: "white",
            borderRadius: 16,
            padding: "1.25rem",
            boxShadow: "0 4px 20px rgba(124,58,237,0.08)",
            marginBottom: "1rem",
          }}>
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0" }}>Brand dose guidance</h2>
            {brandDoseTiers.length > 0 && (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {brandDoseTiers.map((tier, index) => (
                  <div
                    key={tier.id || `${tier.label}-${index}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      fontSize: "0.85rem",
                      paddingBottom: "0.5rem",
                      borderBottom: index === brandDoseTiers.length - 1 ? "none" : "1px solid #f3e8ff",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{tier.label}</span>
                    <span style={{ color: "#666", textAlign: "right" }}>
                      {formatBrandDoseTier(tier).split(" = ")[0]}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {product.brandDoseInstructions && (
              <p style={{ fontSize: "0.85rem", color: "#666", lineHeight: 1.5, margin: brandDoseTiers.length > 0 ? "0.85rem 0 0" : 0 }}>
                {product.brandDoseInstructions}
              </p>
            )}
          </div>
        )}

        <div style={{ background: "white", borderRadius: 16, padding: "1.25rem", boxShadow: "0 4px 20px rgba(124,58,237,0.08)" }}>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.5rem 0" }}>How was your experience?</h2>
          <p style={{ fontSize: "0.85rem", color: "#666", margin: "0 0 1.25rem 0", lineHeight: 1.5 }}>
            Your feedback helps shape recommendations for future shoppers. Takes about 60 seconds.
          </p>
          <TesterVoteForm catalogItemId={product.id} flavors={product.flavors} />
        </div>
      </div>
    </div>
  );
}
