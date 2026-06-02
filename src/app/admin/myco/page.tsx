"use client";

import type { ChangeEvent, CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

type StrengthOffset = "standard" | "stronger" | "lighter";
type ProductFilter = "all" | "active" | "inactive";
type SortKey = "productName" | "format" | "brand" | "active" | "updatedAt";
type PhotoTag = "stock" | "package_front" | "package_back" | "lifestyle" | "other";
type UserRole = "super_admin" | "partner_admin";
type DoseUnit = "mg" | "g";

function toMg(value: string | number, unit: DoseUnit): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === "g" ? Math.round(n * 1000) : Math.round(n);
}

function formatDose(mg: number | null | undefined): string {
  if (!mg || mg <= 0) return "—";
  if (mg >= 1000) {
    const g = mg / 1000;
    return `${g % 1 === 0 ? g.toFixed(0) : g.toFixed(g % 0.1 === 0 ? 1 : 2)} g`;
  }
  return `${mg} mg`;
}

const PHOTO_TAGS: PhotoTag[] = ["stock", "package_front", "package_back", "lifestyle", "other"];

const VIBE_DIMENSIONS: { key: VibeKey; label: string }[] = [
  { key: "clarity_cognition", label: "Mind: Scattered ↔ Focused" },
  { key: "mood_social", label: "Mood: Inward ↔ Social" },
  { key: "visual_pattern", label: "Visuals: Subtle ↔ Vivid" },
  { key: "somatic", label: "Body: Light ↔ Heavy" },
  { key: "energy_direction", label: "Energy: Calm ↔ Energetic" },
  { key: "depth_direction", label: "Depth: Clear ↔ Dreamy" },
];

type VibeKey =
  | "clarity_cognition"
  | "mood_social"
  | "visual_pattern"
  | "somatic"
  | "energy_direction"
  | "depth_direction";

type VibeScores = Record<VibeKey, number>;

function emptyVibe(): VibeScores {
  return {
    clarity_cognition: 0,
    mood_social: 0,
    visual_pattern: 0,
    somatic: 0,
    energy_direction: 0,
    depth_direction: 0,
  };
}

function readVibe(scores: unknown): VibeScores {
  const base = emptyVibe();
  if (!scores || typeof scores !== "object") return base;
  const src = scores as Record<string, unknown>;
  for (const { key } of VIBE_DIMENSIONS) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) base[key] = Math.max(-1, Math.min(1, v));
  }
  return base;
}

interface Partner {
  id: string;
  name: string;
  subdomain: string | null;
  contactInfo: {
    email?: string;
    phone?: string;
    website?: string;
  } | null;
  mycoWelcomeMessage: string | null;
  active: boolean;
}

interface Brand {
  id: string;
  name: string;
  slug: string;
}

interface StrainOption {
  id: string;
  slug: string;
  name: string;
}

interface ProductPhoto {
  id: string;
  url: string;
  tag: PhotoTag;
  sortOrder: number;
}

interface Product {
  id: string;
  productName: string;
  format: string;
  brand: string | null;
  brandId: string | null;
  brandRef: Brand | null;
  strainSlug: string | null;
  productUnitMg: number | null;
  unitsPerPack: number | null;
  totalDoseMg: number | null;
  photoUrl: string | null;
  photos: ProductPhoto[];
  active: boolean;
  updatedAt: string;
  strengthOffset: {
    offset: StrengthOffset;
    rationale: string | null;
  } | null;
  vibeProfile: {
    scores: Record<string, number>;
  } | null;
}

interface PendingPhoto {
  id: string;
  file: File;
  tag: PhotoTag;
  previewUrl: string;
}

const emptyProduct = {
  productName: "",
  format: "capsule",
  brandId: "",
  strainSlug: "",
  productUnitMg: "",
  productUnitInUnit: "mg" as DoseUnit,
  unitsPerPack: "",
  totalDoseMg: "",
  totalDoseInUnit: "mg" as DoseUnit,
  totalDoseOverride: false,
  strengthOffset: "standard" as StrengthOffset,
  strengthRationale: "",
};

