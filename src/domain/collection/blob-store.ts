/**
 * Collection Blob Store
 *
 * Manages collection data in Vercel Blob storage.
 */

import { put, list, del } from "@vercel/blob";
import { StrainCollection, CollectionDataFile } from "./types";

const COLLECTION_DATA_BLOB_NAME = "collections-data.json";

// In-memory cache
let cachedCollections: StrainCollection[] | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Get the URL for the collections data blob
 */
async function getCollectionsBlobUrl(): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: COLLECTION_DATA_BLOB_NAME });
    const dataBlob = blobs.find(b => b.pathname === COLLECTION_DATA_BLOB_NAME);
    return dataBlob?.url || null;
  } catch (error) {
    console.error("Error finding collections blob:", error);
    return null;
  }
}

/**
 * Load collections from blob storage
 */
export async function loadCollections(): Promise<StrainCollection[]> {
  // Check cache
  if (cachedCollections && Date.now() - cacheTime < CACHE_TTL) {
    return cachedCollections;
  }

  try {
    const blobUrl = await getCollectionsBlobUrl();

    if (!blobUrl) {
      // No blob exists yet, return empty array
      cachedCollections = [];
      cacheTime = Date.now();
      return cachedCollections;
    }

    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch collections: ${response.status}`);
    }

    const data: CollectionDataFile = await response.json();
    cachedCollections = data.collections;
    cacheTime = Date.now();
    return cachedCollections;
  } catch (error) {
    console.error("Error loading collections from blob:", error);
    cachedCollections = [];
    cacheTime = Date.now();
    return cachedCollections;
  }
}

/**
 * Save collections to blob storage
 */
export async function saveCollections(
  collections: StrainCollection[],
  updatedBy: string
): Promise<void> {
  const dataFile: CollectionDataFile = {
    version: "1.0",
    updatedAt: new Date().toISOString(),
    updatedBy,
    collections,
  };

  // Delete existing blob if it exists
  try {
    const blobUrl = await getCollectionsBlobUrl();
    if (blobUrl) {
      await del(blobUrl);
    }
  } catch (error) {
    console.error("Error deleting old collections blob:", error);
  }

  // Upload new blob
  await put(COLLECTION_DATA_BLOB_NAME, JSON.stringify(dataFile, null, 2), {
    access: "public",
    contentType: "application/json",
  });

  // Update cache
  cachedCollections = collections;
  cacheTime = Date.now();
}

/**
 * Get a single collection by ID or slug
 */
export async function getCollectionById(idOrSlug: string): Promise<StrainCollection | null> {
  const collections = await loadCollections();
  return collections.find(c => c.id === idOrSlug || c.slug === idOrSlug) || null;
}

/**
 * Generate slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Create a new collection
 */
export async function createCollection(
  collection: Omit<StrainCollection, "id" | "slug" | "createdAt" | "updatedAt" | "createdBy">,
  createdBy: string
): Promise<StrainCollection> {
  const collections = await loadCollections();

  // Generate ID and slug
  const slug = generateSlug(collection.name);
  const id = slug;

  // Check for duplicate
  if (collections.some(c => c.id === id || c.slug === slug)) {
    throw new Error(`Collection "${collection.name}" already exists`);
  }

  const now = new Date().toISOString();
  const newCollection: StrainCollection = {
    ...collection,
    id,
    slug,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };

  collections.push(newCollection);

  // Sort by sortOrder
  collections.sort((a, b) => a.sortOrder - b.sortOrder);

  await saveCollections(collections, createdBy);
  return newCollection;
}

/**
 * Update an existing collection
 */
export async function updateCollection(
  idOrSlug: string,
  updates: Partial<Omit<StrainCollection, "id" | "slug" | "createdAt" | "createdBy">>,
  updatedBy: string
): Promise<StrainCollection> {
  const collections = await loadCollections();
  const index = collections.findIndex(c => c.id === idOrSlug || c.slug === idOrSlug);

  if (index === -1) {
    throw new Error(`Collection "${idOrSlug}" not found`);
  }

  const updatedCollection: StrainCollection = {
    ...collections[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  collections[index] = updatedCollection;

  // Sort by sortOrder
  collections.sort((a, b) => a.sortOrder - b.sortOrder);

  await saveCollections(collections, updatedBy);
  return updatedCollection;
}

/**
 * Delete a collection
 */
export async function deleteCollection(idOrSlug: string, deletedBy: string): Promise<void> {
  const collections = await loadCollections();
  const index = collections.findIndex(c => c.id === idOrSlug || c.slug === idOrSlug);

  if (index === -1) {
    throw new Error(`Collection "${idOrSlug}" not found`);
  }

  collections.splice(index, 1);
  await saveCollections(collections, deletedBy);
}

/**
 * Get featured collections
 */
export async function getFeaturedCollections(): Promise<StrainCollection[]> {
  const collections = await loadCollections();
  return collections.filter(c => c.featured);
}

/**
 * Clear cache
 */
export function clearCollectionCache(): void {
  cachedCollections = null;
  cacheTime = 0;
}
