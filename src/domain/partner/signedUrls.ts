/**
 * Signed URL System for Visualization Assets
 *
 * Generates time-limited, tamper-proof URLs for accessing strain visualizations.
 * This prevents:
 * - Hotlinking from unauthorized sites
 * - URL sharing beyond intended lifetime
 * - Parameter tampering
 *
 * URLs are signed with HMAC-SHA256 and include expiry timestamps.
 */

import { createHmac, randomBytes } from "crypto";

// =============================================================================
// Configuration
// =============================================================================

// Secret key for signing - in production, use environment variable
const SIGNING_SECRET = process.env.TRIPDAR_SIGNING_SECRET || randomBytes(32).toString("hex");

// Base URL for signed asset URLs
const ASSET_BASE_URL = process.env.TRIPDAR_ASSET_BASE_URL || "https://tripd.ar";

// Default expiry time for signed URLs
const DEFAULT_EXPIRY_SECONDS = 60 * 60; // 1 hour

// Maximum allowed expiry (prevent abuse)
const MAX_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

// =============================================================================
// Types
// =============================================================================

export interface SignedUrlParams {
  /** The original asset URL */
  assetUrl: string;
  /** Partner ID requesting the asset */
  partnerId: string;
  /** Strain slug for tracking */
  strainSlug: string;
  /** Custom expiry in seconds (optional) */
  expirySeconds?: number;
}

export interface SignedUrlResult {
  /** The signed URL to provide to the partner */
  signedUrl: string;
  /** When the URL expires */
  expiresAt: string;
  /** Token that can be used to verify the URL */
  token: string;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
  assetUrl?: string;
  partnerId?: string;
  strainSlug?: string;
}

// =============================================================================
// Signing Functions
// =============================================================================

/**
 * Generate HMAC signature for the given data
 */
function sign(data: string): string {
  return createHmac("sha256", SIGNING_SECRET)
    .update(data)
    .digest("base64url");
}

/**
 * Create a signed URL for an asset
 */
export function createSignedUrl(params: SignedUrlParams): SignedUrlResult {
  const { assetUrl, partnerId, strainSlug, expirySeconds = DEFAULT_EXPIRY_SECONDS } = params;

  // Clamp expiry time
  const actualExpiry = Math.min(expirySeconds, MAX_EXPIRY_SECONDS);
  const expiresAt = new Date(Date.now() + actualExpiry * 1000);
  const expiresTimestamp = Math.floor(expiresAt.getTime() / 1000);

  // Create the payload to sign
  const payload = [
    assetUrl,
    partnerId,
    strainSlug,
    expiresTimestamp.toString(),
  ].join("|");

  // Generate signature
  const signature = sign(payload);

  // Create token (base64url encoded payload + signature)
  const tokenData = {
    u: assetUrl,
    p: partnerId,
    s: strainSlug,
    e: expiresTimestamp,
    sig: signature,
  };
  const token = Buffer.from(JSON.stringify(tokenData)).toString("base64url");

  // Build the signed URL
  // This URL points to our verification endpoint which will redirect to the actual asset
  const signedUrl = `${ASSET_BASE_URL}/api/v1/assets/verify?token=${token}`;

  return {
    signedUrl,
    expiresAt: expiresAt.toISOString(),
    token,
  };
}

/**
 * Verify a signed URL token
 */
export function verifySignedUrl(token: string): VerificationResult {
  try {
    // Decode token
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const tokenData = JSON.parse(decoded);

    const { u: assetUrl, p: partnerId, s: strainSlug, e: expiresTimestamp, sig: providedSignature } = tokenData;

    // Check required fields
    if (!assetUrl || !partnerId || !strainSlug || !expiresTimestamp || !providedSignature) {
      return { valid: false, error: "INVALID_TOKEN_FORMAT" };
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (expiresTimestamp < now) {
      return { valid: false, error: "TOKEN_EXPIRED" };
    }

    // Recreate payload and verify signature
    const payload = [assetUrl, partnerId, strainSlug, expiresTimestamp.toString()].join("|");
    const expectedSignature = sign(payload);

    if (providedSignature !== expectedSignature) {
      return { valid: false, error: "INVALID_SIGNATURE" };
    }

    // Valid!
    return {
      valid: true,
      assetUrl,
      partnerId,
      strainSlug,
    };
  } catch {
    return { valid: false, error: "MALFORMED_TOKEN" };
  }
}

/**
 * Create a signed URL that embeds directly in the response
 * (for cases where you want the full URL, not a redirect)
 */
export function createDirectSignedUrl(
  _baseUrl: string,
  params: SignedUrlParams
): SignedUrlResult {
  const result = createSignedUrl(params);

  // For direct URLs, we append query params to the actual asset URL
  // This is useful when the CDN can verify signatures
  const url = new URL(params.assetUrl);
  url.searchParams.set("tripdar_token", result.token);
  url.searchParams.set("tripdar_expires", result.expiresAt);

  return {
    ...result,
    signedUrl: url.toString(),
  };
}

// =============================================================================
// Radar/Visualization Specific Helpers
// =============================================================================

/**
 * Create a signed visualization URL for a strain
 */
export function signVisualizationUrl(
  blobUrl: string,
  partnerId: string,
  strainSlug: string,
  expiryMinutes: number = 60
): SignedUrlResult {
  return createSignedUrl({
    assetUrl: blobUrl,
    partnerId,
    strainSlug,
    expirySeconds: expiryMinutes * 60,
  });
}

/**
 * Quick check if a URL is expired without full verification
 */
export function isUrlExpired(token: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const tokenData = JSON.parse(decoded);
    const now = Math.floor(Date.now() / 1000);
    return tokenData.e < now;
  } catch {
    return true; // Treat malformed tokens as expired
  }
}