export default function MycoAdminPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [strains, setStrains] = useState<StrainOption[]>([]);
  const [userRole, setUserRole] = useState<UserRole>("partner_admin");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    name: "",
    subdomain: "",
    contactEmail: "",
    contactPhone: "",
    contactWebsite: "",
    mycoWelcomeMessage: "",
  });
  const [newProduct, setNewProduct] = useState(emptyProduct);
  const [newBrandName, setNewBrandName] = useState("");
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [pendingPhotoTag, setPendingPhotoTag] = useState<PhotoTag>("stock");
  const [newVibe, setNewVibe] = useState<VibeScores>(emptyVibe());
  const [newVibeOpen, setNewVibeOpen] = useState(false);
  const [rowDrafts, setRowDrafts] = useState<
    Record<
      string,
      {
        strengthOffset: StrengthOffset;
        strengthRationale: string;
        vibe: VibeScores;
        vibeOpen: boolean;
      }
    >
  >({});

  useEffect(() => {
    loadData();
    loadStrains();
  }, []);

  async function loadStrains() {
    try {
      const res = await fetch("/api/admin/myco/strains");
      const data = await res.json();
      if (data.success) setStrains(data.data.strains);
    } catch {
      // ignore
    }
  }

  async function loadBrands() {
    try {
      const res = await fetch("/api/admin/myco/brands");
      const data = await res.json();
      if (data.success) setBrands(data.data.brands);
    } catch {
      // ignore
    }
  }

  async function loadData(partnerId?: string) {
    setLoading(true);
    setError(null);

    try {
      const url = partnerId ? `/api/admin/myco?partnerId=${partnerId}` : "/api/admin/myco";
      const res = await fetch(url);
      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || "Failed to load Myco admin");
        return;
      }

      const nextPartner = data.data.partner as Partner | null;
      const nextProducts = data.data.products as Product[];
      setPartners(data.data.partners);
      setPartner(nextPartner);
      setProducts(nextProducts);
      setBrands(data.data.brands || []);
      setUserRole(data.data.userRole || "partner_admin");

      if (nextPartner) {
        setSettings({
          name: nextPartner.name || "",
          subdomain: nextPartner.subdomain || "",
          contactEmail: nextPartner.contactInfo?.email || "",
          contactPhone: nextPartner.contactInfo?.phone || "",
          contactWebsite: nextPartner.contactInfo?.website || "",
          mycoWelcomeMessage: nextPartner.mycoWelcomeMessage || "",
        });
      }

      setRowDrafts(
        Object.fromEntries(
          nextProducts.map((product) => [
            product.id,
            {
              strengthOffset: product.strengthOffset?.offset ?? "standard",
              strengthRationale: product.strengthOffset?.rationale ?? "",
              vibe: readVibe(product.vibeProfile?.scores),
              vibeOpen: false,
            },
          ])
        )
      );
    } catch {
      setError("Network error loading Myco admin");
    } finally {
      setLoading(false);
    }
  }

  const isReadOnlySettings = userRole === "partner_admin";

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      if (filter === "active") return product.active;
      if (filter === "inactive") return !product.active;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === "active") return Number(b.active) - Number(a.active);
      if (sortKey === "updatedAt") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sortKey === "brand") {
        const ba = a.brandRef?.name || a.brand || "";
        const bb = b.brandRef?.name || b.brand || "";
        return ba.localeCompare(bb);
      }
      return String((a as unknown as Record<string, unknown>)[sortKey] || "").localeCompare(
        String((b as unknown as Record<string, unknown>)[sortKey] || "")
      );
    });
  }, [filter, products, sortKey]);

  async function saveSettings() {
    if (!partner) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/myco", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: partner.id,
          name: settings.name,
          subdomain: settings.subdomain,
          contactInfo: {
            email: settings.contactEmail,
            phone: settings.contactPhone,
            website: settings.contactWebsite,
          },
          mycoWelcomeMessage: settings.mycoWelcomeMessage,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || "Failed to save settings");
        return;
      }

      setPartner(data.data.partner);
      setMessage("Store settings saved");
    } catch {
      setError("Network error saving settings");
    } finally {
      setSaving(false);
    }
  }

  async function createBrand() {
    const name = newBrandName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/admin/myco/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error?.message || "Failed to create brand");
        return;
      }
      await loadBrands();
      setNewProduct((prev) => ({ ...prev, brandId: data.data.brand.id }));
      setNewBrandName("");
      setShowNewBrand(false);
      setMessage("Brand added");
    } catch {
      setError("Network error creating brand");
    }
  }

  function addPendingPhoto(file: File) {
    const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);
    setPendingPhotos((prev) => [...prev, { id, file, tag: pendingPhotoTag, previewUrl }]);
  }

  function removePendingPhoto(id: string) {
    setPendingPhotos((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function uploadPhotoToProduct(productId: string, file: File, tag: PhotoTag) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("tag", tag);
    const res = await fetch(`/api/admin/myco/${productId}/photos`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || "Failed to upload photo");
    return data.data.photo as ProductPhoto;
  }

  async function createProduct() {
    if (!partner) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const productUnitMg = toMg(newProduct.productUnitMg, newProduct.productUnitInUnit);
      const unitsPerPack = newProduct.unitsPerPack ? Number(newProduct.unitsPerPack) : null;
      const totalDoseMg = newProduct.totalDoseOverride && newProduct.totalDoseMg
        ? Number(newProduct.totalDoseMg)
        : null;

      if (!productUnitMg) {
        setError("Dose per unit is required");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/admin/myco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: partner.id,
          productName: newProduct.productName,
          format: newProduct.format,
          brandId: newProduct.brandId || null,
          strainSlug: newProduct.strainSlug || null,
          productUnitMg,
          unitsPerPack,
          totalDoseMg,
          strengthOffset: newProduct.strengthOffset,
          strengthRationale: newProduct.strengthRationale,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || "Failed to create product");
        return;
      }

      const product = data.data.product as Product;

      // Upload any pending photos
      const uploaded: ProductPhoto[] = [];
      for (const pp of pendingPhotos) {
        try {
          const ph = await uploadPhotoToProduct(product.id, pp.file, pp.tag);
          uploaded.push(ph);
          URL.revokeObjectURL(pp.previewUrl);
        } catch (err) {
          console.error("Photo upload failed:", err);
        }
      }
      if (uploaded.length) product.photos = [...(product.photos || []), ...uploaded];

      // Save vibe scores if any non-zero
      const hasVibe = Object.values(newVibe).some((v) => v !== 0);
      if (hasVibe) {
        await fetch(`/api/admin/myco/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vibeScores: newVibe }),
        });
        product.vibeProfile = { scores: { ...newVibe } };
      }

      setProducts((current) => [product, ...current]);
      setRowDrafts((current) => ({
        ...current,
        [product.id]: {
          strengthOffset: product.strengthOffset?.offset ?? "standard",
          strengthRationale: product.strengthOffset?.rationale ?? "",
          vibe: readVibe(product.vibeProfile?.scores),
          vibeOpen: false,
        },
      }));
      setNewProduct(emptyProduct);
      setPendingPhotos([]);
      setNewVibe(emptyVibe());
      setNewVibeOpen(false);
      setMessage("Product added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSaving(false);
    }
  }

  async function patchProduct(productId: string, body: Record<string, unknown>, successText: string) {
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/myco/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!data.success) {
      setError(data.error?.message || "Failed to update product");
      return;
    }

    const updated = data.data.product as Product;
    setProducts((current) => current.map((p) => (p.id === updated.id ? updated : p)));
    setRowDrafts((current) => ({
      ...current,
      [updated.id]: {
        ...(current[updated.id] ?? {
          strengthOffset: "standard",
          strengthRationale: "",
          vibe: emptyVibe(),
          vibeOpen: false,
        }),
        strengthOffset: updated.strengthOffset?.offset ?? "standard",
        strengthRationale: updated.strengthOffset?.rationale ?? "",
        vibe: readVibe(updated.vibeProfile?.scores),
      },
    }));
    setMessage(successText);
  }

  function updateDraft(
    productId: string,
    field: "strengthOffset" | "strengthRationale",
    value: string
  ) {
    setRowDrafts((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] ?? {
          strengthOffset: "standard" as StrengthOffset,
          strengthRationale: "",
          vibe: emptyVibe(),
          vibeOpen: false,
        }),
        [field]: value,
      },
    }));
  }

  function updateDraftVibe(productId: string, key: VibeKey, value: number) {
    setRowDrafts((current) => {
      const prev = current[productId] ?? {
        strengthOffset: "standard" as StrengthOffset,
        strengthRationale: "",
        vibe: emptyVibe(),
        vibeOpen: true,
      };
      return {
        ...current,
        [productId]: { ...prev, vibe: { ...prev.vibe, [key]: value } },
      };
    });
  }

  function toggleDraftVibeOpen(productId: string) {
    setRowDrafts((current) => {
      const prev = current[productId] ?? {
        strengthOffset: "standard" as StrengthOffset,
        strengthRationale: "",
        vibe: emptyVibe(),
        vibeOpen: false,
      };
      return { ...current, [productId]: { ...prev, vibeOpen: !prev.vibeOpen } };
    });
  }

  async function uploadExistingProductPhoto(
    productId: string,
    file: File,
    tag: PhotoTag
  ) {
    try {
      const photo = await uploadPhotoToProduct(productId, file, tag);
      setProducts((current) =>
        current.map((p) =>
          p.id === productId ? { ...p, photos: [...(p.photos || []), photo] } : p
        )
      );
      setMessage("Photo uploaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo");
    }
  }

  async function updatePhotoTag(productId: string, photoId: string, tag: PhotoTag) {
    try {
      const res = await fetch(`/api/admin/myco/${productId}/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error?.message || "Failed to update photo");
        return;
      }
      setProducts((current) =>
        current.map((p) =>
          p.id === productId
            ? { ...p, photos: p.photos.map((ph) => (ph.id === photoId ? { ...ph, tag } : ph)) }
            : p
        )
      );
    } catch {
      setError("Network error updating photo");
    }
  }

  async function deletePhoto(productId: string, photoId: string) {
    try {
      const res = await fetch(`/api/admin/myco/${productId}/photos/${photoId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error?.message || "Failed to delete photo");
        return;
      }
      setProducts((current) =>
        current.map((p) =>
          p.id === productId ? { ...p, photos: p.photos.filter((ph) => ph.id !== photoId) } : p
        )
      );
      setMessage("Photo deleted");
    } catch {
      setError("Network error deleting photo");
    }
  }

  if (loading) {
    return <div style={styles.container}>Loading Myco admin...</div>;
  }

  if (!partner) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Myco Store Admin</h1>
        <div style={styles.panel}>Create an active partner before configuring Myco products.</div>
      </div>
    );
  }

  const newUnitMg = toMg(newProduct.productUnitMg, newProduct.productUnitInUnit);
  const computedNewTotal =
    newUnitMg && Number(newProduct.unitsPerPack) > 0
      ? newUnitMg * Number(newProduct.unitsPerPack)
      : null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Myco Store Admin</h1>
          <p style={styles.subtitle}>Manage store settings, product availability, and dose guidance.</p>
        </div>
        <select
          value={partner.id}
          onChange={(event) => loadData(event.target.value)}
          style={styles.select}
        >
          {partners.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.message}>{message}</div>}

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.sectionTitle}>Store Settings</h2>
          {!isReadOnlySettings && (
            <button onClick={saveSettings} disabled={saving} style={styles.primaryButton}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          )}
        </div>
        {isReadOnlySettings && (
          <div style={styles.notice}>
            Store settings are managed by Tripdar — contact us to update.
          </div>
        )}
        <div style={styles.settingsGrid}>
          <label style={styles.field}>
            Store name
            <input
              value={settings.name}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
              style={styles.input}
            />
          </label>
          <label style={styles.field}>
            Subdomain
            <input
              value={settings.subdomain}
              onChange={(e) => setSettings({ ...settings, subdomain: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
              placeholder="top"
              style={styles.input}
            />
          </label>
          <label style={styles.field}>
            Contact email
            <input
              value={settings.contactEmail}
              onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
              style={styles.input}
            />
          </label>
          <label style={styles.field}>
            Contact phone
            <input
              value={settings.contactPhone}
              onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
              style={styles.input}
            />
          </label>
          <label style={styles.field}>
            Contact website
            <input
              value={settings.contactWebsite}
              onChange={(e) => setSettings({ ...settings, contactWebsite: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
              style={styles.input}
            />
          </label>
          <label style={{ ...styles.field, gridColumn: "1 / -1" }}>
            Myco welcome message
            <textarea
              value={settings.mycoWelcomeMessage}
              onChange={(e) => setSettings({ ...settings, mycoWelcomeMessage: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
              rows={3}
              style={styles.textarea}
            />
          </label>
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Add Product</h2>
        <div style={styles.productGrid}>
          <label style={styles.field}>
            Product name
            <input
              value={newProduct.productName}
              onChange={(e) => setNewProduct({ ...newProduct, productName: e.target.value })}
              style={styles.input}
            />
          </label>
          <label style={styles.field}>
            Brand
            <select
              value={showNewBrand ? "__new__" : newProduct.brandId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "__new__") {
                  setShowNewBrand(true);
                  setNewProduct({ ...newProduct, brandId: "" });
                } else {
                  setShowNewBrand(false);
                  setNewProduct({ ...newProduct, brandId: val });
                }
              }}
              style={styles.select}
            >
              <option value="">— Unspecified —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
              <option value="__new__">+ New brand…</option>
            </select>
            {showNewBrand && (
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
                <input
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  placeholder="Brand name"
                  style={styles.input}
                />
                <button onClick={createBrand} style={styles.secondaryButton}>Create</button>
              </div>
            )}
          </label>
          <label style={styles.field}>
            Format
            <select
              value={newProduct.format}
              onChange={(e) => setNewProduct({ ...newProduct, format: e.target.value })}
              style={styles.select}
            >
              <option value="capsule">Capsule</option>
              <option value="edible">Edible</option>
              <option value="dried">Dried</option>
              <option value="tincture">Tincture</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label style={styles.field}>
            Strain
            <select
              value={newProduct.strainSlug}
              onChange={(e) => setNewProduct({ ...newProduct, strainSlug: e.target.value })}
              style={styles.select}
            >
              <option value="">Unspecified</option>
              {strains.map((s) => (
                <option key={s.id} value={s.slug}>{s.name}</option>
              ))}
            </select>
          </label>
          <label style={styles.field}>
            Dose per unit
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input
                type="number"
                min="0"
                step="any"
                value={newProduct.productUnitMg}
                onChange={(e) => setNewProduct({ ...newProduct, productUnitMg: e.target.value })}
                style={{ ...styles.input, flex: 1 }}
              />
              <select
                value={newProduct.productUnitInUnit}
                onChange={(e) => setNewProduct({ ...newProduct, productUnitInUnit: e.target.value as DoseUnit })}
                style={{ ...styles.select, minWidth: "70px" }}
              >
                <option value="mg">mg</option>
                <option value="g">g</option>
              </select>
            </div>
          </label>
          <label style={styles.field}>
            Units per package
            <input
              type="number"
              min="1"
              value={newProduct.unitsPerPack}
              onChange={(e) => setNewProduct({ ...newProduct, unitsPerPack: e.target.value })}
              style={styles.input}
            />
          </label>
          <div style={styles.field}>
            <span>Total dose</span>
            {!newProduct.totalDoseOverride ? (
              <div>
                <div style={{ padding: "0.65rem 0", fontWeight: 700 }}>
                  {formatDose(computedNewTotal)}
                </div>
                <button
                  onClick={() =>
                    setNewProduct({
                      ...newProduct,
                      totalDoseOverride: true,
                      totalDoseMg: computedNewTotal ? String(computedNewTotal) : "",
                      totalDoseInUnit: computedNewTotal && computedNewTotal >= 1000 ? "g" : "mg",
                    })
                  }
                  style={styles.linkButton}
                >
                  Edit total
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={
                    newProduct.totalDoseInUnit === "g" && newProduct.totalDoseMg
                      ? String(Number(newProduct.totalDoseMg) / 1000)
                      : newProduct.totalDoseMg
                  }
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      totalDoseMg:
                        newProduct.totalDoseInUnit === "g"
                          ? String(Number(e.target.value) * 1000)
                          : e.target.value,
                    })
                  }
                  style={{ ...styles.input, flex: 1 }}
                />
                <select
                  value={newProduct.totalDoseInUnit}
                  onChange={(e) => setNewProduct({ ...newProduct, totalDoseInUnit: e.target.value as DoseUnit })}
                  style={{ ...styles.select, minWidth: "70px" }}
                >
                  <option value="mg">mg</option>
                  <option value="g">g</option>
                </select>
                <button
                  onClick={() =>
                    setNewProduct({ ...newProduct, totalDoseOverride: false, totalDoseMg: "" })
                  }
                  style={styles.linkButton}
                >
                  Auto
                </button>
              </div>
            )}
          </div>
          <label style={styles.field}>
            Strength offset
            <select
              value={newProduct.strengthOffset}
              onChange={(e) =>
                setNewProduct({ ...newProduct, strengthOffset: e.target.value as StrengthOffset })
              }
              style={styles.select}
            >
              <option value="standard">Standard</option>
              <option value="stronger">Hits Stronger</option>
              <option value="lighter">Hits Lighter</option>
            </select>
          </label>
          {newProduct.strengthOffset !== "standard" && (
            <label style={styles.field}>
              Rationale
              <input
                value={newProduct.strengthRationale}
                onChange={(e) => setNewProduct({ ...newProduct, strengthRationale: e.target.value })}
                style={styles.input}
              />
            </label>
          )}
        </div>

        <div style={{ marginTop: "1rem" }}>
          <strong style={{ fontSize: "0.85rem" }}>Photos</strong>
          <div style={styles.photoGrid}>
            {pendingPhotos.map((pp) => (
              <div key={pp.id} style={styles.photoCard}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pp.previewUrl} alt="" style={styles.photoImg} />
                <div style={styles.meta}>{pp.tag}</div>
                <button onClick={() => removePendingPhoto(pp.id)} style={styles.linkButton}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={pendingPhotoTag}
              onChange={(e) => setPendingPhotoTag(e.target.value as PhotoTag)}
              style={styles.select}
            >
              {PHOTO_TAGS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) addPendingPhoto(f);
                e.target.value = "";
              }}
              style={styles.fileInput}
            />
            <span style={styles.meta}>Photos upload after product is created</span>
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <button onClick={() => setNewVibeOpen((v) => !v)} style={styles.linkButton}>
            {newVibeOpen ? "Hide" : "Show"} Effect Profile
          </button>
          {newVibeOpen && (
            <div style={styles.vibeGrid}>
              {VIBE_DIMENSIONS.map(({ key, label }) => (
                <label key={key} style={styles.vibeRow}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{label}</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={newVibe[key]}
                    onChange={(e) => setNewVibe({ ...newVibe, [key]: Number(e.target.value) })}
                  />
                  <span style={styles.meta}>{newVibe[key].toFixed(2)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: "1rem" }}>
          <button
            onClick={createProduct}
            disabled={saving || !newProduct.productName || !newProduct.productUnitMg}
            style={styles.primaryButton}
          >
            {saving ? "Adding..." : "Add Product"}
          </button>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.sectionTitle}>Product Catalog</h2>
          <div style={styles.toolbar}>
            <select value={filter} onChange={(e) => setFilter(e.target.value as ProductFilter)} style={styles.select}>
              <option value="all">All</option>
              <option value="active">On</option>
              <option value="inactive">Off</option>
            </select>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={styles.select}>
              <option value="updatedAt">Recently updated</option>
              <option value="productName">Name</option>
              <option value="format">Format</option>
              <option value="brand">Brand</option>
              <option value="active">Status</option>
            </select>
          </div>
        </div>
        <div style={styles.cardList}>
          {visibleProducts.map((product) => {
            const draft = rowDrafts[product.id] ?? {
              strengthOffset: "standard" as StrengthOffset,
              strengthRationale: "",
              vibe: emptyVibe(),
              vibeOpen: false,
            };
            const brandName = product.brandRef?.name || product.brand || "No brand";
            const computedTotal =
              product.productUnitMg && product.unitsPerPack
                ? product.productUnitMg * product.unitsPerPack
                : null;
            return (
              <div key={product.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <label style={styles.switch}>
                    <input
                      type="checkbox"
                      checked={product.active}
                      onChange={(e) =>
                        patchProduct(
                          product.id,
                          { active: e.target.checked },
                          e.target.checked ? "Product turned on" : "Product turned off"
                        )
                      }
                    />
                  </label>
                  <div style={styles.productCell}>
                    {product.photos?.[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.photos[0].url} alt="" style={styles.thumbnail} />
                    ) : product.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.photoUrl} alt="" style={styles.thumbnail} />
                    ) : null}
                    <div>
                      <div style={styles.productName}>{product.productName}</div>
                      <div style={styles.meta}>
                        {brandName} • {product.format}
                        {product.strainSlug ? ` • ${product.strainSlug}` : ""}
                      </div>
                      <div style={styles.meta}>
                        Unit: {formatDose(product.productUnitMg)}
                        {" • "}Per pack: {product.unitsPerPack ?? "—"}
                        {" • "}Total:{" "}
                        {product.totalDoseMg
                          ? formatDose(product.totalDoseMg)
                          : computedTotal
                            ? `${formatDose(computedTotal)} (auto)`
                            : "—"}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={styles.strengthRow}>
                  <select
                    value={draft.strengthOffset}
                    onChange={(e) => updateDraft(product.id, "strengthOffset", e.target.value)}
                    style={styles.select}
                  >
                    <option value="standard">Standard</option>
                    <option value="stronger">Hits Stronger</option>
                    <option value="lighter">Hits Lighter</option>
                  </select>
                  <input
                    value={draft.strengthRationale}
                    onChange={(e) => updateDraft(product.id, "strengthRationale", e.target.value)}
                    disabled={draft.strengthOffset === "standard"}
                    placeholder={draft.strengthOffset === "standard" ? "" : "dense caps, dense effects"}
                    style={styles.input}
                  />
                  <button
                    onClick={() =>
                      patchProduct(
                        product.id,
                        {
                          strengthOffset: draft.strengthOffset,
                          strengthRationale: draft.strengthRationale,
                        },
                        "Strength offset saved"
                      )
                    }
                    style={styles.secondaryButton}
                  >
                    Save
                  </button>
                </div>

                <div style={{ marginTop: "0.75rem" }}>
                  <strong style={{ fontSize: "0.85rem" }}>Photos</strong>
                  <div style={styles.photoGrid}>
                    {product.photos?.map((photo) => (
                      <div key={photo.id} style={styles.photoCard}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.url} alt="" style={styles.photoImg} />
                        <select
                          value={photo.tag}
                          onChange={(e) => updatePhotoTag(product.id, photo.id, e.target.value as PhotoTag)}
                          style={{ ...styles.select, minWidth: "auto", fontSize: "0.75rem", padding: "0.3rem" }}
                        >
                          {PHOTO_TAGS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => deletePhoto(product.id, photo.id)}
                          style={styles.linkButton}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                  <PhotoUploader productId={product.id} onUpload={uploadExistingProductPhoto} />
                </div>

                <div style={{ marginTop: "0.75rem" }}>
                  <button onClick={() => toggleDraftVibeOpen(product.id)} style={styles.linkButton}>
                    {draft.vibeOpen ? "Hide" : "Show"} Effect Profile
                  </button>
                  {draft.vibeOpen && (
                    <>
                      <div style={styles.vibeGrid}>
                        {VIBE_DIMENSIONS.map(({ key, label }) => (
                          <label key={key} style={styles.vibeRow}>
                            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{label}</span>
                            <input
                              type="range"
                              min={-1}
                              max={1}
                              step={0.05}
                              value={draft.vibe[key]}
                              onChange={(e) => updateDraftVibe(product.id, key, Number(e.target.value))}
                            />
                            <span style={styles.meta}>{draft.vibe[key].toFixed(2)}</span>
                          </label>
                        ))}
                      </div>
                      <button
                        onClick={() =>
                          patchProduct(product.id, { vibeScores: draft.vibe }, "Effects saved")
                        }
                        style={styles.secondaryButton}
                      >
                        Save Effects
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PhotoUploader({
  productId,
  onUpload,
}: {
  productId: string;
  onUpload: (productId: string, file: File, tag: PhotoTag) => Promise<void>;
}) {
  const [tag, setTag] = useState<PhotoTag>("stock");
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <select value={tag} onChange={(e) => setTag(e.target.value as PhotoTag)} style={styles.select}>
        {PHOTO_TAGS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await onUpload(productId, f, tag);
          e.target.value = "";
        }}
        style={styles.fileInput}
      />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: { padding: "2rem", color: "#111827" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    marginBottom: "1.5rem",
  },
  title: { fontSize: "2rem", lineHeight: 1.1, margin: 0 },
  subtitle: { color: "#6b7280", margin: "0.35rem 0 0" },
  panel: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "1.25rem",
    marginBottom: "1rem",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    marginBottom: "1rem",
  },
  sectionTitle: { fontSize: "1.1rem", margin: 0 },
  settingsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "1rem",
  },
  productGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "0.75rem",
    alignItems: "start",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    color: "#374151",
    fontSize: "0.85rem",
    fontWeight: 600,
  },
  input: {
    width: "100%",
    minWidth: 0,
    padding: "0.55rem 0.7rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "0.9rem",
    background: "white",
    color: "#111827",
  },
  textarea: {
    width: "100%",
    padding: "0.6rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "0.9rem",
    resize: "vertical",
    color: "#111827",
  },
  select: {
    minWidth: "140px",
    padding: "0.55rem 0.7rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    background: "white",
    color: "#111827",
  },
  fileInput: { fontSize: "0.85rem" },
  primaryButton: {
    padding: "0.65rem 1rem",
    border: "none",
    borderRadius: "6px",
    background: "#2563eb",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "0.5rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    background: "white",
    color: "#111827",
    fontWeight: 600,
    cursor: "pointer",
  },
  linkButton: {
    padding: "0.25rem 0",
    border: "none",
    background: "transparent",
    color: "#2563eb",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
    textAlign: "left",
  },
  toolbar: { display: "flex", gap: "0.5rem", flexWrap: "wrap" },
  cardList: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  card: {
    border: "1px solid #f3f4f6",
    borderRadius: "8px",
    padding: "1rem",
    background: "#fafafa",
  },
  cardTop: { display: "flex", gap: "0.75rem", alignItems: "flex-start" },
  strengthRow: {
    display: "grid",
    gridTemplateColumns: "150px 1fr auto",
    gap: "0.5rem",
    marginTop: "0.75rem",
    alignItems: "center",
  },
  productCell: { display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: 1 },
  thumbnail: {
    width: "56px",
    height: "56px",
    borderRadius: "6px",
    objectFit: "cover",
    background: "#f3f4f6",
  },
  productName: { fontWeight: 800 },
  meta: { color: "#6b7280", fontSize: "0.8rem", marginTop: "0.15rem" },
  switch: { display: "flex", alignItems: "center", justifyContent: "center" },
  photoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
    gap: "0.5rem",
    marginTop: "0.5rem",
  },
  photoCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "6px",
    padding: "0.4rem",
    background: "white",
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    alignItems: "stretch",
  },
  photoImg: {
    width: "100%",
    height: "80px",
    objectFit: "cover",
    borderRadius: "4px",
    background: "#f3f4f6",
  },
  vibeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "0.5rem",
    marginTop: "0.5rem",
    marginBottom: "0.5rem",
  },
  vibeRow: {
    display: "grid",
    gridTemplateColumns: "1fr 140px 40px",
    gap: "0.5rem",
    alignItems: "center",
  },
  error: {
    padding: "0.75rem 1rem",
    borderRadius: "6px",
    background: "#fef2f2",
    color: "#991b1b",
    marginBottom: "1rem",
  },
  message: {
    padding: "0.75rem 1rem",
    borderRadius: "6px",
    background: "#ecfdf5",
    color: "#065f46",
    marginBottom: "1rem",
  },
  notice: {
    padding: "0.6rem 0.8rem",
    borderRadius: "6px",
    background: "#fef9c3",
    color: "#854d0e",
    marginBottom: "0.75rem",
    fontSize: "0.85rem",
  },
};
