/**
 * Partner Integration Types
 *
 * Defines the contracts for partner site access to Tripdar data.
 * All external-facing types are defined here to ensure strict separation
 * from internal models.
 */

// =============================================================================
// Public View Types (What partners see)
// =============================================================================

/**
 * The public representation of a strain.
 * This is the ONLY format exposed to partner sites.
 * Internal fields like raw scores, tuning parameters, and admin metadata
 * are explicitly excluded.
 */
export interface StrainPublicView {
  /** URL-safe identifier */
  slug: string;
  /** Display name */
  name: string;
  /** Optional alternative names */
  aliases?: string[];
  /** Species classification */
  species: string;
  /** Public-facing description */
  description: string;
  /** Geographic or genetic origin */
  origin: string;
  /** Experience characteristics for display */
  characteristics: {
    potencyTier: "low" | "moderate" | "high" | "very-high" | "variable";
    visualIntensity: "low" | "medium" | "high" | "very-high";
    experienceStability: "low" | "medium" | "high" | "variable";
    beginnerSuitable: "yes" | "maybe" | "no";
    doseSensitivity: "gentle" | "moderate" | "steep";
  };
  /** Curated vibe descriptors */
  vibes: string[];
  /** Tripdar confidence indicator (coarse bucket, not raw score) */
  confidenceTier: "emerging" | "developing" | "established" | "high-confidence";
  /** Reference to visualization asset (short-lived URL) */
  visualizationRef?: string;
  /** Direct URL to strain image in blob storage */
  imageUrl?: string | null;
  /** Experiential profile (Feature 6) */
  experienceProfile?: {
    onsetTime: string | null;
    typicalDuration: string | null;
    bodyHeadBalance: "body-heavy" | "body-leaning" | "balanced" | "head-leaning" | "head-heavy" | "head-dominant" | null;
    emotionalCharacter: string[];
    comeUpIntensity: string | null;
    peakCharacter: string | null;
  };
  /** Lineage information */
  lineage?: {
    parentStrains: string[];
    lineageNotes: string | null;
    generation: number | null;
  };
  /** Data attribution */
  attribution: {
    source: "tripdar";
    version: string;
    generatedAt: string;
  };
}

/**
 * Paginated list response for strain queries
 */
export interface StrainListResponse {
  strains: StrainPublicView[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
  meta: {
    source: "tripdar";
    version: string;
    generatedAt: string;
  };
}

/**
 * Single strain response
 */
export interface StrainDetailResponse {
  strain: StrainPublicView;
  meta: {
    source: "tripdar";
    version: string;
    generatedAt: string;
  };
}

// =============================================================================
// Partner Access Types
// =============================================================================

/**
 * Partner registration record
 */
export interface Partner {
  id: string;
  name: string;
  /** Hashed API key */
  apiKeyHash: string;
  /** Allowed origin domains */
  allowedDomains: string[];
  /** Rate limit (requests per minute) */
  rateLimit: number;
  /** Whether this partner is currently active */
  active: boolean;
  /** Creation timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActiveAt?: Date;
  /** Optional notes */
  notes?: string;
}

/**
 * API request context after authentication
 */
export interface PartnerRequestContext {
  partnerId: string;
  partnerName: string;
  requestId: string;
  timestamp: Date;
  origin?: string;
  userAgent?: string;
}

// =============================================================================
// Exploration Signal Types (Anonymous Analytics)
// =============================================================================

/**
 * Types of exploration events to capture
 */
export type ExplorationEventType =
  | "strain_view"
  | "strain_list"
  | "search"
  | "filter_apply"
  | "compare_strains"
  | "visualization_request"
  | "lineage_view";

/**
 * Anonymous exploration signal
 * No PII, no user tracking - only aggregate patterns
 */
export interface ExplorationSignal {
  id: string;
  /** Partner that generated this signal */
  partnerId: string;
  /** Type of exploration event */
  eventType: ExplorationEventType;
  /** Relevant strain slugs (if applicable) */
  strainSlugs?: string[];
  /** Search/filter parameters (sanitized) */
  parameters?: Record<string, string>;
  /** Session fingerprint (hashed, not trackable) */
  sessionHash: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Aggregated signal summary for trend analysis
 */
export interface SignalAggregate {
  period: "hour" | "day" | "week";
  periodStart: Date;
  eventType: ExplorationEventType;
  strainSlug?: string;
  count: number;
  uniqueSessions: number;
}

// =============================================================================
// API Response Wrappers
// =============================================================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
