"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FilterTabs,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Textarea,
  type BadgeTone,
  type FilterTab,
} from "@/components/admin";

type StrengthOffset = "standard" | "stronger" | "lighter";
type ProductFilter = "all" | "needs_attention" | "ready" | "active" | "inactive" | "archived";

type ConfidenceLevel = "none" | "low" | "building" | "solid";

const CONFIDENCE_BADGES: Record<ConfidenceLevel, { label: string; tone: BadgeTone }> = {
  none: { label: "No reports", tone: "neutral" },
  low: { label: "Low confidence", tone: "warning" },
  building: { label: "Building confidence", tone: "info" },
  solid: { label: "Solid confidence", tone: "success" },
};
type BrandDoseCategory = "micro" | "mini" | "macro" | "custom";

interface BrandDoseTierDraft {
  id: string;
  category: BrandDoseCategory;
  label: string;
  quantityText: string;
  unit: string;
}

interface BrandDoseTier extends BrandDoseTierDraft {
  quantityMin: number;
  quantityMax: number | null;
}

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
  flavors: string[];
  onsetMinutes: string;
  durationMinutes: string;
  brandDoseTiers: BrandDoseTierDraft[];
  brandDoseInstructions: string;
}
type SortKey = "productName" | "format" | "brand" | "active" | "updatedAt";
type PhotoTag = "stock" | "package_front" | "package_back" | "lifestyle" | "other";
type PhotoKind = "source" | "transparent" | "white_background" | "derivative";
type UserRole = "super_admin" | "partner_admin";
type DoseUnit = "mg" | "g";
type EmployeeReviewStatus = "assigned" | "opened" | "submitted" | "not_familiar" | "overdue" | "expired";

interface EmployeeReviewParticipation {
  assigned: number;
  opened: number;
  submitted: number;
  notFamiliar: number;
  overdue: number;
  expired: number;
  noResponse: number;
  responseRate: number;
}

interface EmployeeReviewGuidance {
  sampleSize: number;
  confidence: ConfidenceLevel;
  recommendationReady: boolean;
  spread: number | null;
}

interface EmployeeReviewAssignment {
  id: string;
  status: EmployeeReviewStatus;
  assignedAt: string;
  openedAt: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
  reminderCount: number;
  employee: {
    id: string;
    name: string;
    email: string;
    points: number;
    streak: number;
    optedOut: boolean;
  };
}

interface EmployeeReviewPanelData {
  assignments: EmployeeReviewAssignment[];
  participation: EmployeeReviewParticipation;
  guidance: EmployeeReviewGuidance;
}

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
const PHOTO_KINDS: PhotoKind[] = ["source", "transparent", "white_background", "derivative"];
const PHOTO_KIND_LABELS: Record<PhotoKind, string> = {
  source: "Original",
  transparent: "Transparent",
  white_background: "White BG",
  derivative: "Derivative",
};
const BRAND_DOSE_CATEGORY_LABELS: Record<BrandDoseCategory, string> = {
  micro: "Micro",
  mini: "Mini",
  macro: "Macro",
  custom: "Custom",
};

const PRODUCT_FILTER_TABS: FilterTab<ProductFilter>[] = [
  { value: "all", label: "All" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "ready", label: "Ready" },
  { value: "active", label: "On" },
  { value: "inactive", label: "Off" },
  { value: "archived", label: "Archived" },
];

const INGREDIENT_PILL_CLASSES =
  "inline-flex items-center gap-1.5 rounded-full bg-moss-100 px-2.5 py-1 text-xs font-semibold text-moss-700";
const PILL_REMOVE_CLASSES =
  "cursor-pointer p-0 text-base font-bold leading-none text-moss-700 hover:text-moss-800";
const READONLY_PILL_CLASSES =
  "inline-flex items-center rounded-full bg-moss-100 px-2 py-0.5 text-[0.72rem] font-semibold text-moss-700";
const PHOTO_GRID_CLASSES =
  "mt-2 grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2";

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

function unitForFormat(format: string): string {
  if (format === "capsule") return "capsule";
  if (format === "edible") return "gummy";
  if (format === "tincture") return "dropper";
  return "unit";
}

