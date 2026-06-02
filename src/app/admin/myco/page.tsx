"use client";

import type { ChangeEvent, CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

type StrengthOffset = "standard" | "stronger" | "lighter";
type ProductFilter = "all" | "active" | "inactive";
type SortKey = "productName" | "format" | "brand" | "active" | "updatedAt";

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

interface Product {
  id: string;
  productName: string;
  format: string;
  brand: string | null;
  strainSlug: string | null;
  productUnitMg: number | null;
  photoUrl: string | null;
  active: boolean;
  updatedAt: string;
  strengthOffset: {
    offset: StrengthOffset;
    rationale: string | null;
  } | null;
}

const emptyProduct = {
  productName: "",
  format: "capsule",
  brand: "",
  strainSlug: "",
  productUnitMg: "",
  photoUrl: "",
  strengthOffset: "standard" as StrengthOffset,
  strengthRationale: "",
};

export default function MycoAdminPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [settings, setSettings] = useState({
    name: "",
    subdomain: "",
    contactEmail: "",
    contactPhone: "",
    contactWebsite: "",
    mycoWelcomeMessage: "",
  });
  const [newProduct, setNewProduct] = useState(emptyProduct);
  const [rowDrafts, setRowDrafts] = useState<Record<string, { strengthOffset: StrengthOffset; strengthRationale: string }>>({});

  useEffect(() => {
    loadData();
  }, []);

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

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      if (filter === "active") return product.active;
      if (filter === "inactive") return !product.active;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === "active") return Number(b.active) - Number(a.active);
      if (sortKey === "updatedAt") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return String(a[sortKey] || "").localeCompare(String(b[sortKey] || ""));
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

  async function uploadPhoto(): Promise<string | null> {
    if (!photoFile) return newProduct.photoUrl || null;

    const formData = new FormData();
    formData.append("file", photoFile);
    formData.append("productName", newProduct.productName);

    const res = await fetch("/api/admin/myco/photo", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error?.message || "Failed to upload product photo");
    }

    return data.data.url;
  }

  async function createProduct() {
    if (!partner) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const photoUrl = await uploadPhoto();
      const res = await fetch("/api/admin/myco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: partner.id,
          ...newProduct,
          productUnitMg: Number(newProduct.productUnitMg),
          photoUrl,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || "Failed to create product");
        return;
      }

      const product = data.data.product as Product;
      setProducts((current) => [product, ...current]);
      setRowDrafts((current) => ({
        ...current,
        [product.id]: {
          strengthOffset: product.strengthOffset?.offset ?? "standard",
          strengthRationale: product.strengthOffset?.rationale ?? "",
        },
      }));
      setNewProduct(emptyProduct);
      setPhotoFile(null);
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
    setProducts((current) => current.map((product) => product.id === updated.id ? updated : product));
    setMessage(successText);
  }

  function updateDraft(productId: string, field: "strengthOffset" | "strengthRationale", value: string) {
    setRowDrafts((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] ?? { strengthOffset: "standard", strengthRationale: "" }),
        [field]: value,
      },
    }));
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
          <button onClick={saveSettings} disabled={saving} style={styles.primaryButton}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
        <div style={styles.settingsGrid}>
          <label style={styles.field}>
            Store name
            <input value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} style={styles.input} />
          </label>
          <label style={styles.field}>
            Subdomain
            <input value={settings.subdomain} onChange={(event) => setSettings({ ...settings, subdomain: event.target.value })} placeholder="top" style={styles.input} />
          </label>
          <label style={styles.field}>
            Contact email
            <input value={settings.contactEmail} onChange={(event) => setSettings({ ...settings, contactEmail: event.target.value })} style={styles.input} />
          </label>
          <label style={styles.field}>
            Contact phone
            <input value={settings.contactPhone} onChange={(event) => setSettings({ ...settings, contactPhone: event.target.value })} style={styles.input} />
          </label>
          <label style={styles.field}>
            Contact website
            <input value={settings.contactWebsite} onChange={(event) => setSettings({ ...settings, contactWebsite: event.target.value })} style={styles.input} />
          </label>
          <label style={{ ...styles.field, gridColumn: "1 / -1" }}>
            Myco welcome message
            <textarea value={settings.mycoWelcomeMessage} onChange={(event) => setSettings({ ...settings, mycoWelcomeMessage: event.target.value })} rows={3} style={styles.textarea} />
          </label>
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Add Product</h2>
        <div style={styles.productGrid}>
          <input placeholder="Product name" value={newProduct.productName} onChange={(event) => setNewProduct({ ...newProduct, productName: event.target.value })} style={styles.input} />
          <input placeholder="Brand" value={newProduct.brand} onChange={(event) => setNewProduct({ ...newProduct, brand: event.target.value })} style={styles.input} />
          <select value={newProduct.format} onChange={(event) => setNewProduct({ ...newProduct, format: event.target.value })} style={styles.select}>
            <option value="capsule">Capsule</option>
            <option value="edible">Edible</option>
            <option value="dried">Dried</option>
            <option value="tincture">Tincture</option>
            <option value="other">Other</option>
          </select>
          <input placeholder="Dose per unit mg" type="number" min="1" value={newProduct.productUnitMg} onChange={(event) => setNewProduct({ ...newProduct, productUnitMg: event.target.value })} style={styles.input} />
          <input placeholder="Strain slug, optional" value={newProduct.strainSlug} onChange={(event) => setNewProduct({ ...newProduct, strainSlug: event.target.value })} style={styles.input} />
          <select value={newProduct.strengthOffset} onChange={(event) => setNewProduct({ ...newProduct, strengthOffset: event.target.value as StrengthOffset })} style={styles.select}>
            <option value="standard">Standard</option>
            <option value="stronger">Hits Stronger</option>
            <option value="lighter">Hits Lighter</option>
          </select>
          {newProduct.strengthOffset !== "standard" && (
            <input placeholder="Rationale" value={newProduct.strengthRationale} onChange={(event) => setNewProduct({ ...newProduct, strengthRationale: event.target.value })} style={styles.input} />
          )}
          <input placeholder="Photo URL" value={newProduct.photoUrl} onChange={(event) => setNewProduct({ ...newProduct, photoUrl: event.target.value })} style={styles.input} />
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event: ChangeEvent<HTMLInputElement>) => setPhotoFile(event.target.files?.[0] ?? null)} style={styles.fileInput} />
          <button onClick={createProduct} disabled={saving || !newProduct.productName || !newProduct.productUnitMg} style={styles.primaryButton}>
            {saving ? "Adding..." : "Add Product"}
          </button>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.sectionTitle}>Product Catalog</h2>
          <div style={styles.toolbar}>
            <select value={filter} onChange={(event) => setFilter(event.target.value as ProductFilter)} style={styles.select}>
              <option value="all">All</option>
              <option value="active">On</option>
              <option value="inactive">Off</option>
            </select>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} style={styles.select}>
              <option value="updatedAt">Recently updated</option>
              <option value="productName">Name</option>
              <option value="format">Format</option>
              <option value="brand">Brand</option>
              <option value="active">Status</option>
            </select>
          </div>
        </div>
        <div style={styles.table}>
          <div style={{ ...styles.row, ...styles.headRow }}>
            <span>On</span>
            <span>Product</span>
            <span>Format</span>
            <span>Dose</span>
            <span>Strength</span>
            <span>Rationale</span>
            <span>Action</span>
          </div>
          {visibleProducts.map((product) => {
            const draft = rowDrafts[product.id] ?? { strengthOffset: "standard" as StrengthOffset, strengthRationale: "" };

            return (
              <div key={product.id} style={styles.row}>
                <label style={styles.switch}>
                  <input
                    type="checkbox"
                    checked={product.active}
                    onChange={(event) => patchProduct(product.id, { active: event.target.checked }, event.target.checked ? "Product turned on" : "Product turned off")}
                  />
                </label>
                <div style={styles.productCell}>
                  {product.photoUrl && <img src={product.photoUrl} alt="" style={styles.thumbnail} />}
                  <div>
                    <div style={styles.productName}>{product.productName}</div>
                    <div style={styles.meta}>{product.brand || "No brand"} {product.strainSlug ? `| ${product.strainSlug}` : ""}</div>
                  </div>
                </div>
                <span style={styles.capitalize}>{product.format}</span>
                <span>{product.productUnitMg ? `${product.productUnitMg}mg` : "Unset"}</span>
                <select value={draft.strengthOffset} onChange={(event) => updateDraft(product.id, "strengthOffset", event.target.value)} style={styles.select}>
                  <option value="standard">Standard</option>
                  <option value="stronger">Hits Stronger</option>
                  <option value="lighter">Hits Lighter</option>
                </select>
                <input
                  value={draft.strengthRationale}
                  onChange={(event) => updateDraft(product.id, "strengthRationale", event.target.value)}
                  disabled={draft.strengthOffset === "standard"}
                  placeholder={draft.strengthOffset === "standard" ? "" : "dense caps, dense effects"}
                  style={styles.input}
                />
                <button
                  onClick={() => patchProduct(product.id, {
                    strengthOffset: draft.strengthOffset,
                    strengthRationale: draft.strengthRationale,
                  }, "Strength offset saved")}
                  style={styles.secondaryButton}
                >
                  Save
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    padding: "2rem",
    color: "#111827",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    marginBottom: "1.5rem",
  },
  title: {
    fontSize: "2rem",
    lineHeight: 1.1,
    margin: 0,
  },
  subtitle: {
    color: "#6b7280",
    margin: "0.35rem 0 0",
  },
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
  sectionTitle: {
    fontSize: "1.1rem",
    margin: 0,
  },
  settingsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "1rem",
  },
  productGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "0.75rem",
    alignItems: "end",
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
    padding: "0.65rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "0.9rem",
    background: "white",
    color: "#111827",
  },
  textarea: {
    width: "100%",
    padding: "0.65rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "0.9rem",
    resize: "vertical",
    color: "#111827",
  },
  select: {
    minWidth: "140px",
    padding: "0.65rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    background: "white",
    color: "#111827",
  },
  fileInput: {
    fontSize: "0.85rem",
  },
  primaryButton: {
    padding: "0.7rem 1rem",
    border: "none",
    borderRadius: "6px",
    background: "#2563eb",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "0.55rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    background: "white",
    color: "#111827",
    fontWeight: 600,
    cursor: "pointer",
  },
  toolbar: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  table: {
    overflowX: "auto",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "52px minmax(220px, 1.4fr) 110px 90px 150px minmax(220px, 1fr) 80px",
    gap: "0.75rem",
    alignItems: "center",
    minWidth: "980px",
    padding: "0.75rem 0",
    borderBottom: "1px solid #f3f4f6",
  },
  headRow: {
    color: "#6b7280",
    fontSize: "0.75rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  productCell: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    minWidth: 0,
  },
  thumbnail: {
    width: "44px",
    height: "44px",
    borderRadius: "6px",
    objectFit: "cover",
    background: "#f3f4f6",
  },
  productName: {
    fontWeight: 800,
  },
  meta: {
    color: "#6b7280",
    fontSize: "0.8rem",
    marginTop: "0.2rem",
  },
  switch: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  capitalize: {
    textTransform: "capitalize",
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
};
