"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "@/components/admin";

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
  const [collections, setCollections] = useState<Collection[]>([]);
  const [strains, setStrains] = useState<Strain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(emptyCollection);
  const [tagsInput, setTagsInput] = useState("");

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
    } catch {
      setError("Network error loading collections");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStrains = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/strains");
      const data = await res.json();
      if (data.success) {
        setStrains(data.data.strains);
      }
    } catch {
      console.error("Failed to load strains");
    }
  }, []);

  useEffect(() => {
    loadCollections();
    loadStrains();
  }, [loadCollections, loadStrains]);

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

      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      const payload = { ...formData, tags };

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
    } catch {
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
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader
        title="Collections"
        actions={
          <Button onClick={openCreate}>
            <Icon name="plus" size={16} />
            Add Collection
          </Button>
        }
      />

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

      <div className="flex flex-col gap-3 sm:gap-4">
        {loading && collections.length === 0 ? (
          <LoadingState label="Loading collections..." />
        ) : collections.length === 0 ? (
          <EmptyState
            icon="folder"
            title="No collections yet."
            description={'Click "Add Collection" to create one.'}
          />
        ) : (
          collections.map((collection) => (
            <Card
              key={collection.id}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-base font-semibold text-bark-800">
                    {collection.name}
                  </h3>
                  {collection.featured && <Badge tone="warning">Featured</Badge>}
                </div>
                <p className="mb-2 text-sm leading-relaxed text-bark-600">
                  {collection.description}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-bark-400">
                  <span>{collection.strains.length} strains</span>
                  <span>Order: {collection.sortOrder}</span>
                  {collection.tags && collection.tags.length > 0 && (
                    <span className="break-all">
                      Tags: {collection.tags.join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openEdit(collection)}
                >
                  <Icon name="edit" size={16} />
                  Edit
                </Button>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={() => handleDelete(collection)}
                >
                  <Icon name="trash" size={16} />
                  Delete
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal
        open={isCreating || !!editingCollection}
        onClose={closeModal}
        title={isCreating ? "Create Collection" : `Edit: ${editingCollection?.name}`}
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
        <div className="flex flex-col gap-4">
          <Field label="Name" required>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Best for Beginners"
            />
          </Field>

          <Field label="Description" required>
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
              placeholder="A curated list of beginner-friendly strains..."
            />
          </Field>

          <Field
            label="Strains"
            hint={`Hold Ctrl/Cmd to select multiple. Selected: ${formData.strains.length}`}
          >
            <Select
              multiple
              value={formData.strains}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                setFormData({ ...formData, strains: selected });
              }}
              className="h-[200px] py-2"
            >
              {strains.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Sort Order">
              <Input
                type="number"
                value={formData.sortOrder}
                onChange={(e) =>
                  setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })
                }
              />
            </Field>

            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-bark-700 sm:self-end">
              <input
                type="checkbox"
                checked={formData.featured}
                onChange={(e) =>
                  setFormData({ ...formData, featured: e.target.checked })
                }
                className="size-4 accent-moss-600"
              />
              Featured Collection
            </label>
          </div>

          <Field label="Tags (comma-separated)">
            <Input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="beginner, gentle, recommended"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
