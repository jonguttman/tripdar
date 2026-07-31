"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  POTENCY_OPTIONS,
  STABILITY_OPTIONS,
  BEGINNER_OPTIONS,
  VISUAL_OPTIONS,
  ONSET_TIME_OPTIONS,
  DURATION_OPTIONS,
  BODY_HEAD_OPTIONS,
  EMOTIONAL_CHARACTER_OPTIONS,
  COME_UP_OPTIONS,
  PEAK_CHARACTER_OPTIONS,
} from "@/domain/strain/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Textarea,
  cn,
} from "@/components/admin";

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
  // Experiential attributes (Feature 6)
  onsetTime?: string;
  typicalDuration?: string;
  bodyHeadBalance?: string;
  emotionalCharacter?: string[];
  comeUpIntensity?: string;
  peakCharacter?: string;
  doseExperiences?: string[];
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
  // Experiential attributes
  onsetTime: "",
  typicalDuration: "",
  bodyHeadBalance: "",
  emotionalCharacter: [],
  comeUpIntensity: "",
  peakCharacter: "",
  doseExperiences: ["", "", "", "", "", ""],
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
    } catch (_err) {
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
      // Experiential attributes
      onsetTime: strain.onsetTime || "",
      typicalDuration: strain.typicalDuration || "",
      bodyHeadBalance: strain.bodyHeadBalance || "",
      emotionalCharacter: strain.emotionalCharacter || [],
      comeUpIntensity: strain.comeUpIntensity || "",
      peakCharacter: strain.peakCharacter || "",
      doseExperiences: strain.doseExperiences || ["", "", "", "", "", ""],
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
    } catch (_err) {
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
    } catch (_err) {
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
    } catch (_err) {
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
    } catch (_err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  // Modal content
  const renderModal = () => {
    if (!isCreating && !editingStrain) return null;

    return (
      <Modal
        open
        onClose={closeModal}
        wide
        title={isCreating ? "Create Strain" : `Edit: ${editingStrain?.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !formData.name || !formData.description}
            >
              {loading ? "Saving..." : isCreating ? "Create" : "Save Changes"}
            </Button>
          </>
        }
      >
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Golden Teacher"
            />
          </Field>

          <Field label="Potency">
            <Select
              value={formData.potency}
              onChange={(e) => setFormData({ ...formData, potency: e.target.value })}
            >
              {POTENCY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </Select>
          </Field>

          <Field label="Trip Consistency">
            <Select
              value={formData.stability}
              onChange={(e) => setFormData({ ...formData, stability: e.target.value })}
            >
              {STABILITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </Select>
          </Field>

          <Field label="Beginner Friendly">
            <Select
              value={formData.beginner}
              onChange={(e) => setFormData({ ...formData, beginner: e.target.value })}
            >
              {BEGINNER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </Select>
          </Field>

          <Field label="Visual Intensity">
            <Select
              value={formData.visual}
              onChange={(e) => setFormData({ ...formData, visual: e.target.value })}
            >
              {VISUAL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </Select>
          </Field>

          <Field label={`Confidence (${formData.confidence}%)`}>
            <input
              type="range"
              min="0"
              max="100"
              value={formData.confidence}
              onChange={(e) => setFormData({ ...formData, confidence: parseInt(e.target.value) })}
              className="h-11 w-full cursor-pointer accent-moss-600"
            />
          </Field>
        </div>

        <Field label="Vibes (comma-separated)" className="mb-4">
          <Input
            type="text"
            value={vibeInput}
            onChange={(e) => setVibeInput(e.target.value)}
            placeholder="calm, introspective, teacher-like"
          />
        </Field>

        <Field label="Description" required className="mb-4">
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
            placeholder="A brief description of the strain's characteristics and experience..."
          />
        </Field>

        {/* Lineage Section */}
        <div className="mt-6 border-t border-bone-300 pt-5">
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-bark-500">
            Lineage
          </h4>

          <Field
            label="Parent Strains"
            hint="Hold Ctrl/Cmd to select multiple"
            className="mb-4"
          >
            <Select
              multiple
              value={formData.parentStrains || []}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                setFormData({ ...formData, parentStrains: selected });
              }}
              className="h-[120px] py-2"
            >
              {strains
                .filter(s => s.id !== editingStrain?.id)
                .map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))
              }
            </Select>
          </Field>

          <Field label="Lineage Notes" className="mb-4">
            <Input
              type="text"
              value={formData.lineageNotes || ""}
              onChange={(e) => setFormData({ ...formData, lineageNotes: e.target.value })}
              placeholder="e.g., Cross of PE × B+"
            />
          </Field>
        </div>

        {/* Experiential Attributes Section */}
        <div className="mt-6 border-t border-bone-300 pt-5">
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-bark-500">
            Experience Profile
          </h4>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Onset Time">
              <Select
                value={formData.onsetTime || ""}
                onChange={(e) => setFormData({ ...formData, onsetTime: e.target.value })}
              >
                <option value="">Not specified</option>
                {ONSET_TIME_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </Select>
            </Field>

            <Field label="Typical Duration">
              <Select
                value={formData.typicalDuration || ""}
                onChange={(e) => setFormData({ ...formData, typicalDuration: e.target.value })}
              >
                <option value="">Not specified</option>
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </Select>
            </Field>

            <Field label="Body/Head Balance">
              <Select
                value={formData.bodyHeadBalance || ""}
                onChange={(e) => setFormData({ ...formData, bodyHeadBalance: e.target.value })}
              >
                <option value="">Not specified</option>
                {BODY_HEAD_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </Select>
            </Field>

            <Field label="Come-Up Intensity">
              <Select
                value={formData.comeUpIntensity || ""}
                onChange={(e) => setFormData({ ...formData, comeUpIntensity: e.target.value })}
              >
                <option value="">Not specified</option>
                {COME_UP_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </Select>
            </Field>

            <Field label="Peak Character">
              <Select
                value={formData.peakCharacter || ""}
                onChange={(e) => setFormData({ ...formData, peakCharacter: e.target.value })}
              >
                <option value="">Not specified</option>
                {PEAK_CHARACTER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Emotional Character"
            hint="Hold Ctrl/Cmd to select multiple"
          >
            <Select
              multiple
              value={formData.emotionalCharacter || []}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                setFormData({ ...formData, emotionalCharacter: selected });
              }}
              className="h-[120px] py-2"
            >
              {EMOTIONAL_CHARACTER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Dose Experience Descriptions */}
        <div className="mt-6 border-t border-bone-300 pt-5">
          <h4 className="mb-1 text-sm font-semibold uppercase tracking-wide text-bark-500">
            Dose Experience Descriptions
          </h4>
          <p className="mb-4 text-xs text-bark-400">
            Short poetic descriptions (~35-45 chars) for each dose level on the dose card
          </p>
          <div className="space-y-3">
            {[
              "I. Microdose",
              "II. Mini-dose",
              "III. Macro Dose",
              "IV. Museum Dose",
              "V. Megadose",
              "VI. Heroic Dose",
            ].map((label, i) => (
              <Field key={label} label={label}>
                <Input
                  type="text"
                  value={(formData.doseExperiences || [])[i] || ""}
                  onChange={(e) => {
                    const updated = [...(formData.doseExperiences || ["", "", "", "", "", ""])];
                    updated[i] = e.target.value;
                    setFormData({ ...formData, doseExperiences: updated });
                  }}
                  placeholder="e.g., Gentle clarity, quiet warmth"
                  maxLength={60}
                />
              </Field>
            ))}
          </div>
        </div>

        {/* Image upload for editing */}
        {editingStrain && (
          <div className="mt-6">
            <span className="mb-1.5 block text-sm font-medium text-bark-700">
              Visualization Image (optional)
            </span>
            <div
              className={cn(
                "rounded-lg border-2 border-dashed p-5 text-center transition-colors",
                dragOver
                  ? "border-moss-500 bg-moss-50"
                  : "border-bone-300 bg-bone-100"
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => handleDrop(e, editingStrain.name, editingStrain.id)}
            >
              {uploadingImage ? (
                <p className="text-sm text-bark-500">Uploading...</p>
              ) : visualizationUrls[editingStrain.id] ? (
                <div className="relative">
                  <img
                    src={visualizationUrls[editingStrain.id]}
                    alt={editingStrain.name}
                    className="block max-h-48 max-w-full rounded"
                  />
                  <p className="mt-2 text-xs text-bark-500">
                    Drag a new image here to replace, or{" "}
                    <span
                      className="cursor-pointer text-moss-600 underline"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    >
                      browse files
                    </span>
                  </p>
                </div>
              ) : (
                <p
                  className="cursor-pointer text-sm text-bark-500"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Drag &amp; drop image or click to select
                </p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileSelect(e, editingStrain.name, editingStrain.id)}
              className="hidden"
            />
          </div>
        )}
      </Modal>
    );
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      {/* Header */}
      <PageHeader
        title="Strains"
        actions={
          <>
            <Button onClick={openCreate}>+ Add Strain</Button>
            <Button variant="secondary" onClick={initializeStorage}>
              Initialize Storage
            </Button>
          </>
        }
      />

      {/* Messages */}
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      {success && (
        <Alert tone="success" className="mb-4">
          {success}
        </Alert>
      )}

      {/* Strain List */}
      {loading && strains.length === 0 ? (
        <LoadingState label="Loading strains..." />
      ) : strains.length === 0 ? (
        <EmptyState
          title="No strains yet."
          description={'Click "Add Strain" to create one.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {strains.map((strain) => (
            <Card key={strain.id} padded={false} className="overflow-hidden">
              {/* Image */}
              <div className="relative flex h-40 items-center justify-center bg-bone-200">
                {visualizationUrls[strain.id] ? (
                  <img
                    src={visualizationUrls[strain.id]}
                    alt={strain.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="text-sm text-bark-400">No Image</div>
                )}
                {/* Strain name overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bark-900/80 via-bark-900/60 to-transparent px-4 py-3 text-base font-semibold text-bone-50">
                  {strain.name}
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge tone="neutral">{strain.potency}</Badge>
                  <Badge tone="neutral">{strain.beginner === "Yes" ? "Beginner OK" : strain.beginner === "No" ? "Experienced" : "Maybe"}</Badge>
                </div>
                <p className="mb-3 text-sm leading-relaxed text-bark-600">
                  {strain.description.length > 120
                    ? strain.description.substring(0, 120) + "..."
                    : strain.description}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {strain.vibe.slice(0, 3).map((v) => (
                    <span
                      key={v}
                      className="rounded-full bg-moss-100 px-2 py-0.5 text-[11px] text-moss-700"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 border-t border-bone-200 p-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => openEdit(strain)}
                >
                  Edit
                </Button>
                <Button
                  variant="danger-ghost"
                  className="flex-1"
                  onClick={() => handleDelete(strain)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {renderModal()}
    </div>
  );
}
