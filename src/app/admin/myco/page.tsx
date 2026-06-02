"use client";

import type { ChangeEvent, CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

type StrengthOffset = "standard" | "stronger" | "lighter";
type ProductFilter = "all" | "active" | "inactive" | "archived";

interface EditDraft {
  productName: string;
  brandId: string;
  strainSlug: string;
  format: string;
  productUnitMg: string;
  productUnitInUnit: DoseUnit;
  unitsPerPack: string;
  totalDoseMg: string;
  totalDoseInUnit: DoseUnit;
  totalDoseOverride: boolean;
  ingredients: string[];
  onsetMinutes: string;
  durationMinutes: string;
  brandMicroUnits: string;
  brandMiniUnits: string;
  brandMacroUnits: string;
}
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

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  if (minutes >= 60) {
    const hrs = minutes / 60;
    return `${hrs % 1 === 0 ? hrs.toFixed(0) : hrs.toFixed(1)} hrs`;
  }
  return `${minutes} min`;
}

const COMMON_INGREDIENTS = ["Lion's Mane", "Cordyceps", "Chaga", "Reishi", "L-Theanine", "Niacin"];

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
  archivedAt: string | null;
  updatedAt: string;
  strengthOffset: {
    offset: StrengthOffset;
    rationale: string | null;
  } | null;
  vibeProfile: {
    scores: Record<string, number>;
  } | null;
  ingredients: string[];
  onsetMinutes: number | null;
  durationMinutes: number | null;
  brandMicroUnits: number | null;
  brandMiniUnits: number | null;
  brandMacroUnits: number | null;
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
  ingredients: [] as string[],
  onsetMinutes: "",
  durationMinutes: "",
  brandMicroUnits: "",
  brandMiniUnits: "",
  brandMacroUnits: "",
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
  const [newIngredientInput, setNewIngredientInput] = useState("");
  const [newBrandTiersOpen, setNewBrandTiersOpen] = useState(false);
  const [editIngredientInput, setEditIngredientInput] = useState("");
  const [editBrandTiersOpen, setEditBrandTiersOpen] = useState(false);
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

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

  async function loadData(partnerId?: string, viewArchivedOnly?: boolean) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (partnerId) params.set("partnerId", partnerId);
      if (viewArchivedOnly) params.set("includeArchived", "1");
      const qs = params.toString();
      const url = qs ? `/api/admin/myco?${qs}` : "/api/admin/myco";
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
      if (filter === "archived") return product.archivedAt != null;
      if (product.archivedAt != null) return false;
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
          ingredients: newProduct.ingredients,
          onsetMinutes: newProduct.onsetMinutes ? Number(newProduct.onsetMinutes) : null,
          durationMinutes: newProduct.durationMinutes ? Number(newProduct.durationMinutes) : null,
          brandMicroUnits: newProduct.brandMicroUnits ? Number(newProduct.brandMicroUnits) : null,
          brandMiniUnits: newProduct.brandMiniUnits ? Number(newProduct.brandMiniUnits) : null,
          brandMacroUnits: newProduct.brandMacroUnits ? Number(newProduct.brandMacroUnits) : null,
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
      setNewIngredientInput("");
      setNewBrandTiersOpen(false);
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

  function startEdit(product: Product) {
    const unitMg = product.productUnitMg ?? 0;
    const totalMg = product.totalDoseMg ?? 0;
    const productUnitInUnit: DoseUnit = unitMg >= 1000 ? "g" : "mg";
    const totalDoseInUnit: DoseUnit = totalMg >= 1000 ? "g" : "mg";
    setEditingId(product.id);
    setEditDraft({
      productName: product.productName ?? "",
      brandId: product.brandId ?? "",
      strainSlug: product.strainSlug ?? "",
      format: product.format || "capsule",
      productUnitMg: unitMg
        ? productUnitInUnit === "g"
          ? String(unitMg / 1000)
          : String(unitMg)
        : "",
      productUnitInUnit,
      unitsPerPack: product.unitsPerPack ? String(product.unitsPerPack) : "",
      totalDoseMg: totalMg
        ? totalDoseInUnit === "g"
          ? String(totalMg / 1000)
          : String(totalMg)
        : "",
      totalDoseInUnit,
      totalDoseOverride: !!product.totalDoseMg,
      ingredients: product.ingredients ?? [],
      onsetMinutes: product.onsetMinutes ? String(product.onsetMinutes) : "",
      durationMinutes: product.durationMinutes ? String(product.durationMinutes) : "",
      brandMicroUnits: product.brandMicroUnits ? String(product.brandMicroUnits) : "",
      brandMiniUnits: product.brandMiniUnits ? String(product.brandMiniUnits) : "",
      brandMacroUnits: product.brandMacroUnits ? String(product.brandMacroUnits) : "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit(productId: string) {
    if (!editDraft) return;
    const productUnitMg = toMg(editDraft.productUnitMg, editDraft.productUnitInUnit);
    if (!productUnitMg) {
      setError("Dose per unit is required");
      return;
    }
    const unitsPerPack = editDraft.unitsPerPack ? Number(editDraft.unitsPerPack) : null;
    const totalDoseMg = editDraft.totalDoseOverride && editDraft.totalDoseMg
      ? toMg(editDraft.totalDoseMg, editDraft.totalDoseInUnit)
      : null;
    await patchProduct(
      productId,
      {
        productName: editDraft.productName,
        brandId: editDraft.brandId || null,
        strainSlug: editDraft.strainSlug || null,
        format: editDraft.format,
        productUnitMg,
        unitsPerPack,
        totalDoseMg,
        ingredients: editDraft.ingredients,
        onsetMinutes: editDraft.onsetMinutes ? Number(editDraft.onsetMinutes) : null,
        durationMinutes: editDraft.durationMinutes ? Number(editDraft.durationMinutes) : null,
        brandMicroUnits: editDraft.brandMicroUnits ? Number(editDraft.brandMicroUnits) : null,
        brandMiniUnits: editDraft.brandMiniUnits ? Number(editDraft.brandMiniUnits) : null,
        brandMacroUnits: editDraft.brandMacroUnits ? Number(editDraft.brandMacroUnits) : null,
      },
      "Product updated"
    );
    setEditingId(null);
    setEditDraft(null);
  }

  async function archiveProduct(productId: string) {
    if (!confirm("Archive this product? It will be hidden from the catalog.")) return;
    await patchProduct(productId, { archived: true }, "Product archived");
  }

  async function unarchiveProduct(productId: string) {
    await patchProduct(productId, { archived: false }, "Product unarchived");
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

        {/* Row 1: Identity */}
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
        </div>

        {/* Inline "new brand" creator (full-width, below row 1) */}
        {showNewBrand && (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", alignItems: "center" }}>
            <input
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              placeholder="New brand name"
              style={{ ...styles.input, maxWidth: "280px" }}
            />
            <button onClick={createBrand} style={styles.secondaryButton}>Create brand</button>
            <button onClick={() => { setShowNewBrand(false); setNewBrandName(""); }} style={styles.linkButton}>Cancel</button>
          </div>
        )}

        {/* Row 2: Dose */}
        <div style={{ ...styles.productGrid, marginTop: "1rem" }}>
          <label style={styles.field}>
            Dose per unit
            <div style={styles.inlineRow}>
              <input
                type="number"
                min="0"
                step="any"
                value={newProduct.productUnitMg}
                onChange={(e) => setNewProduct({ ...newProduct, productUnitMg: e.target.value })}
                style={{ ...styles.input, flex: 1, minWidth: 0 }}
              />
              <select
                value={newProduct.productUnitInUnit}
                onChange={(e) => setNewProduct({ ...newProduct, productUnitInUnit: e.target.value as DoseUnit })}
                style={styles.unitSelect}
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
              <div style={styles.totalBox}>
                <span style={styles.totalValue}>{formatDose(computedNewTotal)}</span>
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
                  Edit
                </button>
              </div>
            ) : (
              <div style={styles.inlineRow}>
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
                  style={{ ...styles.input, flex: 1, minWidth: 0 }}
                />
                <select
                  value={newProduct.totalDoseInUnit}
                  onChange={(e) => setNewProduct({ ...newProduct, totalDoseInUnit: e.target.value as DoseUnit })}
                  style={styles.unitSelect}
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
        </div>

        {newProduct.strengthOffset !== "standard" && (
          <div style={{ marginTop: "0.75rem" }}>
            <label style={{ ...styles.field, maxWidth: "560px" }}>
              Rationale
              <input
                value={newProduct.strengthRationale}
                onChange={(e) => setNewProduct({ ...newProduct, strengthRationale: e.target.value })}
                placeholder="e.g. dense caps, hits harder than the printed dose"
                style={styles.input}
              />
            </label>
          </div>
        )}

        <div style={{ marginTop: "1.25rem", borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}>
          <strong style={{ fontSize: "0.85rem", color: "#374151" }}>Photos</strong>
          <div style={{ ...styles.photoGrid, marginTop: "0.5rem" }}>
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
          <div style={styles.uploadRow}>
            <select
              value={pendingPhotoTag}
              onChange={(e) => setPendingPhotoTag(e.target.value as PhotoTag)}
              style={{ ...styles.select, width: "auto", minWidth: "140px" }}
            >
              {PHOTO_TAGS.map((t) => (
                <option key={t} value={t}>{t.replace("_", " ")}</option>
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
            <span style={{ ...styles.meta, marginLeft: "auto" }}>Photos upload after product is created</span>
          </div>
        </div>

        {/* Ingredients & Stacks */}
        <div style={{ marginTop: "1.25rem", borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}>
          <strong style={{ fontSize: "0.85rem", color: "#374151" }}>Ingredients & Stacks</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem" }}>
            {newProduct.ingredients.length === 0 && (
              <span style={styles.meta}>No ingredients added yet</span>
            )}
            {newProduct.ingredients.map((ing) => (
              <span key={ing} style={styles.ingredientPill}>
                {ing}
                <button
                  type="button"
                  onClick={() =>
                    setNewProduct({
                      ...newProduct,
                      ingredients: newProduct.ingredients.filter((i) => i !== ing),
                    })
                  }
                  style={styles.pillRemoveButton}
                  aria-label={`Remove ${ing}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.6rem" }}>
            {COMMON_INGREDIENTS.map((quick) => {
              const alreadyAdded = newProduct.ingredients.some(
                (i) => i.toLowerCase() === quick.toLowerCase()
              );
              return (
                <button
                  key={quick}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() =>
                    setNewProduct({
                      ...newProduct,
                      ingredients: [...newProduct.ingredients, quick],
                    })
                  }
                  style={{
                    ...styles.quickPickButton,
                    opacity: alreadyAdded ? 0.4 : 1,
                    cursor: alreadyAdded ? "default" : "pointer",
                  }}
                >
                  + {quick}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", alignItems: "center" }}>
            <input
              value={newIngredientInput}
              onChange={(e) => setNewIngredientInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = newIngredientInput.trim();
                  if (val && !newProduct.ingredients.some((i) => i.toLowerCase() === val.toLowerCase())) {
                    setNewProduct({ ...newProduct, ingredients: [...newProduct.ingredients, val] });
                  }
                  setNewIngredientInput("");
                }
              }}
              placeholder="Add an ingredient…"
              style={{ ...styles.input, maxWidth: "280px" }}
            />
            <button
              type="button"
              onClick={() => {
                const val = newIngredientInput.trim();
                if (val && !newProduct.ingredients.some((i) => i.toLowerCase() === val.toLowerCase())) {
                  setNewProduct({ ...newProduct, ingredients: [...newProduct.ingredients, val] });
                }
                setNewIngredientInput("");
              }}
              style={styles.secondaryButton}
            >
              Add
            </button>
          </div>
        </div>

        {/* Onset & Duration */}
        <div style={{ marginTop: "1.25rem", borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}>
          <strong style={{ fontSize: "0.85rem", color: "#374151" }}>Onset & Duration</strong>
          <div style={{ ...styles.productGrid, marginTop: "0.5rem" }}>
            <label style={styles.field}>
              Onset (minutes)
              <input
                type="number"
                min="0"
                value={newProduct.onsetMinutes}
                onChange={(e) => setNewProduct({ ...newProduct, onsetMinutes: e.target.value })}
                style={styles.input}
              />
              <span style={styles.meta}>How long until effects start?</span>
            </label>
            <label style={styles.field}>
              Duration (minutes)
              <input
                type="number"
                min="0"
                value={newProduct.durationMinutes}
                onChange={(e) => setNewProduct({ ...newProduct, durationMinutes: e.target.value })}
                style={styles.input}
              />
              <span style={styles.meta}>Total experience length</span>
            </label>
          </div>
        </div>

        {/* Brand's Recommended Dose Tiers */}
        <div style={{ marginTop: "1.25rem", borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}>
          <button
            type="button"
            onClick={() => setNewBrandTiersOpen((v) => !v)}
            style={styles.linkButton}
          >
            {newBrandTiersOpen ? "Hide" : "Show"} Brand Dose Tiers
          </button>
          {newBrandTiersOpen && (
            <>
              <p style={{ ...styles.meta, margin: "0.5rem 0" }}>
                Use the brand&apos;s own packaging guidance. e.g. 1 cap microdose, 3 caps mini-dose, 5 caps macro.
              </p>
              <div style={styles.productGrid}>
                <label style={styles.field}>
                  Microdose units
                  <input
                    type="number"
                    min="0"
                    value={newProduct.brandMicroUnits}
                    onChange={(e) => setNewProduct({ ...newProduct, brandMicroUnits: e.target.value })}
                    style={styles.input}
                  />
                </label>
                <label style={styles.field}>
                  Mini-dose units
                  <input
                    type="number"
                    min="0"
                    value={newProduct.brandMiniUnits}
                    onChange={(e) => setNewProduct({ ...newProduct, brandMiniUnits: e.target.value })}
                    style={styles.input}
                  />
                </label>
                <label style={styles.field}>
                  Macro-dose units
                  <input
                    type="number"
                    min="0"
                    value={newProduct.brandMacroUnits}
                    onChange={(e) => setNewProduct({ ...newProduct, brandMacroUnits: e.target.value })}
                    style={styles.input}
                  />
                </label>
              </div>
            </>
          )}
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
            <select
              value={filter}
              onChange={(e) => {
                const next = e.target.value as ProductFilter;
                setFilter(next);
                loadData(partner.id, next === "archived");
              }}
              style={styles.select}
            >
              <option value="all">All</option>
              <option value="active">On</option>
              <option value="inactive">Off</option>
              <option value="archived">Archived</option>
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
            const isEditing = editingId === product.id && editDraft;
            const isArchived = product.archivedAt != null;
            const editUnitMg = isEditing ? toMg(editDraft!.productUnitMg, editDraft!.productUnitInUnit) : null;
            const editComputedTotal =
              editUnitMg && Number(editDraft?.unitsPerPack) > 0
                ? editUnitMg * Number(editDraft!.unitsPerPack)
                : null;
            return (
              <div key={product.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <label style={styles.switch}>
                    <input
                      type="checkbox"
                      checked={product.active}
                      disabled={isArchived}
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
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.productName}>
                        {product.productName}
                        {isArchived && (
                          <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem", color: "#92400e", background: "#fef3c7", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>
                            Archived
                          </span>
                        )}
                      </div>
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
                      {(product.ingredients?.length ||
                        product.onsetMinutes ||
                        product.durationMinutes ||
                        product.brandMicroUnits ||
                        product.brandMiniUnits ||
                        product.brandMacroUnits) ? (
                        <div style={{ ...styles.meta, display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
                          {product.ingredients?.map((ing) => (
                            <span key={ing} style={styles.readOnlyPill}>{ing}</span>
                          ))}
                          {(product.onsetMinutes || product.durationMinutes) && (
                            <span>
                              {product.onsetMinutes ? `Onset: ${formatDuration(product.onsetMinutes)}` : ""}
                              {product.onsetMinutes && product.durationMinutes ? " • " : ""}
                              {product.durationMinutes ? `Duration: ${formatDuration(product.durationMinutes)}` : ""}
                            </span>
                          )}
                          {(product.brandMicroUnits || product.brandMiniUnits || product.brandMacroUnits) && (
                            <span>
                              Brand:{" "}
                              {[
                                product.brandMicroUnits ? `${product.brandMicroUnits} micro` : null,
                                product.brandMiniUnits ? `${product.brandMiniUnits} mini` : null,
                                product.brandMacroUnits ? `${product.brandMacroUnits} macro` : null,
                              ]
                                .filter(Boolean)
                                .join(" / ")}
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {isArchived ? (
                      <button onClick={() => unarchiveProduct(product.id)} style={styles.secondaryButton}>
                        Unarchive
                      </button>
                    ) : isEditing ? null : (
                      <>
                        <button onClick={() => startEdit(product)} style={styles.secondaryButton}>
                          Edit
                        </button>
                        <button onClick={() => archiveProduct(product.id)} style={styles.secondaryButton}>
                          Archive
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing && editDraft && (
                  <div style={{ ...styles.productGrid, marginTop: "0.75rem", padding: "0.75rem", background: "white", border: "1px solid #e5e7eb", borderRadius: "6px" }}>
                    <label style={styles.field}>
                      Product name
                      <input
                        value={editDraft.productName}
                        onChange={(e) => setEditDraft({ ...editDraft, productName: e.target.value })}
                        style={styles.input}
                      />
                    </label>
                    <label style={styles.field}>
                      Brand
                      <select
                        value={editDraft.brandId}
                        onChange={(e) => setEditDraft({ ...editDraft, brandId: e.target.value })}
                        style={styles.select}
                      >
                        <option value="">— Unspecified —</option>
                        {brands.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </label>
                    <label style={styles.field}>
                      Format
                      <select
                        value={editDraft.format}
                        onChange={(e) => setEditDraft({ ...editDraft, format: e.target.value })}
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
                        value={editDraft.strainSlug}
                        onChange={(e) => setEditDraft({ ...editDraft, strainSlug: e.target.value })}
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
                          value={editDraft.productUnitMg}
                          onChange={(e) => setEditDraft({ ...editDraft, productUnitMg: e.target.value })}
                          style={{ ...styles.input, flex: 1 }}
                        />
                        <select
                          value={editDraft.productUnitInUnit}
                          onChange={(e) => setEditDraft({ ...editDraft, productUnitInUnit: e.target.value as DoseUnit })}
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
                        value={editDraft.unitsPerPack}
                        onChange={(e) => setEditDraft({ ...editDraft, unitsPerPack: e.target.value })}
                        style={styles.input}
                      />
                    </label>
                    <div style={styles.field}>
                      <span>Total dose</span>
                      {!editDraft.totalDoseOverride ? (
                        <div>
                          <div style={{ padding: "0.65rem 0", fontWeight: 700 }}>
                            {formatDose(editComputedTotal)}
                          </div>
                          <button
                            onClick={() =>
                              setEditDraft({
                                ...editDraft,
                                totalDoseOverride: true,
                                totalDoseMg: editComputedTotal
                                  ? editComputedTotal >= 1000
                                    ? String(editComputedTotal / 1000)
                                    : String(editComputedTotal)
                                  : "",
                                totalDoseInUnit: editComputedTotal && editComputedTotal >= 1000 ? "g" : "mg",
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
                            value={editDraft.totalDoseMg}
                            onChange={(e) => setEditDraft({ ...editDraft, totalDoseMg: e.target.value })}
                            style={{ ...styles.input, flex: 1 }}
                          />
                          <select
                            value={editDraft.totalDoseInUnit}
                            onChange={(e) => setEditDraft({ ...editDraft, totalDoseInUnit: e.target.value as DoseUnit })}
                            style={{ ...styles.select, minWidth: "70px" }}
                          >
                            <option value="mg">mg</option>
                            <option value="g">g</option>
                          </select>
                          <button
                            onClick={() =>
                              setEditDraft({ ...editDraft, totalDoseOverride: false, totalDoseMg: "" })
                            }
                            style={styles.linkButton}
                          >
                            Auto
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Ingredients & Stacks (edit) */}
                    <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #f1f5f9", paddingTop: "0.75rem" }}>
                      <strong style={{ fontSize: "0.85rem", color: "#374151" }}>Ingredients & Stacks</strong>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem" }}>
                        {editDraft.ingredients.length === 0 && (
                          <span style={styles.meta}>No ingredients</span>
                        )}
                        {editDraft.ingredients.map((ing) => (
                          <span key={ing} style={styles.ingredientPill}>
                            {ing}
                            <button
                              type="button"
                              onClick={() =>
                                setEditDraft({
                                  ...editDraft,
                                  ingredients: editDraft.ingredients.filter((i) => i !== ing),
                                })
                              }
                              style={styles.pillRemoveButton}
                              aria-label={`Remove ${ing}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.5rem" }}>
                        {COMMON_INGREDIENTS.map((quick) => {
                          const alreadyAdded = editDraft.ingredients.some(
                            (i) => i.toLowerCase() === quick.toLowerCase()
                          );
                          return (
                            <button
                              key={quick}
                              type="button"
                              disabled={alreadyAdded}
                              onClick={() =>
                                setEditDraft({
                                  ...editDraft,
                                  ingredients: [...editDraft.ingredients, quick],
                                })
                              }
                              style={{
                                ...styles.quickPickButton,
                                opacity: alreadyAdded ? 0.4 : 1,
                                cursor: alreadyAdded ? "default" : "pointer",
                              }}
                            >
                              + {quick}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "center" }}>
                        <input
                          value={editIngredientInput}
                          onChange={(e) => setEditIngredientInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const val = editIngredientInput.trim();
                              if (val && !editDraft.ingredients.some((i) => i.toLowerCase() === val.toLowerCase())) {
                                setEditDraft({ ...editDraft, ingredients: [...editDraft.ingredients, val] });
                              }
                              setEditIngredientInput("");
                            }
                          }}
                          placeholder="Add an ingredient…"
                          style={{ ...styles.input, maxWidth: "280px" }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = editIngredientInput.trim();
                            if (val && !editDraft.ingredients.some((i) => i.toLowerCase() === val.toLowerCase())) {
                              setEditDraft({ ...editDraft, ingredients: [...editDraft.ingredients, val] });
                            }
                            setEditIngredientInput("");
                          }}
                          style={styles.secondaryButton}
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Onset & Duration (edit) */}
                    <label style={styles.field}>
                      Onset (minutes)
                      <input
                        type="number"
                        min="0"
                        value={editDraft.onsetMinutes}
                        onChange={(e) => setEditDraft({ ...editDraft, onsetMinutes: e.target.value })}
                        style={styles.input}
                      />
                      <span style={styles.meta}>How long until effects start?</span>
                    </label>
                    <label style={styles.field}>
                      Duration (minutes)
                      <input
                        type="number"
                        min="0"
                        value={editDraft.durationMinutes}
                        onChange={(e) => setEditDraft({ ...editDraft, durationMinutes: e.target.value })}
                        style={styles.input}
                      />
                      <span style={styles.meta}>Total experience length</span>
                    </label>

                    {/* Brand Dose Tiers (edit) */}
                    <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #f1f5f9", paddingTop: "0.75rem" }}>
                      <button
                        type="button"
                        onClick={() => setEditBrandTiersOpen((v) => !v)}
                        style={styles.linkButton}
                      >
                        {editBrandTiersOpen ? "Hide" : "Show"} Brand Dose Tiers
                      </button>
                      {editBrandTiersOpen && (
                        <>
                          <p style={{ ...styles.meta, margin: "0.5rem 0" }}>
                            Use the brand&apos;s own packaging guidance. e.g. 1 cap microdose, 3 caps mini-dose, 5 caps macro.
                          </p>
                          <div style={styles.productGrid}>
                            <label style={styles.field}>
                              Microdose units
                              <input
                                type="number"
                                min="0"
                                value={editDraft.brandMicroUnits}
                                onChange={(e) => setEditDraft({ ...editDraft, brandMicroUnits: e.target.value })}
                                style={styles.input}
                              />
                            </label>
                            <label style={styles.field}>
                              Mini-dose units
                              <input
                                type="number"
                                min="0"
                                value={editDraft.brandMiniUnits}
                                onChange={(e) => setEditDraft({ ...editDraft, brandMiniUnits: e.target.value })}
                                style={styles.input}
                              />
                            </label>
                            <label style={styles.field}>
                              Macro-dose units
                              <input
                                type="number"
                                min="0"
                                value={editDraft.brandMacroUnits}
                                onChange={(e) => setEditDraft({ ...editDraft, brandMacroUnits: e.target.value })}
                                style={styles.input}
                              />
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                      <button onClick={cancelEdit} style={styles.secondaryButton}>Cancel</button>
                      <button onClick={() => saveEdit(product.id)} style={styles.primaryButton}>Save</button>
                    </div>
                  </div>
                )}

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
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "1rem",
  },
  productGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "1rem 1rem",
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
    width: "100%",
    minWidth: 0,
    padding: "0.55rem 0.7rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    background: "white",
    color: "#111827",
    fontSize: "0.9rem",
    boxSizing: "border-box",
  },
  unitSelect: {
    width: "70px",
    flex: "0 0 70px",
    padding: "0.55rem 0.5rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    background: "white",
    color: "#111827",
    fontSize: "0.9rem",
    boxSizing: "border-box",
  },
  inlineRow: {
    display: "flex",
    gap: "0.4rem",
    alignItems: "center",
    width: "100%",
  },
  totalBox: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.55rem 0.7rem",
    border: "1px dashed #d1d5db",
    borderRadius: "6px",
    background: "#f9fafb",
    minHeight: "calc(0.9rem + 1.1rem + 2px)",
  },
  totalValue: {
    fontWeight: 700,
    fontSize: "0.95rem",
    color: "#111827",
    flex: 1,
  },
  uploadRow: {
    display: "flex",
    gap: "0.6rem",
    marginTop: "0.75rem",
    alignItems: "center",
    flexWrap: "wrap",
    padding: "0.6rem 0.75rem",
    background: "#f9fafb",
    border: "1px dashed #e5e7eb",
    borderRadius: "6px",
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
  ingredientPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.3rem 0.6rem",
    background: "#eef2ff",
    color: "#4338ca",
    borderRadius: "999px",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  pillRemoveButton: {
    background: "transparent",
    border: "none",
    color: "#4338ca",
    cursor: "pointer",
    fontSize: "1rem",
    lineHeight: 1,
    padding: 0,
    fontWeight: 700,
  },
  quickPickButton: {
    padding: "0.25rem 0.55rem",
    background: "#f3f4f6",
    color: "#374151",
    border: "1px solid #e5e7eb",
    borderRadius: "999px",
    fontSize: "0.75rem",
    cursor: "pointer",
  },
  readOnlyPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.15rem 0.5rem",
    background: "#eef2ff",
    color: "#4338ca",
    borderRadius: "999px",
    fontSize: "0.72rem",
    fontWeight: 600,
  },
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
