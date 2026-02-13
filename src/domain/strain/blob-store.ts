/**
 * Strain Blob Store
 *
 * Manages strain data in Vercel Blob storage.
 * Allows editing strains without redeployment.
 */

import { put, list, del } from "@vercel/blob";
import { InternalStrain, StrainDataFile } from "./types";
import { STRAIN_DATA } from "./data";

const STRAIN_DATA_BLOB_NAME = "strain-data.json";

// In-memory cache for strain data
let cachedStrains: InternalStrain[] | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Get the URL for the strain data blob
 */
async function getStrainDataBlobUrl(): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: STRAIN_DATA_BLOB_NAME });
    const dataBlob = blobs.find(b => b.pathname === STRAIN_DATA_BLOB_NAME);
    return dataBlob?.url || null;
  } catch (error) {
    console.error("Error finding strain data blob:", error);
    return null;
  }
}

/**
 * Load strain data from blob storage
 * Falls back to hardcoded data if blob doesn't exist
 */
export async function loadStrainData(): Promise<InternalStrain[]> {
  // Check cache
  if (cachedStrains && Date.now() - cacheTime < CACHE_TTL) {
    return cachedStrains;
  }

  try {
    const blobUrl = await getStrainDataBlobUrl();

    if (!blobUrl) {
      // No blob exists yet, use hardcoded data
      console.log("No strain blob found, using hardcoded data");
      cachedStrains = STRAIN_DATA.map(s => ({
        ...s,
        origin: "hardcoded",
      }));
      cacheTime = Date.now();
      return cachedStrains;
    }

    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch strain data: ${response.status}`);
    }

    const data: StrainDataFile = await response.json();
    cachedStrains = data.strains;
    cacheTime = Date.now();
    return cachedStrains;
  } catch (error) {
    console.error("Error loading strain data from blob:", error);
    // Fall back to hardcoded data
    cachedStrains = STRAIN_DATA.map(s => ({
      ...s,
      origin: "hardcoded",
    }));
    cacheTime = Date.now();
    return cachedStrains;
  }
}

/**
 * Save strain data to blob storage
 */
export async function saveStrainData(
  strains: InternalStrain[],
  updatedBy: string
): Promise<void> {
  const dataFile: StrainDataFile = {
    version: "1.0",
    updatedAt: new Date().toISOString(),
    updatedBy,
    strains,
  };

  // Delete existing blob if it exists
  try {
    const blobUrl = await getStrainDataBlobUrl();
    if (blobUrl) {
      await del(blobUrl);
    }
  } catch (error) {
    console.error("Error deleting old strain blob:", error);
  }

  // Upload new blob
  await put(STRAIN_DATA_BLOB_NAME, JSON.stringify(dataFile, null, 2), {
    access: "public",
    contentType: "application/json",
  });

  // Clear cache
  cachedStrains = strains;
  cacheTime = Date.now();
}

/**
 * Get a single strain by ID
 */
export async function getStrainById(id: string): Promise<InternalStrain | null> {
  const strains = await loadStrainData();
  return strains.find(s => s.id === id) || null;
}

/**
 * Create a new strain
 */
export async function createStrain(
  strain: Omit<InternalStrain, "id" | "createdAt" | "updatedAt">,
  createdBy: string
): Promise<InternalStrain> {
  const strains = await loadStrainData();

  // Generate ID from name
  const id = strain.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Check for duplicate ID
  if (strains.some(s => s.id === id)) {
    throw new Error(`Strain with ID "${id}" already exists`);
  }

  const now = new Date().toISOString();
  const newStrain: InternalStrain = {
    ...strain,
    id,
    createdAt: now,
    updatedAt: now,
  };

  strains.push(newStrain);
  await saveStrainData(strains, createdBy);

  return newStrain;
}

/**
 * Update an existing strain
 */
export async function updateStrain(
  id: string,
  updates: Partial<Omit<InternalStrain, "id" | "createdAt">>,
  updatedBy: string
): Promise<InternalStrain> {
  const strains = await loadStrainData();
  const index = strains.findIndex(s => s.id === id);

  if (index === -1) {
    throw new Error(`Strain with ID "${id}" not found`);
  }

  const updatedStrain: InternalStrain = {
    ...strains[index],
    ...updates,
    id, // Ensure ID doesn't change
    updatedAt: new Date().toISOString(),
  };

  strains[index] = updatedStrain;
  await saveStrainData(strains, updatedBy);

  return updatedStrain;
}

/**
 * Delete a strain
 */
export async function deleteStrain(id: string, deletedBy: string): Promise<void> {
  const strains = await loadStrainData();
  const index = strains.findIndex(s => s.id === id);

  if (index === -1) {
    throw new Error(`Strain with ID "${id}" not found`);
  }

  strains.splice(index, 1);
  await saveStrainData(strains, deletedBy);
}

/**
 * Initialize blob storage with hardcoded data
 * Call this to migrate from hardcoded to blob storage
 */
export async function initializeBlobStorage(initializedBy: string): Promise<void> {
  const blobUrl = await getStrainDataBlobUrl();

  if (blobUrl) {
    console.log("Blob storage already initialized");
    return;
  }

  // Copy hardcoded data with timestamps
  const now = new Date().toISOString();
  const strains: InternalStrain[] = STRAIN_DATA.map(s => ({
    ...s,
    origin: "migrated-from-hardcoded",
    createdAt: now,
    updatedAt: now,
  }));

  await saveStrainData(strains, initializedBy);
  console.log(`Initialized blob storage with ${strains.length} strains`);
}

/**
 * Clear the cache (useful after updates)
 */
export function clearCache(): void {
  cachedStrains = null;
  cacheTime = 0;
}
