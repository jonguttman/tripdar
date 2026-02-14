"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  POTENCY_OPTIONS,
  STABILITY_OPTIONS,
  BEGINNER_OPTIONS,
  VISUAL_OPTIONS,
} from "@/domain/strain/types";

interface Strain {
  id: string;
  name: string;
  potency: string;
  stability: string;
  beginner: string;
  visual: string;
  vibe: string[];
  confidence: number;
  description: string;
  origin?: string;
  createdAt?: string;
  updatedAt?: string;
  parentStrains?: string[];
  lineageNotes?: string;
  generation?: number;
}

const emptyStrain: Omit<Strain, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  potency: "Moderate",
  stability: "Medium",
  beginner: "Maybe",
  visual: "Medium",
  vibe: [],
  confidence: 50,
  description: "",
  parentStrains: [],
  lineageNotes: "",
};

export default function StrainsAdminPage() {
  const [strains, setStrains] = useState<Strain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state
  const [editingStrain, setEditingStrain] = useState<Strain | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(emptyStrain);
  const [vibeInput, setVibeInput] = useState("");

  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Visualization URLs
  const [visualizationUrls, setVisualizationUrls] = useState<Record<string, string>>({});

  // Load strains
  const loadStrains = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/strains");
      const data = await res.json();

      if (data.success) {
        setStrains(data.data.strains);
      } else {
        setError(data.error?.message || "Failed to load strains");
      }
    } catch (err) {
      setError("Network error loading strains");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load visualization URLs
  const loadVisualizationUrls = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/strains/visualizations");
      const data = await res.json();
      if (data.success) {
        setVisualizationUrls(data.data.visualizations);
      }
    } catch {
      console.error("Failed to load visualization URLs");
    }
  }, []);

  useEffect(() => {
    loadStrains();
    loadVisualizationUrls();
  }, [loadStrains, loadVisualizationUrls]);

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
    setFormData(emptyStrain);
    setVibeInput("");
    setIsCreating(true);
    setEditingStrain(null);
  };

  const openEdit = (strain: Strain) => {
    setFormData({
      name: strain.name,
      potency: strain.potency,
      stability: strain.stability,
      beginner: strain.beginner,
      visual: strain.visual,
      vibe: strain.vibe,
      confidence: strain.confidence,
      description: strain.description,
      parentStrains: strain.parentStrains || [],
      lineageNotes: strain.lineageNotes || "",
    });
    setVibeInput(strain.vibe.join(", "));
    setEditingStrain(strain);
    setIsCreating(false);
  };

  const closeModal = () => {
    setEditingStrain(null);
    setIsCreating(false);
    setFormData(emptyStrain);
    setVibeInput("");
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);

      // Parse vibes from input
      const vibes = vibeInput
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      const payload = {
        ...formData,
        vibe: vibes,
      };

      let res;
      if (isCreating) {
        res = await fetch("/api/admin/strains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (editingStrain) {
        res = await fetch(`/api/admin/strains/${editingStrain.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res?.json();

      if (data?.success) {
        setSuccess(isCreating ? "Strain created!" : "Strain updated!");
        closeModal();
        loadStrains();
      } else {
        setError(data?.error?.message || "Operation failed");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (strain: Strain) => {
    if (!confirm(`Delete "${strain.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/admin/strains/${strain.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        setSuccess("Strain deleted");
        loadStrains();
      } else {
        setError(data.error?.message || "Delete failed");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  // Image upload handlers
  const handleImageUpload = async (file: File, strainName: string, strainId?: string) => {
    try {
      setUploadingImage(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("strainName", strainName);

      const res = await fetch("/api/admin/strains/image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setSuccess("Image uploaded!");
        // Immediately update the local state with the new URL
        if (strainId && data.data?.url) {
          setVisualizationUrls(prev => ({ ...prev, [strainId]: data.data.url }));
        }
        // Also refresh from server for consistency
        loadVisualizationUrls();
      } else {
        setError(data.error?.message || "Upload failed");
      }
    } catch (err) {
      setError("Network error uploading image");
    } finally {
      setUploadingImage(false);
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = (e: React.DragEvent, strainName: string, strainId?: string) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      handleImageUpload(file, strainName, strainId);
    } else {
      setError("Please drop an image file");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, strainName: string, strainId?: string) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file, strainName, strainId);
    }
  };

  // Initialize blob storage
  const initializeStorage = async () => {
    if (!confirm("Initialize blob storage with current strain data?")) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/admin/strains", { method: "PUT" });
      const data = await res.json();

      if (data.success) {
        setSuccess("Blob storage initialized!");
        loadStrains();
      } else {
        setError(data.error?.message || "Initialization failed");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  // Modal content
  const renderModal = () => {
    if (!isCreating && !editingStrain) return null;

    return (
      <div style={styles.modalOverlay} onClick={closeModal}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <h2 style={styles.modalTitle}>
            {isCreating ? "Create Strain" : `Edit: ${editingStrain?.name}`}
          </h2>

          <div style={styles.formGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={styles.input}
                placeholder="Golden Teacher"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Potency</label>
              <select
                value={formData.potency}
                onChange={(e) => setFormData({ ...formData, potency: e.target.value })}
                style={styles.select}
              >
                {POTENCY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Stability</label>
              <select
                value={formData.stability}
                onChange={(e) => setFormData({ ...formData, stability: e.target.value })}
                style={styles.select}
              >
                {STABILITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Beginner Friendly</label>
              <select
                value={formData.beginner}
                onChange={(e) => setFormData({ ...formData, beginner: e.target.value })}
                style={styles.select}
              >
                {BEGINNER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Visual Intensity</label>
              <select
                value={formData.visual}
                onChange={(e) => setFormData({ ...formData, visual: e.target.value })}
                style={styles.select}
              >
                {VISUAL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Confidence ({formData.confidence}%)</label>
              <input
                type="range"
                min="0"
                max="100"
                value={formData.confidence}
                onChange={(e) => setFormData({ ...formData, confidence: parseInt(e.target.value) })}
                style={styles.range}
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Vibes (comma-separated)</label>
            <input
              type="text"
              value={vibeInput}
              onChange={(e) => setVibeInput(e.target.value)}
              style={styles.input}
              placeholder="calm, introspective, teacher-like"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={styles.textarea}
              rows={4}
              placeholder="A brief description of the strain's characteristics and experience..."
            />
          </div>

          {/* Lineage Section */}
          <div style={styles.lineageSection}>
            <h4 style={styles.lineageTitle}>Lineage</h4>

            <div style={styles.formGroup}>
              <label style={styles.label}>Parent Strains</label>
              <select
                multiple
                value={formData.parentStrains || []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                  setFormData({ ...formData, parentStrains: selected });
                }}
                style={{ ...styles.select, height: "120px" }}
              >
                {strains
                  .filter(s => s.id !== editingStrain?.id)
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                }
              </select>
              <small style={styles.helpText}>Hold Ctrl/Cmd to select multiple</small>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Lineage Notes</label>
              <input
                type="text"
                value={formData.lineageNotes || ""}
                onChange={(e) => setFormData({ ...formData, lineageNotes: e.target.value })}
                style={styles.input}
                placeholder="e.g., Cross of PE × B+"
              />
            </div>
          </div>

          {/* Image upload for editing */}
          {editingStrain && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Visualization Image</label>
              <div
                style={{
                  ...styles.dropZone,
                  borderColor: dragOver ? "#8b5cf6" : "#ddd",
                  backgroundColor: dragOver ? "#f5f3ff" : "#fafafa",
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => handleDrop(e, editingStrain.name, editingStrain.id)}
              >
                {uploadingImage ? (
                  <p style={styles.dropText}>Uploading...</p>
                ) : visualizationUrls[editingStrain.id] ? (
                  <div style={{ position: "relative" }}>
                    <img
                      src={visualizationUrls[editingStrain.id]}
                      alt={editingStrain.name}
                      style={styles.previewImage}
                    />
                    <div style={styles.imageOverlay}>
                      Click or drag to replace image
                    </div>
                  </div>
                ) : (
                  <p style={styles.dropText}>
                    Drag &amp; drop image or click to select
                  </p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileSelect(e, editingStrain.name, editingStrain.id)}
                  style={styles.fileInput}
                />
              </div>
            </div>
          )}

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
          <h1 style={styles.title}>Strains</h1>
        </div>
        <div style={styles.headerActions}>
          <button onClick={openCreate} style={styles.button}>
            + Add Strain
          </button>
          <button onClick={initializeStorage} style={styles.secondaryButton}>
            Initialize Storage
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && <div style={styles.errorBox}>{error}</div>}
      {success && <div style={styles.successBox}>{success}</div>}

      {/* Strain List */}
      <div style={styles.strainGrid}>
        {loading && strains.length === 0 ? (
          <p style={styles.loading}>Loading strains...</p>
        ) : strains.length === 0 ? (
          <p style={styles.empty}>No strains yet. Click "Add Strain" to create one.</p>
        ) : (
          strains.map((strain) => (
            <div key={strain.id} style={styles.strainCard}>
              {/* Image */}
              <div style={styles.strainImage}>
                {visualizationUrls[strain.id] ? (
                  <img
                    src={visualizationUrls[strain.id]}
                    alt={strain.name}
                    style={styles.cardImage}
                  />
                ) : (
                  <div style={styles.noImage}>No Image</div>
                )}
              </div>

              {/* Info */}
              <div style={styles.strainInfo}>
                <h3 style={styles.strainName}>{strain.name}</h3>
                <div style={styles.strainMeta}>
                  <span style={styles.badge}>{strain.potency}</span>
                  <span style={styles.badge}>{strain.beginner === "Yes" ? "Beginner OK" : strain.beginner === "No" ? "Experienced" : "Maybe"}</span>
                </div>
                <p style={styles.strainDesc}>
                  {strain.description.length > 120
                    ? strain.description.substring(0, 120) + "..."
                    : strain.description}
                </p>
                <div style={styles.vibes}>
                  {strain.vibe.slice(0, 3).map((v) => (
                    <span key={v} style={styles.vibe}>{v}</span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={styles.strainActions}>
                <button onClick={() => openEdit(strain)} style={styles.editButton}>
                  Edit
                </button>
                <button onClick={() => handleDelete(strain)} style={styles.deleteButton}>
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
    maxWidth: "1200px",
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
    maxWidth: "1200px",
    margin: "0 auto 16px",
    padding: "12px 20px",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    color: "#dc2626",
  },
  successBox: {
    maxWidth: "1200px",
    margin: "0 auto 16px",
    padding: "12px 20px",
    backgroundColor: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    color: "#16a34a",
  },
  strainGrid: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
    gap: "20px",
  },
  strainCard: {
    backgroundColor: "white",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  strainImage: {
    height: "160px",
    backgroundColor: "#f0f0f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  noImage: {
    color: "#999",
    fontSize: "14px",
  },
  strainInfo: {
    padding: "16px",
  },
  strainName: {
    margin: "0 0 8px",
    fontSize: "18px",
    fontWeight: "600",
  },
  strainMeta: {
    display: "flex",
    gap: "8px",
    marginBottom: "12px",
  },
  badge: {
    padding: "4px 8px",
    backgroundColor: "#f3f4f6",
    borderRadius: "4px",
    fontSize: "12px",
    color: "#666",
  },
  strainDesc: {
    margin: "0 0 12px",
    fontSize: "13px",
    color: "#666",
    lineHeight: "1.5",
  },
  vibes: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap" as const,
  },
  vibe: {
    padding: "2px 8px",
    backgroundColor: "#ede9fe",
    borderRadius: "12px",
    fontSize: "11px",
    color: "#7c3aed",
  },
  strainActions: {
    display: "flex",
    borderTop: "1px solid #eee",
  },
  editButton: {
    flex: 1,
    padding: "12px",
    backgroundColor: "transparent",
    border: "none",
    color: "#8b5cf6",
    fontWeight: "500",
    cursor: "pointer",
  },
  deleteButton: {
    flex: 1,
    padding: "12px",
    backgroundColor: "transparent",
    border: "none",
    borderLeft: "1px solid #eee",
    color: "#ef4444",
    fontWeight: "500",
    cursor: "pointer",
  },
  empty: {
    textAlign: "center" as const,
    color: "#999",
    padding: "60px 20px",
    gridColumn: "1 / -1",
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
  range: {
    width: "100%",
  },
  dropZone: {
    position: "relative" as const,
    padding: "20px",
    border: "2px dashed #ddd",
    borderRadius: "8px",
    textAlign: "center" as const,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  dropText: {
    margin: 0,
    color: "#666",
    fontSize: "14px",
  },
  previewImage: {
    maxWidth: "100%",
    maxHeight: "200px",
    borderRadius: "4px",
    display: "block",
  },
  imageOverlay: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: "8px",
    background: "rgba(0,0,0,0.5)",
    color: "white",
    fontSize: "12px",
    textAlign: "center" as const,
    borderRadius: "0 0 4px 4px",
  },
  fileInput: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    opacity: 0,
    cursor: "pointer",
    zIndex: 10,
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
  lineageSection: {
    marginTop: "24px",
    paddingTop: "20px",
    borderTop: "1px solid #eee",
  },
  lineageTitle: {
    margin: "0 0 16px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  helpText: {
    display: "block",
    marginTop: "4px",
    fontSize: "12px",
    color: "#999",
  },
};