function makeBrandDoseTier(
  category: BrandDoseCategory,
  label: string,
  unit: string,
  quantityText = ""
): BrandDoseTierDraft {
  return {
    id: `tier-${category}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    label,
    quantityText,
    unit,
  };
}

function defaultBrandDoseTiers(format: string): BrandDoseTierDraft[] {
  const unit = unitForFormat(format);
  return [
    makeBrandDoseTier("micro", "Microdose", unit),
    makeBrandDoseTier("mini", "Mini-dose", unit),
    makeBrandDoseTier("macro", "Macro Dose", unit),
  ];
}

function retargetDefaultTierUnits(
  tiers: BrandDoseTierDraft[],
  previousFormat: string,
  nextFormat: string
): BrandDoseTierDraft[] {
  const previousUnit = unitForFormat(previousFormat);
  const nextUnit = unitForFormat(nextFormat);
  return tiers.map((tier) => ({
    ...tier,
    unit: !tier.unit || tier.unit === previousUnit ? nextUnit : tier.unit,
  }));
}

function normalizeBrandDoseTiers(product: Product): BrandDoseTierDraft[] {
  if (Array.isArray(product.brandDoseTiers) && product.brandDoseTiers.length > 0) {
    return product.brandDoseTiers.map((tier, index) => ({
      id: tier.id || `tier-${index + 1}`,
      category: tier.category,
      label: tier.label,
      quantityText: tier.quantityText,
      unit: tier.unit,
    }));
  }

  const unit = unitForFormat(product.format);
  return [
    product.brandMicroUnits
      ? makeBrandDoseTier("micro", "Microdose", unit, String(product.brandMicroUnits))
      : null,
    product.brandMiniUnits
      ? makeBrandDoseTier("mini", "Mini-dose", unit, String(product.brandMiniUnits))
      : null,
    product.brandMacroUnits
      ? makeBrandDoseTier("macro", "Macro Dose", unit, String(product.brandMacroUnits))
      : null,
  ].filter((tier): tier is BrandDoseTierDraft => Boolean(tier));
}

function activeBrandDoseTiers(tiers: BrandDoseTierDraft[]): BrandDoseTierDraft[] {
  return tiers.filter((tier) => tier.label.trim() && tier.quantityText.trim());
}

function formatBrandDoseTier(tier: BrandDoseTier | BrandDoseTierDraft): string {
  const unit = tier.unit.trim();
  return `${tier.quantityText}${unit ? ` ${unit}` : ""} = ${tier.label}`;
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
  kind: PhotoKind;
  isPrimary: boolean;
  flavor: string | null;
  sortOrder: number;
  provider?: string | null;
  model?: string | null;
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
    confirmed: boolean;
    confirmedBy: string | null;
  } | null;
  vibeProfile: {
    scores: Record<string, number>;
    source: string;
  } | null;
  // Present on GET/PATCH responses; absent right after create/duplicate
  readiness?: {
    ready: boolean;
    missing: string[];
    warnings: string[];
  };
  community?: {
    voteCount: number;
    scores: Record<string, number> | null;
    spread: number | null;
  };
  confidence?: ConfidenceLevel;
  employeeReviews?: {
    participation: EmployeeReviewParticipation;
    guidance: EmployeeReviewGuidance;
  };
  ingredients: string[];
  onsetMinutes: number | null;
  durationMinutes: number | null;
  brandMicroUnits: number | null;
  brandMiniUnits: number | null;
  brandMacroUnits: number | null;
  brandDoseTiers: BrandDoseTier[] | null;
  brandDoseInstructions: string | null;
  _count?: { testerVotes: number };
  flavors: string[];
}

interface PendingPhoto {
  id: string;
  file: File;
  tag: PhotoTag;
  kind: PhotoKind;
  isPrimary: boolean;
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
  flavors: [] as string[],
  onsetMinutes: "",
  durationMinutes: "",
  brandDoseTiers: defaultBrandDoseTiers("capsule"),
  brandDoseInstructions: "",
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
  const [pendingPhotoKind, setPendingPhotoKind] = useState<PhotoKind>("source");
  const [newVibe, setNewVibe] = useState<VibeScores>(emptyVibe());
  const [newVibeOpen, setNewVibeOpen] = useState(false);
  const [newIngredientInput, setNewIngredientInput] = useState("");
  const [newFlavorInput, setNewFlavorInput] = useState("");
  const [editIngredientInput, setEditIngredientInput] = useState("");
  const [editFlavorInput, setEditFlavorInput] = useState("");
  const [newBrandTiersOpen, setNewBrandTiersOpen] = useState(false);
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
      if (filter === "needs_attention") return product.active && product.readiness?.ready === false;
      if (filter === "ready") return product.active && product.readiness?.ready === true;
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
    setPendingPhotos((prev) => [
      // First photo defaults to the primary catalog image; the human can change it before saving.
      ...prev,
      { id, file, tag: pendingPhotoTag, kind: pendingPhotoKind, isPrimary: prev.length === 0, previewUrl },
    ]);
  }

  function setPendingPhotoPrimary(id: string) {
    setPendingPhotos((prev) => prev.map((p) => ({ ...p, isPrimary: p.id === id })));
  }

  function removePendingPhoto(id: string) {
    setPendingPhotos((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const next = prev.filter((p) => p.id !== id);
      // If we removed the primary, promote the first remaining photo so one stays chosen.
      if (removed?.isPrimary && next.length > 0 && !next.some((p) => p.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });
  }

  async function resizeImageFile(file: File, maxPx = 1600, quality = 0.85): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const { width, height } = img;
        const scale = Math.min(1, maxPx / Math.max(width, height));
        const w = Math.round(width * scale);
        const h = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not load image for resizing")); };
      img.src = objectUrl;
    });
  }

  async function uploadPhotoToProduct(
    productId: string,
    file: File,
    tag: PhotoTag,
    kind: PhotoKind = "source",
    isPrimary = false
  ) {
    // Transparent derivatives must keep their alpha channel — never re-encode them to JPEG.
    const isTransparent = kind === "transparent" || file.type === "image/png";
    const upload = isTransparent ? file : await resizeImageFile(file);
    const formData = new FormData();
    formData.append("file", upload);
    formData.append("tag", tag);
    formData.append("kind", kind);
    if (isPrimary) formData.append("isPrimary", "true");
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
          flavors: newProduct.flavors,
          onsetMinutes: newProduct.onsetMinutes ? Number(newProduct.onsetMinutes) : null,
          durationMinutes: newProduct.durationMinutes ? Math.round(Number(newProduct.durationMinutes) * 60) : null,
          brandDoseTiers: activeBrandDoseTiers(newProduct.brandDoseTiers),
          brandDoseInstructions: newProduct.brandDoseInstructions,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || "Failed to create product");
        return;
      }

      const product = data.data.product as Product;

      // Upload any pending photos — surface failures loudly
      const uploaded: ProductPhoto[] = [];
      const photoErrors: string[] = [];
      for (const pp of pendingPhotos) {
        try {
          const ph = await uploadPhotoToProduct(product.id, pp.file, pp.tag, pp.kind, pp.isPrimary);
          uploaded.push(ph);
          URL.revokeObjectURL(pp.previewUrl);
        } catch (err) {
          console.error("Photo upload failed:", err);
          photoErrors.push(`${pp.file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
        }
      }
      if (uploaded.length) product.photos = [...(product.photos || []), ...uploaded];
      if (photoErrors.length) {
        setError(
          `Product saved, but ${photoErrors.length} of ${pendingPhotos.length} photo(s) failed to upload:\n` +
          photoErrors.join("\n") +
          `\n\nClick Edit on the product to re-upload them.`
        );
      }

      // Save vibe scores if any non-zero
      const hasVibe = Object.values(newVibe).some((v) => v !== 0);
      if (hasVibe) {
        await fetch(`/api/admin/myco/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vibeScores: newVibe }),
        });
        product.vibeProfile = { scores: { ...newVibe }, source: "admin" };
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
      setNewProduct({ ...emptyProduct, brandDoseTiers: defaultBrandDoseTiers("capsule") });
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
      flavors: product.flavors ?? [],
      onsetMinutes: product.onsetMinutes ? String(product.onsetMinutes) : "",
      durationMinutes: product.durationMinutes ? String(product.durationMinutes / 60) : "",
      brandDoseTiers: normalizeBrandDoseTiers(product),
      brandDoseInstructions: product.brandDoseInstructions ?? "",
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

    // Recipe-defining changes invalidate tester feedback and confirmed offsets.
    // Same recipe + flavors should stay one product; different recipe should be duplicated.
    const product = products.find((p) => p.id === productId);
    const feedbackCount = product?._count?.testerVotes ?? 0;
    if (product && feedbackCount > 0) {
      const recipeChanged =
        productUnitMg !== product.productUnitMg ||
        editDraft.format !== product.format ||
        (editDraft.strainSlug || null) !== product.strainSlug ||
        JSON.stringify(editDraft.ingredients) !== JSON.stringify(product.ingredients ?? []);
      if (recipeChanged) {
        const proceed = confirm(
          `This product has ${feedbackCount} tester report${feedbackCount === 1 ? "" : "s"} describing its current recipe.\n\n` +
            `Changing dose, format, strain, or ingredients means those reports no longer describe this product, ` +
            `and the strength offset will need re-confirmation.\n\n` +
            `If this is really a DIFFERENT recipe, cancel and use Duplicate instead. Apply the change anyway?`
        );
        if (!proceed) return;
      }
    }

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
        flavors: editDraft.flavors,
        onsetMinutes: editDraft.onsetMinutes ? Number(editDraft.onsetMinutes) : null,
        durationMinutes: editDraft.durationMinutes ? Math.round(Number(editDraft.durationMinutes) * 60) : null,
        brandDoseTiers: activeBrandDoseTiers(editDraft.brandDoseTiers),
        brandDoseInstructions: editDraft.brandDoseInstructions,
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

  async function duplicateProduct(productId: string) {
    if (!confirm("Duplicate this product? You'll get a copy you can rename and adjust.")) return;
    try {
      const res = await fetch(`/api/admin/myco/${productId}/duplicate`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json?.error?.message || "Failed to duplicate product");
        return;
      }
      await loadData(partner?.id, filter === "archived");
      // Auto-open edit on the new copy
      if (json.data?.product) {
        setTimeout(() => startEdit(json.data.product), 300);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to duplicate product");
    }
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
    tag: PhotoTag,
    kind: PhotoKind = "source"
  ) {
    try {
      const photo = await uploadPhotoToProduct(productId, file, tag, kind);
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

  async function updatePhotoPrimary(productId: string, photoId: string) {
    try {
      const res = await fetch(`/api/admin/myco/${productId}/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error?.message || "Failed to set primary photo");
        return;
      }
      // Only one primary per product — reflect that locally.
      setProducts((current) =>
        current.map((p) =>
          p.id === productId
            ? { ...p, photos: p.photos.map((ph) => ({ ...ph, isPrimary: ph.id === photoId })) }
            : p
        )
      );
      setMessage("Primary catalog image updated");
    } catch {
      setError("Network error updating primary photo");
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

  async function updatePhotoFlavor(productId: string, photoId: string, flavor: string) {
    try {
      const res = await fetch(`/api/admin/myco/${productId}/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flavor: flavor || null }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error?.message || "Failed to update photo");
        return;
      }
      setProducts((current) =>
        current.map((p) =>
          p.id === productId
            ? {
                ...p,
                photos: p.photos.map((ph) =>
                  ph.id === photoId ? { ...ph, flavor: flavor || null } : ph
                ),
              }
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
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-8">
        <LoadingState label="Loading Myco admin..." />
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-8">
        <PageHeader title="Myco Store Admin" />
        <EmptyState
          icon="folder"
          title="Create an active partner before configuring Myco products."
        />
      </div>
    );
  }

  const newUnitMg = toMg(newProduct.productUnitMg, newProduct.productUnitInUnit);
  const computedNewTotal =
    newUnitMg && Number(newProduct.unitsPerPack) > 0
      ? newUnitMg * Number(newProduct.unitsPerPack)
      : null;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader
        title="Myco Store Admin"
        subtitle="Manage store settings, product availability, and dose guidance."
        actions={
          <Select
            value={partner.id}
            onChange={(event) => loadData(event.target.value)}
            className="sm:w-56"
          >
            {partners.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
        }
      />

      {error && (
        <Alert tone="error" className="mb-4 whitespace-pre-line">
          {error}
        </Alert>
      )}
      {message && (
        <Alert tone="success" className="mb-4">
          {message}
        </Alert>
      )}

      <Card className="mb-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-bark-800">Store Settings</h2>
          {!isReadOnlySettings && (
            <Button onClick={saveSettings} disabled={saving} className="w-full sm:w-auto">
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          )}
        </div>
        {isReadOnlySettings && (
          <Alert tone="warning" className="mb-4">
            Store settings are managed by Tripdar — contact us to update.
          </Alert>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Store name">
            <Input
              value={settings.name}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
            />
          </Field>
          <Field label="Subdomain">
            <Input
              value={settings.subdomain}
              onChange={(e) => setSettings({ ...settings, subdomain: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
              placeholder="top"
            />
          </Field>
          <Field label="Contact email">
            <Input
              value={settings.contactEmail}
              onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
            />
          </Field>
          <Field label="Contact phone">
            <Input
              value={settings.contactPhone}
              onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
            />
          </Field>
          <Field label="Contact website">
            <Input
              value={settings.contactWebsite}
              onChange={(e) => setSettings({ ...settings, contactWebsite: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
            />
          </Field>
          <Field label="Myco welcome message" className="sm:col-span-2">
            <Textarea
              value={settings.mycoWelcomeMessage}
              onChange={(e) => setSettings({ ...settings, mycoWelcomeMessage: e.target.value })}
              readOnly={isReadOnlySettings}
              disabled={isReadOnlySettings}
              rows={3}
            />
          </Field>
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-4 text-lg font-semibold text-bark-800">Add Product</h2>

        {/* Row 1: Identity */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Product name">
            <Input
              value={newProduct.productName}
              onChange={(e) => setNewProduct({ ...newProduct, productName: e.target.value })}
            />
          </Field>
          <Field label="Brand">
            <Select
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
            >
              <option value="">— Unspecified —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
              <option value="__new__">+ New brand…</option>
            </Select>
          </Field>
          <Field label="Format">
            <Select
              value={newProduct.format}
              onChange={(e) => {
                const format = e.target.value;
                setNewProduct({
                  ...newProduct,
                  format,
                  brandDoseTiers: retargetDefaultTierUnits(
                    newProduct.brandDoseTiers,
                    newProduct.format,
                    format
                  ),
                });
              }}
            >
              <option value="capsule">Capsule</option>
              <option value="edible">Edible</option>
              <option value="dried">Dried</option>
              <option value="tincture">Tincture</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Strain">
            <Select
              value={newProduct.strainSlug}
              onChange={(e) => setNewProduct({ ...newProduct, strainSlug: e.target.value })}
            >
              <option value="">— none —</option>
              {strains.map((s) => (
                <option key={s.id} value={s.slug}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Inline "new brand" creator (full-width, below row 1) */}
        {showNewBrand && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 sm:max-w-72">
              <Input
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="New brand name"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={createBrand}>Create brand</Button>
              <Button
                variant="ghost"
                onClick={() => { setShowNewBrand(false); setNewBrandName(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Row 2: Dose */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Dose per unit">
            <div className="flex w-full items-center gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={newProduct.productUnitMg}
                  onChange={(e) => setNewProduct({ ...newProduct, productUnitMg: e.target.value })}
                />
              </div>
              <div className="w-20 shrink-0">
                <Select
                  value={newProduct.productUnitInUnit}
                  onChange={(e) => setNewProduct({ ...newProduct, productUnitInUnit: e.target.value as DoseUnit })}
                >
                  <option value="mg">mg</option>
                  <option value="g">g</option>
                </Select>
              </div>
            </div>
          </Field>
          <Field label="Units per package">
            <Input
              type="number"
              min="1"
              value={newProduct.unitsPerPack}
              onChange={(e) => setNewProduct({ ...newProduct, unitsPerPack: e.target.value })}
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-bark-700">Total dose</span>
            {!newProduct.totalDoseOverride ? (
              <div className="flex min-h-11 items-center gap-3 rounded-lg border border-dashed border-bone-300 bg-bone-100 px-3.5">
                <span className="flex-1 text-sm font-bold text-bark-800">{formatDose(computedNewTotal)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setNewProduct({
                      ...newProduct,
                      totalDoseOverride: true,
                      totalDoseMg: computedNewTotal ? String(computedNewTotal) : "",
                      totalDoseInUnit: computedNewTotal && computedNewTotal >= 1000 ? "g" : "mg",
                    })
                  }
                >
                  Edit
                </Button>
              </div>
            ) : (
              <div className="flex w-full items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Input
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
                  />
                </div>
                <div className="w-20 shrink-0">
                  <Select
                    value={newProduct.totalDoseInUnit}
                    onChange={(e) => setNewProduct({ ...newProduct, totalDoseInUnit: e.target.value as DoseUnit })}
                  >
                    <option value="mg">mg</option>
                    <option value="g">g</option>
                  </Select>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setNewProduct({ ...newProduct, totalDoseOverride: false, totalDoseMg: "" })
                  }
                >
                  Auto
                </Button>
              </div>
            )}
          </div>
          <Field label="Strength offset">
            <Select
              value={newProduct.strengthOffset}
              onChange={(e) =>
                setNewProduct({ ...newProduct, strengthOffset: e.target.value as StrengthOffset })
              }
            >
              <option value="standard">Standard</option>
              <option value="stronger">Hits Stronger</option>
              <option value="lighter">Hits Lighter</option>
            </Select>
          </Field>
        </div>

        {newProduct.strengthOffset !== "standard" && (
          <div className="mt-3">
            <Field label="Rationale" className="max-w-xl">
              <Input
                value={newProduct.strengthRationale}
                onChange={(e) => setNewProduct({ ...newProduct, strengthRationale: e.target.value })}
                placeholder="e.g. dense caps, hits harder than the printed dose"
              />
            </Field>
          </div>
        )}

        <div className="mt-5 border-t border-bone-200 pt-4">
          <strong className="text-sm font-semibold text-bark-700">Photos</strong>
          <div className={PHOTO_GRID_CLASSES}>
            {pendingPhotos.map((pp) => (
              <div
                key={pp.id}
                className={`flex flex-col items-stretch gap-1.5 rounded-lg border bg-bone-50 p-1.5 ${
                  pp.isPrimary ? "border-moss-500 ring-1 ring-moss-500" : "border-bone-300"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pp.previewUrl}
                  alt=""
                  className="h-20 w-full rounded-md bg-[repeating-conic-gradient(#e7e2d6_0_25%,#f5f2ea_0_50%)] bg-[length:16px_16px] object-contain"
                />
                <div className="flex items-center justify-between text-xs text-bark-400">
                  <span>{pp.tag}</span>
                  <span className="rounded bg-bone-200 px-1 py-0.5 text-[10px] font-medium text-bark-600">
                    {PHOTO_KIND_LABELS[pp.kind]}
                  </span>
                </div>
                <Button
                  variant={pp.isPrimary ? "secondary" : "ghost"}
                  size="sm"
                  disabled={pp.isPrimary}
                  onClick={() => setPendingPhotoPrimary(pp.id)}
                >
                  {pp.isPrimary ? "★ Primary" : "Set primary"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => removePendingPhoto(pp.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-bone-300 bg-bone-100 px-3 py-2.5">
            <div className="w-36 shrink-0">
              <Select
                value={pendingPhotoTag}
                onChange={(e) => setPendingPhotoTag(e.target.value as PhotoTag)}
              >
                {PHOTO_TAGS.map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ")}</option>
                ))}
              </Select>
            </div>
            <div className="w-36 shrink-0">
              <Select
                value={pendingPhotoKind}
                onChange={(e) => setPendingPhotoKind(e.target.value as PhotoKind)}
              >
                {PHOTO_KINDS.map((k) => (
                  <option key={k} value={k}>{PHOTO_KIND_LABELS[k]}</option>
                ))}
              </Select>
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) addPendingPhoto(f);
                e.target.value = "";
              }}
              className="min-w-0 text-sm text-bark-600 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border-0 file:bg-bone-200 file:px-3 file:text-sm file:font-medium file:text-bark-700"
            />
            <span className="text-xs text-moss-700 sm:ml-auto">Photos save when you click Create. If anything fails, you&apos;ll see an error.</span>
          </div>
        </div>

        {/* Ingredients & Stacks */}
        <div className="mt-5 border-t border-bone-200 pt-4">
          <strong className="text-sm font-semibold text-bark-700">Ingredients & Stacks</strong>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {newProduct.ingredients.length === 0 && (
              <span className="text-xs text-bark-400">No ingredients added yet</span>
            )}
            {newProduct.ingredients.map((ing) => (
              <span key={ing} className={INGREDIENT_PILL_CLASSES}>
                {ing}
                <button
                  type="button"
                  onClick={() =>
                    setNewProduct({
                      ...newProduct,
                      ingredients: newProduct.ingredients.filter((i) => i !== ing),
                    })
                  }
                  className={PILL_REMOVE_CLASSES}
                  aria-label={`Remove ${ing}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {COMMON_INGREDIENTS.map((quick) => {
              const alreadyAdded = newProduct.ingredients.some(
                (i) => i.toLowerCase() === quick.toLowerCase()
              );
              return (
                <Button
                  key={quick}
                  variant="secondary"
                  size="sm"
                  disabled={alreadyAdded}
                  onClick={() =>
                    setNewProduct({
                      ...newProduct,
                      ingredients: [...newProduct.ingredients, quick],
                    })
                  }
                  className="rounded-full"
                >
                  + {quick}
                </Button>
              );
            })}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <div className="min-w-0 flex-1 sm:max-w-72">
              <Input
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
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                const val = newIngredientInput.trim();
                if (val && !newProduct.ingredients.some((i) => i.toLowerCase() === val.toLowerCase())) {
                  setNewProduct({ ...newProduct, ingredients: [...newProduct.ingredients, val] });
                }
                setNewIngredientInput("");
              }}
            >
              Add
            </Button>
          </div>
        </div>

        {/* Flavors */}
        <div className="mt-5 border-t border-bone-200 pt-4">
          <strong className="text-sm font-semibold text-bark-700">Flavors (same recipe)</strong>
          <div className="mt-1 text-xs text-bark-400">
            List flavor variants that share this exact recipe (mint, raspberry, original). If a flavor has a different recipe, create a separate product instead — use the Duplicate button.
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {newProduct.flavors.length === 0 && (
              <span className="text-xs text-bark-400">No flavors added — single-flavor product</span>
            )}
            {newProduct.flavors.map((fl) => (
              <span key={fl} className={INGREDIENT_PILL_CLASSES}>
                {fl}
                <button
                  type="button"
                  onClick={() =>
                    setNewProduct({
                      ...newProduct,
                      flavors: newProduct.flavors.filter((f) => f !== fl),
                    })
                  }
                  className={PILL_REMOVE_CLASSES}
                  aria-label={`Remove ${fl}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <div className="min-w-0 flex-1 sm:max-w-72">
              <Input
                value={newFlavorInput}
                onChange={(e) => setNewFlavorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = newFlavorInput.trim();
                    if (val && !newProduct.flavors.some((f) => f.toLowerCase() === val.toLowerCase())) {
                      setNewProduct({ ...newProduct, flavors: [...newProduct.flavors, val] });
                    }
                    setNewFlavorInput("");
                  }
                }}
                placeholder="Add a flavor…"
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                const val = newFlavorInput.trim();
                if (val && !newProduct.flavors.some((f) => f.toLowerCase() === val.toLowerCase())) {
                  setNewProduct({ ...newProduct, flavors: [...newProduct.flavors, val] });
                }
                setNewFlavorInput("");
              }}
            >
              Add
            </Button>
          </div>
        </div>

        {/* Onset & Duration */}
        <div className="mt-5 border-t border-bone-200 pt-4">
          <strong className="text-sm font-semibold text-bark-700">Onset & Duration</strong>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Onset (minutes)" hint="How long until effects start?">
              <Input
                type="number"
                min="0"
                value={newProduct.onsetMinutes}
                onChange={(e) => setNewProduct({ ...newProduct, onsetMinutes: e.target.value })}
              />
            </Field>
            <Field label="Duration (hours)" hint="Total experience length">
              <Input
                type="number"
                min="0"
                step="0.25"
                value={newProduct.durationMinutes}
                onChange={(e) => setNewProduct({ ...newProduct, durationMinutes: e.target.value })}
              />
            </Field>
          </div>
        </div>

        {/* Brand's Recommended Dose Tiers */}
        <div className="mt-5 border-t border-bone-200 pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNewBrandTiersOpen((v) => !v)}
          >
            {newBrandTiersOpen ? "Hide" : "Show"} Brand Dose Tiers
          </Button>
          {newBrandTiersOpen && (
            <BrandDoseTierEditor
              tiers={newProduct.brandDoseTiers}
              instructions={newProduct.brandDoseInstructions}
              defaultUnit={unitForFormat(newProduct.format)}
              onChange={(brandDoseTiers) => setNewProduct({ ...newProduct, brandDoseTiers })}
              onInstructionsChange={(brandDoseInstructions) =>
                setNewProduct({ ...newProduct, brandDoseInstructions })
              }
            />
          )}
        </div>

        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => setNewVibeOpen((v) => !v)}>
            {newVibeOpen ? "Hide" : "Show"} Effect Profile
          </Button>
          {newVibeOpen && (
            <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
              {VIBE_DIMENSIONS.map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="text-xs font-semibold text-bark-700">{label}</span>
                  <span className="mt-1 flex items-center gap-3">
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={newVibe[key]}
                      onChange={(e) => setNewVibe({ ...newVibe, [key]: Number(e.target.value) })}
                      className="h-6 w-full min-w-0 accent-moss-600"
                    />
                    <span className="w-10 shrink-0 text-right text-xs text-bark-400">{newVibe[key].toFixed(2)}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          <Button
            onClick={createProduct}
            disabled={saving || !newProduct.productName || !newProduct.productUnitMg}
            className="w-full sm:w-auto"
          >
            {saving ? "Adding..." : "Add Product"}
          </Button>
        </div>
      </Card>

      <Card className="mb-6">
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-bark-800">Product Catalog</h2>
              {(() => {
                // Full in-memory catalog, never a paginated subset (BUG_LOG lesson)
                const activeOnes = products.filter((p) => p.active && !p.archivedAt);
                const readyCount = activeOnes.filter((p) => p.readiness?.ready).length;
                const needsWork = activeOnes.length - readyCount;
                return (
                  <div className={`mt-0.5 text-xs ${needsWork > 0 ? "text-amber-700" : "text-moss-700"}`}>
                    {readyCount} of {activeOnes.length} active products recommendation-ready
                    {needsWork > 0 ? ` — ${needsWork} need${needsWork === 1 ? "s" : ""} attention` : " ✓"}
                  </div>
                );
              })()}
            </div>
            <div className="w-full sm:w-52 sm:shrink-0">
              <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="updatedAt">Recently updated</option>
                <option value="productName">Name</option>
                <option value="format">Format</option>
                <option value="brand">Brand</option>
                <option value="active">Status</option>
              </Select>
            </div>
          </div>
          <FilterTabs
            tabs={PRODUCT_FILTER_TABS}
            value={filter}
            onChange={(next) => {
              setFilter(next);
              loadData(partner.id, next === "archived");
            }}
          />
        </div>
        {visibleProducts.length === 0 ? (
          <EmptyState icon="leaf" title="No products match this filter" />
        ) : (
          <div className="flex flex-col gap-3">
            {visibleProducts.map((product) => {
              const draft = rowDrafts[product.id] ?? {
                strengthOffset: "standard" as StrengthOffset,
                strengthRationale: "",
                vibe: emptyVibe(),
                vibeOpen: false,
              };
              const brandName = product.brandRef?.name || product.brand || "No brand";
              const productBrandDoseTiers = normalizeBrandDoseTiers(product);
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
                <div key={product.id} className="rounded-xl border border-bone-200 bg-bone-100/70 p-3 sm:p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <label className="flex min-h-11 items-center justify-center">
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
                        className="size-5 accent-moss-600"
                      />
                    </label>
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {product.photos?.[0]?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.photos[0].url} alt="" className="size-14 shrink-0 rounded-lg bg-bone-200 object-cover" />
                      ) : product.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.photoUrl} alt="" className="size-14 shrink-0 rounded-lg bg-bone-200 object-cover" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(product)}
                          title="No photo yet — click to add one"
                          className="flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-amber-400 bg-amber-100 p-1 text-center text-[0.7rem] font-semibold leading-tight text-amber-800"
                        >
                          📷<br/>Add photo
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-bark-800">
                          {product.productName}
                          {isArchived && (
                            <Badge tone="warning" className="ml-2 align-middle">
                              Archived
                            </Badge>
                          )}
                          {!isArchived && product.readiness && (
                            <span
                              className="ml-2 align-middle"
                              title={
                                product.readiness.ready
                                  ? "All set — this product can be recommended to customers"
                                  : `Missing: ${product.readiness.missing.join(", ")}`
                              }
                            >
                              <Badge tone={product.readiness.ready ? "success" : "warning"} className="rounded-full">
                                {product.readiness.ready
                                  ? "✅ Ready"
                                  : `⚠️ ${product.readiness.missing.length} missing`}
                              </Badge>
                            </span>
                          )}
                          {!isArchived && product.confidence && (
                            <span
                              className="ml-1.5 align-middle"
                              title="How well-understood this product is, from tester reports (admin-only)"
                            >
                              <Badge tone={CONFIDENCE_BADGES[product.confidence].tone} className="rounded-full">
                                {CONFIDENCE_BADGES[product.confidence].label}
                              </Badge>
                            </span>
                          )}
                        </div>
                        {!isArchived && product.readiness && !product.readiness.ready && (
                          <div className="mt-0.5 text-xs text-amber-800">
                            Still needed: {product.readiness.missing.join(", ")}
                          </div>
                        )}
                        {!isArchived && product.readiness && product.readiness.warnings.length > 0 && (
                          <div className="mt-0.5 text-xs text-amber-700">
                            {product.readiness.warnings.map((w) => (
                              <div key={w}>⚠ {w}</div>
                            ))}
                          </div>
                        )}
                        <div className="mt-0.5 text-xs text-bark-400">
                          {brandName} • {product.format}
                          {product.strainSlug ? ` • ${product.strainSlug}` : ""}
                        </div>
                        <div className="mt-0.5 text-xs text-bark-400">
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
                          product.flavors?.length ||
                          product.onsetMinutes ||
                          product.durationMinutes ||
                          productBrandDoseTiers.length ||
                          product.brandDoseInstructions) ? (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-bark-400">
                            {product.ingredients?.map((ing) => (
                              <span key={ing} className={READONLY_PILL_CLASSES}>{ing}</span>
                            ))}
                            {product.flavors?.length ? (
                              <span className="inline-flex flex-wrap items-center gap-1">
                                <span className="text-[0.7rem] font-semibold text-moss-700">FLAVORS:</span>
                                {product.flavors.map((fl) => (
                                  <span key={fl} className="inline-flex items-center rounded-full bg-clay-50 px-2 py-0.5 text-[0.72rem] font-semibold text-clay-700">{fl}</span>
                                ))}
                              </span>
                            ) : null}
                            {(product.onsetMinutes || product.durationMinutes) && (
                              <span>
                                {product.onsetMinutes ? `Onset: ${formatDuration(product.onsetMinutes)}` : ""}
                                {product.onsetMinutes && product.durationMinutes ? " • " : ""}
                                {product.durationMinutes ? `Duration: ${formatDuration(product.durationMinutes)}` : ""}
                              </span>
                            )}
                            {productBrandDoseTiers.length > 0 && (
                              <span>Brand: {productBrandDoseTiers.map(formatBrandDoseTier).join(" / ")}</span>
                            )}
                            {product.brandDoseInstructions && (
                              <span>Instructions: {product.brandDoseInstructions}</span>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
                      {!isArchived && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            const url = `${window.location.origin}/t/${product.id}`;
                            try {
                              await navigator.clipboard.writeText(url);
                              const shareText = `Try ${product.productName} and give me your feedback: ${url}`;
                              // Try native share on mobile, fall back to clipboard-only
                              if (navigator.share) {
                                try { await navigator.share({ title: product.productName, text: shareText, url }); } catch {}
                              }
                              alert(`Tester link copied!\n\n${url}\n\nText or AirDrop it to anyone who's tried this product.`);
                            } catch {
                              prompt("Copy this tester link:", url);
                            }
                          }}
                          className="bg-gradient-to-br from-moss-600 to-lichen-600 font-semibold hover:from-moss-700 hover:to-lichen-700"
                        >
                          🔗 Get tester link
                          {product._count && product._count.testerVotes > 0 && (
                            <span className="rounded-full bg-bone-50/25 px-1.5 py-px text-[0.7rem]">
                              {product._count.testerVotes} {product._count.testerVotes === 1 ? "vote" : "votes"}
                            </span>
                          )}
                        </Button>
                      )}
                      {isArchived ? (
                        <Button variant="secondary" size="sm" onClick={() => unarchiveProduct(product.id)}>
                          Unarchive
                        </Button>
                      ) : isEditing ? null : (
                        <>
                          <Button variant="secondary" size="sm" onClick={() => startEdit(product)}>
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => duplicateProduct(product.id)}
                            title="Duplicate this product (e.g. for a different flavor recipe)"
                          >
                            Duplicate
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => archiveProduct(product.id)}>
                            Archive
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {!isArchived && <EmployeeReviewPanel product={product} />}

                  {isEditing && editDraft && (
                    <Modal
                      open
                      onClose={cancelEdit}
                      title="Edit Product"
                      wide
                      footer={
                        <>
                          <Button variant="secondary" onClick={cancelEdit}>Cancel</Button>
                          <Button onClick={() => saveEdit(product.id)}>Save</Button>
                        </>
                      }
                    >
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Product name">
                          <Input
                            value={editDraft.productName}
                            onChange={(e) => setEditDraft({ ...editDraft, productName: e.target.value })}
                          />
                        </Field>
                        <Field label="Brand">
                          <Select
                            value={editDraft.brandId}
                            onChange={(e) => setEditDraft({ ...editDraft, brandId: e.target.value })}
                          >
                            <option value="">— Unspecified —</option>
                            {brands.map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Format">
                          <Select
                            value={editDraft.format}
                            onChange={(e) => {
                              const format = e.target.value;
                              setEditDraft({
                                ...editDraft,
                                format,
                                brandDoseTiers: retargetDefaultTierUnits(
                                  editDraft.brandDoseTiers,
                                  editDraft.format,
                                  format
                                ),
                              });
                            }}
                          >
                            <option value="capsule">Capsule</option>
                            <option value="edible">Edible</option>
                            <option value="dried">Dried</option>
                            <option value="tincture">Tincture</option>
                            <option value="other">Other</option>
                          </Select>
                        </Field>
                        <Field label="Strain">
                          <Select
                            value={editDraft.strainSlug}
                            onChange={(e) => setEditDraft({ ...editDraft, strainSlug: e.target.value })}
                          >
                            <option value="">— none —</option>
                            {strains.map((s) => (
                              <option key={s.id} value={s.slug}>{s.name}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Dose per unit">
                          <div className="flex w-full items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={editDraft.productUnitMg}
                                onChange={(e) => setEditDraft({ ...editDraft, productUnitMg: e.target.value })}
                              />
                            </div>
                            <div className="w-20 shrink-0">
                              <Select
                                value={editDraft.productUnitInUnit}
                                onChange={(e) => setEditDraft({ ...editDraft, productUnitInUnit: e.target.value as DoseUnit })}
                              >
                                <option value="mg">mg</option>
                                <option value="g">g</option>
                              </Select>
                            </div>
                          </div>
                        </Field>
                        <Field label="Units per package">
                          <Input
                            type="number"
                            min="1"
                            value={editDraft.unitsPerPack}
                            onChange={(e) => setEditDraft({ ...editDraft, unitsPerPack: e.target.value })}
                          />
                        </Field>
                        <div>
                          <span className="mb-1.5 block text-sm font-medium text-bark-700">Total dose</span>
                          {!editDraft.totalDoseOverride ? (
                            <div className="flex min-h-11 items-center gap-3 rounded-lg border border-dashed border-bone-300 bg-bone-100 px-3.5">
                              <span className="flex-1 text-sm font-bold text-bark-800">
                                {formatDose(editComputedTotal)}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
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
                              >
                                Edit total
                              </Button>
                            </div>
                          ) : (
                            <div className="flex w-full items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={editDraft.totalDoseMg}
                                  onChange={(e) => setEditDraft({ ...editDraft, totalDoseMg: e.target.value })}
                                />
                              </div>
                              <div className="w-20 shrink-0">
                                <Select
                                  value={editDraft.totalDoseInUnit}
                                  onChange={(e) => setEditDraft({ ...editDraft, totalDoseInUnit: e.target.value as DoseUnit })}
                                >
                                  <option value="mg">mg</option>
                                  <option value="g">g</option>
                                </Select>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setEditDraft({ ...editDraft, totalDoseOverride: false, totalDoseMg: "" })
                                }
                              >
                                Auto
                              </Button>
                            </div>
                          )}
                        </div>
                        {/* Ingredients & Stacks (edit) */}
                        <div className="border-t border-bone-200 pt-3 sm:col-span-2">
                          <strong className="text-sm font-semibold text-bark-700">Ingredients & Stacks</strong>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {editDraft.ingredients.length === 0 && (
                              <span className="text-xs text-bark-400">No ingredients</span>
                            )}
                            {editDraft.ingredients.map((ing) => (
                              <span key={ing} className={INGREDIENT_PILL_CLASSES}>
                                {ing}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditDraft({
                                      ...editDraft,
                                      ingredients: editDraft.ingredients.filter((i) => i !== ing),
                                    })
                                  }
                                  className={PILL_REMOVE_CLASSES}
                                  aria-label={`Remove ${ing}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {COMMON_INGREDIENTS.map((quick) => {
                              const alreadyAdded = editDraft.ingredients.some(
                                (i) => i.toLowerCase() === quick.toLowerCase()
                              );
                              return (
                                <Button
                                  key={quick}
                                  variant="secondary"
                                  size="sm"
                                  disabled={alreadyAdded}
                                  onClick={() =>
                                    setEditDraft({
                                      ...editDraft,
                                      ingredients: [...editDraft.ingredients, quick],
                                    })
                                  }
                                  className="rounded-full"
                                >
                                  + {quick}
                                </Button>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="min-w-0 flex-1 sm:max-w-72">
                              <Input
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
                              />
                            </div>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                const val = editIngredientInput.trim();
                                if (val && !editDraft.ingredients.some((i) => i.toLowerCase() === val.toLowerCase())) {
                                  setEditDraft({ ...editDraft, ingredients: [...editDraft.ingredients, val] });
                                }
                                setEditIngredientInput("");
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        </div>

                        {/* Flavors (edit) */}
                        <div className="border-t border-bone-200 pt-3 sm:col-span-2">
                          <strong className="text-sm font-semibold text-bark-700">Flavors (same recipe)</strong>
                          <div className="mt-0.5 text-xs text-bark-400">
                            Same recipe, different flavors. For different recipes, use Duplicate.
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {editDraft.flavors.length === 0 && (
                              <span className="text-xs text-bark-400">No flavors — single-flavor product</span>
                            )}
                            {editDraft.flavors.map((fl) => (
                              <span key={fl} className={INGREDIENT_PILL_CLASSES}>
                                {fl}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditDraft({
                                      ...editDraft,
                                      flavors: editDraft.flavors.filter((f) => f !== fl),
                                    })
                                  }
                                  className={PILL_REMOVE_CLASSES}
                                  aria-label={`Remove ${fl}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="min-w-0 flex-1 sm:max-w-60">
                              <Input
                                value={editFlavorInput}
                                onChange={(e) => setEditFlavorInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const val = editFlavorInput.trim();
                                    if (val && !editDraft.flavors.some((f) => f.toLowerCase() === val.toLowerCase())) {
                                      setEditDraft({ ...editDraft, flavors: [...editDraft.flavors, val] });
                                    }
                                    setEditFlavorInput("");
                                  }
                                }}
                                placeholder="Add a flavor…"
                              />
                            </div>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                const val = editFlavorInput.trim();
                                if (val && !editDraft.flavors.some((f) => f.toLowerCase() === val.toLowerCase())) {
                                  setEditDraft({ ...editDraft, flavors: [...editDraft.flavors, val] });
                                }
                                setEditFlavorInput("");
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        </div>

                        {/* Onset & Duration (edit) */}
                        <Field label="Onset (minutes)" hint="How long until effects start?">
                          <Input
                            type="number"
                            min="0"
                            value={editDraft.onsetMinutes}
                            onChange={(e) => setEditDraft({ ...editDraft, onsetMinutes: e.target.value })}
                          />
                        </Field>
                        <Field label="Duration (hours)" hint="Total experience length">
                          <Input
                            type="number"
                            min="0"
                            step="0.25"
                            value={editDraft.durationMinutes}
                            onChange={(e) => setEditDraft({ ...editDraft, durationMinutes: e.target.value })}
                          />
                        </Field>

                        {/* Brand Dose Tiers (edit) */}
                        <div className="border-t border-bone-200 pt-3 sm:col-span-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditBrandTiersOpen((v) => !v)}
                          >
                            {editBrandTiersOpen ? "Hide" : "Show"} Brand Dose Tiers
                          </Button>
                          {editBrandTiersOpen && (
                            <BrandDoseTierEditor
                              tiers={editDraft.brandDoseTiers}
                              instructions={editDraft.brandDoseInstructions}
                              defaultUnit={unitForFormat(editDraft.format)}
                              onChange={(brandDoseTiers) => setEditDraft({ ...editDraft, brandDoseTiers })}
                              onInstructionsChange={(brandDoseInstructions) =>
                                setEditDraft({ ...editDraft, brandDoseInstructions })
                              }
                            />
                          )}
                        </div>

                        {/* Photos (edit) — kept reachable while the modal covers the card */}
                        <div className="border-t border-bone-200 pt-3 sm:col-span-2">
                          <strong className="text-sm font-semibold text-bark-700">Photos</strong>
                          <div className={PHOTO_GRID_CLASSES}>
                            {product.photos?.map((photo) => (
                              <div
                                key={photo.id}
                                className={`flex flex-col items-stretch gap-1.5 rounded-lg border bg-bone-50 p-1.5 ${
                                  photo.isPrimary ? "border-moss-500 ring-1 ring-moss-500" : "border-bone-300"
                                }`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={photo.url} alt="" className="h-20 w-full rounded-md bg-[repeating-conic-gradient(#e7e2d6_0_25%,#f5f2ea_0_50%)] bg-[length:16px_16px] object-contain" />
                                <div className="text-center text-[10px] font-medium text-bark-500">
                                  {PHOTO_KIND_LABELS[photo.kind]}
                                </div>
                                <Select
                                  value={photo.tag}
                                  onChange={(e) => updatePhotoTag(product.id, photo.id, e.target.value as PhotoTag)}
                                >
                                  {PHOTO_TAGS.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </Select>
                                <Button
                                  variant={photo.isPrimary ? "secondary" : "ghost"}
                                  size="sm"
                                  disabled={photo.isPrimary}
                                  onClick={() => updatePhotoPrimary(product.id, photo.id)}
                                >
                                  {photo.isPrimary ? "★ Primary" : "Set primary"}
                                </Button>
                                <Button
                                  variant="danger-ghost"
                                  size="sm"
                                  onClick={() => deletePhoto(product.id, photo.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            ))}
                          </div>
                          <PhotoUploader productId={product.id} onUpload={uploadExistingProductPhoto} />
                        </div>
                      </div>
                    </Modal>
                  )}

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="sm:w-40 sm:shrink-0">
                      <Select
                        value={draft.strengthOffset}
                        onChange={(e) => updateDraft(product.id, "strengthOffset", e.target.value)}
                      >
                        <option value="standard">Standard</option>
                        <option value="stronger">Hits Stronger</option>
                        <option value="lighter">Hits Lighter</option>
                      </Select>
                    </div>
                    <div className="min-w-0 sm:flex-1">
                      <Input
                        value={draft.strengthRationale}
                        onChange={(e) => updateDraft(product.id, "strengthRationale", e.target.value)}
                        disabled={draft.strengthOffset === "standard"}
                        placeholder={draft.strengthOffset === "standard" ? "" : "dense caps, dense effects"}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          patchProduct(
                            product.id,
                            {
                              strengthOffset: draft.strengthOffset,
                              strengthRationale: draft.strengthRationale,
                            },
                            "Strength offset saved — remember to confirm it"
                          )
                        }
                      >
                        Save
                      </Button>
                      {product.strengthOffset?.confirmed ? (
                        <span
                          title={product.strengthOffset.confirmedBy ? `Confirmed by ${product.strengthOffset.confirmedBy}` : "Confirmed"}
                        >
                          <Badge tone="success" className="whitespace-nowrap rounded-full">
                            ✓ Confirmed
                          </Badge>
                        </span>
                      ) : (
                        <button
                          type="button"
                          title="Confirm you've reviewed this strength offset — required for the product to be recommendation-ready"
                          onClick={() =>
                            patchProduct(
                              product.id,
                              {
                                strengthOffset: draft.strengthOffset,
                                strengthRationale: draft.strengthRationale,
                                strengthConfirmed: true,
                              },
                              "Strength offset confirmed"
                            )
                          }
                          className="inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border border-amber-400 bg-bone-50 px-3 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50"
                        >
                          Confirm offset
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    <strong className="text-sm font-semibold text-bark-700">Photos</strong>
                    <div className={PHOTO_GRID_CLASSES}>
                      {product.photos?.map((photo) => (
                        <div
                          key={photo.id}
                          className={`flex flex-col items-stretch gap-1.5 rounded-lg border bg-bone-50 p-1.5 ${
                            photo.isPrimary ? "border-moss-500 ring-1 ring-moss-500" : "border-bone-300"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.url} alt="" className="h-20 w-full rounded-md bg-[repeating-conic-gradient(#e7e2d6_0_25%,#f5f2ea_0_50%)] bg-[length:16px_16px] object-contain" />
                          <div className="text-center text-[10px] font-medium text-bark-500">
                            {PHOTO_KIND_LABELS[photo.kind]}
                          </div>
                          <Select
                            value={photo.tag}
                            onChange={(e) => updatePhotoTag(product.id, photo.id, e.target.value as PhotoTag)}
                          >
                            {PHOTO_TAGS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </Select>
                          {product.flavors?.length > 0 && (
                            <Select
                              value={photo.flavor ?? ""}
                              onChange={(e) => updatePhotoFlavor(product.id, photo.id, e.target.value)}
                            >
                              <option value="">All flavors</option>
                              {product.flavors.map((f) => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </Select>
                          )}
                          <Button
                            variant={photo.isPrimary ? "secondary" : "ghost"}
                            size="sm"
                            disabled={photo.isPrimary}
                            onClick={() => updatePhotoPrimary(product.id, photo.id)}
                          >
                            {photo.isPrimary ? "★ Primary" : "Set primary"}
                          </Button>
                          <Button
                            variant="danger-ghost"
                            size="sm"
                            onClick={() => deletePhoto(product.id, photo.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ))}
                    </div>
                    <PhotoUploader productId={product.id} onUpload={uploadExistingProductPhoto} />
                  </div>

                  <div className="mt-3">
                    <Button variant="ghost" size="sm" onClick={() => toggleDraftVibeOpen(product.id)}>
                      {draft.vibeOpen ? "Hide" : "Show"} Effect Profile
                    </Button>
                    {draft.vibeOpen && (
                      <>
                        <div className="my-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                          {VIBE_DIMENSIONS.map(({ key, label }) => {
                            const communityValue = product.community?.scores?.[key];
                            const delta =
                              typeof communityValue === "number"
                                ? communityValue - draft.vibe[key]
                                : null;
                            return (
                              <label key={key} className="block">
                                <span className="text-xs font-semibold text-bark-700">{label}</span>
                                <span className="mt-1 flex items-center gap-3">
                                  <input
                                    type="range"
                                    min={-1}
                                    max={1}
                                    step={0.05}
                                    value={draft.vibe[key]}
                                    onChange={(e) => updateDraftVibe(product.id, key, Number(e.target.value))}
                                    className="h-6 w-full min-w-0 accent-moss-600"
                                  />
                                  <span className="shrink-0 whitespace-nowrap text-right text-xs text-bark-400">
                                    {draft.vibe[key].toFixed(2)}
                                    {typeof communityValue === "number" && (
                                      <span
                                        title={`Community average from ${product.community?.voteCount ?? 0} tester reports`}
                                        className={
                                          delta !== null && Math.abs(delta) >= 0.3
                                            ? "ml-1.5 font-bold text-amber-700"
                                            : "ml-1.5 text-bark-400"
                                        }
                                      >
                                        👥 {communityValue.toFixed(2)}
                                      </span>
                                    )}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              patchProduct(product.id, { vibeScores: draft.vibe }, "Effects saved")
                            }
                          >
                            Save Effects
                          </Button>
                          {product.community?.scores && (
                            <button
                              type="button"
                              title="Replace the admin profile with the community average from tester reports"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Replace this product's effect profile with the community average from ${product.community?.voteCount} tester report${product.community?.voteCount === 1 ? "" : "s"}?`
                                  )
                                ) {
                                  patchProduct(
                                    product.id,
                                    { acceptCommunityVibe: true },
                                    "Community profile adopted"
                                  );
                                }
                              }}
                              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-moss-300 bg-bone-50 px-3 text-sm font-medium text-moss-700 transition-colors hover:bg-moss-50"
                            >
                              👥 Accept community profile (n={product.community.voteCount})
                            </button>
                          )}
                          {product.vibeProfile?.source === "flywheel" && (
                            <span className="text-xs text-moss-700">
                              Current profile sourced from community feedback
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function PhotoUploader({
  productId,
  onUpload,
}: {
  productId: string;
  onUpload: (productId: string, file: File, tag: PhotoTag, kind: PhotoKind) => Promise<void>;
}) {
  const [tag, setTag] = useState<PhotoTag>("stock");
  const [kind, setKind] = useState<PhotoKind>("source");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <div className="w-36 shrink-0">
        <Select value={tag} onChange={(e) => setTag(e.target.value as PhotoTag)}>
          {PHOTO_TAGS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </div>
      <div className="w-36 shrink-0">
        <Select value={kind} onChange={(e) => setKind(e.target.value as PhotoKind)}>
          {PHOTO_KINDS.map((k) => (
            <option key={k} value={k}>{PHOTO_KIND_LABELS[k]}</option>
          ))}
        </Select>
      </div>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await onUpload(productId, f, tag, kind);
          e.target.value = "";
        }}
        className="min-w-0 text-sm text-bark-600 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border-0 file:bg-bone-200 file:px-3 file:text-sm file:font-medium file:text-bark-700"
      />
    </div>
  );
}

function EmployeeReviewPanel({
  product,
}: {
  product: Pick<Product, "id" | "productName" | "employeeReviews">;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<EmployeeReviewPanelData | null>(
    product.employeeReviews
      ? {
          assignments: [],
          participation: product.employeeReviews.participation,
          guidance: product.employeeReviews.guidance,
        }
      : null
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [lastLinks, setLastLinks] = useState<{ email: string; link: string | null; sent?: boolean; error?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadReviews() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/myco/${product.id}/employee-reviews`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "Failed to load employee reviews");
      setData(json.data as EmployeeReviewPanelData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employee reviews");
    } finally {
      setLoading(false);
    }
  }

  async function openPanel() {
    const next = !open;
    setOpen(next);
    if (next) await loadReviews();
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      prompt("Copy this review link:", text);
    }
  }

  async function assignEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/myco/${product.id}/employee-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employees: [{ name, email }], send: sendEmail }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "Failed to assign employee");
      const assignments = (json.data.assignments || []) as { email: string; link: string | null; sent?: boolean; error?: string }[];
      setLastLinks(assignments);
      if (assignments.some((assignment) => assignment.link)) {
        setName("");
        setEmail("");
      }
      await loadReviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign employee");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateLink(assignment: EmployeeReviewAssignment, sendNow = false) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/myco/${product.id}/employee-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employees: [{ name: assignment.employee.name, email: assignment.employee.email }],
          send: sendNow,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "Failed to create review link");
      const result = json.data.assignments?.[0] as { email: string; link: string | null; sent?: boolean; error?: string } | undefined;
      if (result) {
        setLastLinks([result]);
        if (result.link && !sendNow) await copyText(result.link);
      }
      await loadReviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create review link");
    } finally {
      setSaving(false);
    }
  }

  const participation = data?.participation ?? product.employeeReviews?.participation;
  const guidance = data?.guidance ?? product.employeeReviews?.guidance;

  return (
    <div className="mt-3 rounded-lg border border-bone-200 bg-bone-50/70 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-bark-800">Employee guidance</div>
          <div className="mt-0.5 text-xs text-bark-500">
            {participation
              ? `${participation.submitted} submitted, ${participation.notFamiliar} not familiar, ${participation.noResponse} no response`
              : "No employee assignments loaded"}
            {guidance ? ` • ${guidance.sampleSize} known-product sample${guidance.sampleSize === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={openPanel} loading={loading}>
          {open ? "Hide" : "Manage"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-bone-100 p-2 text-xs text-bark-500">
              <div className="text-base font-bold text-bark-800">{participation?.responseRate ?? 0}%</div>
              Response rate
            </div>
            <div className="rounded-lg bg-bone-100 p-2 text-xs text-bark-500">
              <div className="text-base font-bold text-bark-800">{participation?.noResponse ?? 0}</div>
              No response
            </div>
            <div className="rounded-lg bg-bone-100 p-2 text-xs text-bark-500">
              <div className="text-base font-bold text-bark-800">{participation?.notFamiliar ?? 0}</div>
              Not familiar
            </div>
            <div className="rounded-lg bg-bone-100 p-2 text-xs text-bark-500">
              <div className="text-base font-bold text-bark-800">{participation?.overdue ?? 0}</div>
              Overdue
            </div>
          </div>

          {guidance && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-bark-500">
              <Badge tone={CONFIDENCE_BADGES[guidance.confidence].tone} className="rounded-full">
                {CONFIDENCE_BADGES[guidance.confidence].label}
              </Badge>
              <span>
                Employee aggregate {guidance.recommendationReady ? "meets" : "does not meet"} recommendation evidence rules
                {guidance.spread !== null ? ` • spread ${guidance.spread}` : ""}
              </span>
            </div>
          )}

          <form onSubmit={assignEmployee} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_auto]">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Employee name" required />
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="employee@example.com" required />
            <Button type="submit" size="sm" loading={saving} disabled={!name.trim() || !email.trim()}>
              Assign
            </Button>
            <label className="flex items-center gap-2 text-xs text-bark-500 sm:col-span-3">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 rounded border-bone-300"
              />
              Email the review link now
            </label>
          </form>

          {lastLinks.length > 0 && (
            <div className="space-y-1 rounded-lg border border-bone-200 bg-bone-100 p-2 text-xs">
              {lastLinks.map((assignment) => (
                <div key={`${assignment.email}-${assignment.link || assignment.error}`} className="flex flex-col gap-1 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 text-bark-600">
                    {assignment.email}: {assignment.error || assignment.link || "No link created"}
                    {assignment.sent ? " (emailed)" : ""}
                  </span>
                  {assignment.link && (
                    <Button variant="ghost" size="sm" onClick={() => copyText(assignment.link!)}>
                      Copy
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {data?.assignments.length ? (
            <div className="overflow-hidden rounded-lg border border-bone-200">
              {data.assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="grid gap-2 border-b border-bone-200 p-2 text-xs last:border-b-0 sm:grid-cols-[minmax(0,1.25fr)_auto_auto]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-bark-800">{assignment.employee.name}</div>
                    <div className="truncate text-bark-500">{assignment.employee.email}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        assignment.status === "submitted"
                          ? "success"
                          : assignment.status === "not_familiar"
                            ? "info"
                            : assignment.status === "overdue" || assignment.status === "expired"
                              ? "warning"
                              : "neutral"
                      }
                      className="rounded-full"
                    >
                      {assignment.status.replace("_", " ")}
                    </Badge>
                    <span className="text-bark-400">
                      {assignment.employee.points} pts • streak {assignment.employee.streak}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => regenerateLink(assignment)}
                      loading={saving}
                      disabled={assignment.status === "submitted" || assignment.status === "not_familiar"}
                    >
                      Copy link
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => regenerateLink(assignment, true)}
                      loading={saving}
                      disabled={assignment.status === "submitted" || assignment.status === "not_familiar"}
                    >
                      Email
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-bone-300 p-3 text-sm text-bark-500">
              No employees assigned to this product yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BrandDoseTierEditor({
  tiers,
  instructions,
  defaultUnit,
  onChange,
  onInstructionsChange,
}: {
  tiers: BrandDoseTierDraft[];
  instructions: string;
  defaultUnit: string;
  onChange: (tiers: BrandDoseTierDraft[]) => void;
  onInstructionsChange: (instructions: string) => void;
}) {
  function updateTier(id: string, patch: Partial<BrandDoseTierDraft>) {
    onChange(tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)));
  }

  function addTier() {
    onChange([...tiers, makeBrandDoseTier("custom", "", defaultUnit)]);
  }

  function removeTier(id: string) {
    onChange(tiers.filter((tier) => tier.id !== id));
  }

  return (
    <div className="mt-2 flex flex-col gap-4">
      <p className="m-0 text-xs text-bark-400">
        Enter the brand&apos;s packaging guidance. Quantity accepts whole, half, quarter, and range values like 1/2, 0.5-1, or 1-3.
      </p>
      {tiers.map((tier) => (
        <div
          key={tier.id}
          className="grid grid-cols-1 gap-3 rounded-lg border border-bone-200 bg-bone-100/60 p-3 sm:grid-cols-2 lg:grid-cols-[110px_minmax(0,1fr)_minmax(0,0.75fr)_minmax(0,0.55fr)_auto] lg:items-end lg:border-0 lg:bg-transparent lg:p-0"
        >
          <Field label="Category">
            <Select
              value={tier.category}
              onChange={(e) => updateTier(tier.id, { category: e.target.value as BrandDoseCategory })}
            >
              {Object.entries(BRAND_DOSE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Brand label">
            <Input
              value={tier.label}
              onChange={(e) => updateTier(tier.id, { label: e.target.value })}
              placeholder="Enlightening"
            />
          </Field>
          <Field label="Quantity or range">
            <Input
              value={tier.quantityText}
              onChange={(e) => updateTier(tier.id, { quantityText: e.target.value })}
              placeholder="1/2 or 1-3"
            />
          </Field>
          <Field label="Unit">
            <Input
              value={tier.unit}
              onChange={(e) => updateTier(tier.id, { unit: e.target.value })}
              placeholder={defaultUnit}
            />
          </Field>
          <Button
            variant="danger-ghost"
            size="sm"
            onClick={() => removeTier(tier.id)}
            className="justify-self-start sm:col-span-2 lg:col-span-1 lg:mb-1"
          >
            Remove
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={addTier} className="self-start">
        Add tier
      </Button>
      <Field label="Additional Brand Dose Instructions">
        <Textarea
          value={instructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          rows={3}
          placeholder="1 day on, 2 days off; take on a light stomach"
        />
      </Field>
    </div>
  );
}
