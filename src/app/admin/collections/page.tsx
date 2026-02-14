"use client";

import { useState, useEffect, useCallback } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string;
  strains: string[];
  coverImage?: string;
  featured: boolean;
  sortOrder: number;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface Strain {
  id: string;
  name: string;
}

const emptyCollection: Omit<Collection, "id" | "slug" | "createdAt" | "updatedAt"> = {
  name: "",
  description: "",
  strains: [],
  featured: false,
  sortOrder: 0,
  tags: [],
};

export default function CollectionsAdminPage() {
  const { data: session, status } = useSession();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [strains, setStrains] = useState<Strain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(emptyCollection);
  const [tagsInput, setTagsInput] = useState("");

  // Load collections
  const loadCollections = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/collections");
      const data = await res.json();

      if (data.success) {
        setCollections(data.data.collections);
      } else {
        setError(data.error?.message || "Failed to load collections");
      }
    } catch (err) {
      setError("Network error loading collections");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load strains for selection
  const loadStrains = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/strains");
      const data = await res.json();
      if (data.success) {
        setStrains(data.data.strains);
      }
    } catch (err) {
      console.error("Failed to load strains");
    }
  }, []);

  useEffect(() => {
    if (session) {
      loadCollections();
      loadStrains();
    }
  }, [session, loadCollections, loadStrains]);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Form handlers
  const openCreate = () => {
    setFormData(emptyCollection);
    setTagsInput("");
    setIsCreating(true);
    setEditingCollection(null);
  };

  const openEdit = (collection: Collection) => {
    setFormData({
      name: collection.name,
      description: collection.description,
      strains: collection.strains || [],
      coverImage: collection.coverImage,
      featured: collection.featured,
      sortOrder: collection.sortOrder,
      tags: collection.tags || [],
    });
    setTagsInput((collection.tags || []).join(", "));
    setEditingCollection(collection);
    setIsCreating(false);
  };

  const closeModal = () => {
    setEditingCollection(null);
    setIsCreating(false);
    setFormData(emptyCollection);
    setTagsInput("");
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);

      // Parse tags from input
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        ...formData,
        tags,
      };

      let res;
      if (isCreating) {
        res = await fetch("/api/admin/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (editingCollection) {
        res = await fetch(`/api/admin/collections/${editingCollection.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res?.json();

      if (data?.success) {
        setSuccess(isCreating ? "Collection created!" : "Collection updated!");
        closeModal();
        loadCollections();
      } else {
        setError(data?.error?.message || "Operation failed");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (collection: Collection) => {
    if (!confirm(`Delete "${collection.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/admin/collections/${collection.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        setSuccess("Collection deleted");
        loadCollections();
      } else {
        setError(data.error?.message || "Delete failed");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  // Auth loading state
  if (status === "loading") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.loading}>Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!session) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Collections Admin</h1>
          <p style={styles.subtitle}>Sign in with GitHub to continue</p>
          <button onClick={() => signIn("github")} style={styles.button}>
            Sign in with GitHub
          </button>
        </div>
      </div>
    );
  }

  // Modal content
  const renderModal = () => {
    if (!isCreating && !editingCollection) return null;

    return (
      <div style={styles.modalOverlay} onClick={closeModal}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <h2 style={styles.modalTitle}>
            {isCreating ? "Create Collection" : `Edit: ${editingCollection?.name}`}
          </h2>

          <div style={styles.formGroup}>
            <label style={styles.label}>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={styles.input}
              placeholder="Best for Beginners"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={styles.textarea}
              rows={3}
              placeholder="A curated list of beginner-friendly strains..."
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Strains</label>
            <select
              multiple
              value={formData.strains}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                setFormData({ ...formData, strains: selected });
              }}
              style={{ ...styles.select, height: "200px" }}
            >
              {strains.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <small style={styles.helpText}>
              Hold Ctrl/Cmd to select multiple. Selected: {formData.strains.length}
            </small>
          </div>

          <div style={styles.formGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Sort Order</label>
              <input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.featured}
                  onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                />
                Featured Collection
              </label>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Tags (comma-separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              style={styles.input}
              placeholder="beginner, gentle, recommended"
            />
          </div>

          <div style={styles.modalActions}>
            <button onClick={closeModal} style={styles.cancelButton}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !formData.name || !formData.description}
              style={styles.button}
            >
              {loading ? "Saving..." : isCreating ? "Create" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Collections Admin</h1>
          <p style={styles.subtitle}>
            Signed in as {session.user?.email}
          </p>
        </div>
        <div style={styles.headerActions}>
          <button onClick={openCreate} style={styles.button}>
            + Add Collection
          </button>
          <a href="/admin/strains" style={styles.secondaryButton}>
            Manage Strains
          </a>
          <button onClick={() => signOut()} style={styles.logoutButton}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && <div style={styles.errorBox}>{error}</div>}
      {success && <div style={styles.successBox}>{success}</div>}

      {/* Collection List */}
      <div style={styles.collectionList}>
        {loading && collections.length === 0 ? (
          <p style={styles.loading}>Loading collections...</p>
        ) : collections.length === 0 ? (
          <p style={styles.empty}>No collections yet. Click "Add Collection" to create one.</p>
        ) : (
          collections.map((collection) => (
            <div key={collection.id} style={styles.collectionCard}>
              <div style={styles.collectionInfo}>
                <div style={styles.collectionHeader}>
                  <h3 style={styles.collectionName}>{collection.name}</h3>
                  {collection.featured && (
                    <span style={styles.featuredBadge}>Featured</span>
                  )}
                </div>
                <p style={styles.collectionDesc}>{collection.description}</p>
                <div style={styles.collectionMeta}>
                  <span>{collection.strains.length} strains</span>
                  <span>Order: {collection.sortOrder}</span>
                  {collection.tags && collection.tags.length > 0 && (
                    <span>Tags: {collection.tags.join(", ")}</span>
                  )}
                </div>
              </div>
              <div style={styles.collectionActions}>
                <button onClick={() => openEdit(collection)} style={styles.editButton}>
                  Edit
                </button>
                <button onClick={() => handleDelete(collection)} style={styles.deleteButton}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {renderModal()}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
    padding: "20px",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    maxWidth: "1000px",
    margin: "0 auto 24px",
    padding: "20px 24px",
    backgroundColor: "white",
    borderRadius: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  headerActions: {
    display: "flex",
    gap: "12px",
  },
  card: {
    maxWidth: "400px",
    margin: "100px auto",
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "32px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    textAlign: "center" as const,
  },
  title: {
    margin: "0 0 4px",
    fontSize: "24px",
    fontWeight: "600",
  },
  subtitle: {
    margin: 0,
    color: "#666",
    fontSize: "14px",
  },
  button: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "600",
    backgroundColor: "#8b5cf6",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    textDecoration: "none",
  },
  secondaryButton: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "500",
    backgroundColor: "white",
    color: "#666",
    border: "1px solid #ddd",
    borderRadius: "8px",
    cursor: "pointer",
    textDecoration: "none",
  },
  logoutButton: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "500",
    backgroundColor: "transparent",
    color: "#666",
    border: "none",
    cursor: "pointer",
  },
  loading: {
    textAlign: "center" as const,
    color: "#666",
    padding: "40px",
  },
  errorBox: {
    maxWidth: "1000px",
    margin: "0 auto 16px",
    padding: "12px 20px",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    color: "#dc2626",
  },
  successBox: {
    maxWidth: "1000px",
    margin: "0 auto 16px",
    padding: "12px 20px",
    backgroundColor: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    color: "#16a34a",
  },
  collectionList: {
    maxWidth: "1000px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
  },
  collectionCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  collectionInfo: {
    flex: 1,
  },
  collectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "8px",
  },
  collectionName: {
    margin: 0,
    fontSize: "18px",
    fontWeight: "600",
  },
  featuredBadge: {
    padding: "2px 8px",
    backgroundColor: "#fef3c7",
    color: "#d97706",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "500",
  },
  collectionDesc: {
    margin: "0 0 12px",
    fontSize: "14px",
    color: "#666",
    lineHeight: "1.4",
  },
  collectionMeta: {
    display: "flex",
    gap: "16px",
    fontSize: "13px",
    color: "#999",
  },
  collectionActions: {
    display: "flex",
    gap: "8px",
  },
  editButton: {
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: "1px solid #ddd",
    borderRadius: "6px",
    color: "#666",
    cursor: "pointer",
  },
  deleteButton: {
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: "1px solid #fecaca",
    borderRadius: "6px",
    color: "#ef4444",
    cursor: "pointer",
  },
  empty: {
    textAlign: "center" as const,
    color: "#999",
    padding: "60px 20px",
  },
  // Modal styles
  modalOverlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "24px",
    maxWidth: "600px",
    width: "100%",
    maxHeight: "90vh",
    overflowY: "auto" as const,
  },
  modalTitle: {
    margin: "0 0 20px",
    fontSize: "20px",
    fontWeight: "600",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "16px",
    marginBottom: "16px",
  },
  formGroup: {
    marginBottom: "16px",
  },
  label: {
    display: "block",
    marginBottom: "6px",
    fontSize: "13px",
    fontWeight: "500",
    color: "#333",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    color: "#333",
    cursor: "pointer",
    marginTop: "24px",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    boxSizing: "border-box" as const,
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    backgroundColor: "white",
    boxSizing: "border-box" as const,
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    resize: "vertical" as const,
    boxSizing: "border-box" as const,
    fontFamily: "inherit",
  },
  helpText: {
    display: "block",
    marginTop: "4px",
    fontSize: "12px",
    color: "#999",
  },
  modalActions: {
    display: "flex",
    gap: "12px",
    justifyContent: "flex-end",
    marginTop: "24px",
    paddingTop: "16px",
    borderTop: "1px solid #eee",
  },
  cancelButton: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "500",
    backgroundColor: "transparent",
    color: "#666",
    border: "1px solid #ddd",
    borderRadius: "8px",
    cursor: "pointer",
  },
};
