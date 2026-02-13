/**
 * Collection Types
 *
 * Type definitions for strain collections.
 */

/**
 * Strain collection (stored in blob)
 */
export interface StrainCollection {
  id: string;
  name: string;
  slug: string;
  description: string;
  strains: string[];        // Strain IDs
  coverImage?: string;      // URL to cover image
  featured: boolean;        // Show on homepage
  sortOrder: number;        // Display order
  tags?: string[];          // Collection tags
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/**
 * Collection data file structure in Vercel Blob
 */
export interface CollectionDataFile {
  version: string;
  updatedAt: string;
  updatedBy: string;
  collections: StrainCollection[];
}

/**
 * Public collection view (for API)
 */
export interface CollectionPublicView {
  slug: string;
  name: string;
  description: string;
  strainCount: number;
  coverImage?: string;
  featured: boolean;
  tags?: string[];
}

/**
 * Collection with full strain details
 */
export interface CollectionDetail extends CollectionPublicView {
  strains: string[];  // Strain slugs
}
