/**
 * Partner Access Control
 *
 * Handles authentication, authorization, rate limiting, and logging
 * for partner API access.
 */

import { createHash, randomBytes } from "crypto";
import { Partner, PartnerRequestContext, ExplorationSignal, ExplorationEventType } from "./types";

// =============================================================================
// In-Memory Stores (Replace with database in production)
// =============================================================================

// Partner registry - in production, this would be in the database
const partners: Map<string, Partner> = new Map();

// Rate limit tracking: partnerId -> { count, windowStart }
const rateLimitWindows: Map<string, { count: number; windowStart: number }> = new Map();

// Request log buffer - flush to persistent storage periodically
const requestLogBuffer: Array<{
  partnerId: string;
  requestId: string;
  endpoint: string;
  timestamp: Date;
  statusCode: number;
  duration: number;
}> = [];

// Exploration signals buffer
const signalBuffer: ExplorationSignal[] = [];

// =============================================================================
// API Key Management
// =============================================================================

/**
 * Generate a new API key
 * Returns both the key (to give to partner) and hash (to store)
 */
export function generateApiKey(): { key: string; hash: string } {
  const key = `tripdar_${randomBytes(32).toString("hex")}`;
  const hash = hashApiKey(key);
  return { key, hash };
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Validate an API key and return the partner if valid
 */
export function validateApiKey(key: string): Partner | null {
  const hash = hashApiKey(key);
  for (const partner of partners.values()) {
    if (partner.apiKeyHash === hash && partner.active) {
      return partner;
    }
  }
  return null;
}

// =============================================================================
// Partner Management
// =============================================================================

/**
 * Register a new partner
 */
export function registerPartner(
  name: string,
  allowedDomains: string[],
  rateLimit: number = 60,
  notes?: string
): { partner: Partner; apiKey: string } {
  const id = randomBytes(8).toString("hex");
  const { key, hash } = generateApiKey();

  const partner: Partner = {
    id,
    name,
    apiKeyHash: hash,
    allowedDomains,
    rateLimit,
    active: true,
    createdAt: new Date(),
    notes,
  };

  partners.set(id, partner);

  return { partner, apiKey: key };
}

/**
 * Revoke a partner's access
 */
export function revokePartner(partnerId: string): boolean {
  const partner = partners.get(partnerId);
  if (partner) {
    partner.active = false;
    return true;
  }
  return false;
}

/**
 * Rotate a partner's API key
 */
export function rotateApiKey(partnerId: string): string | null {
  const partner = partners.get(partnerId);
  if (!partner) return null;

  const { key, hash } = generateApiKey();
  partner.apiKeyHash = hash;
  return key;
}

/**
 * Get partner by ID
 */
export function getPartner(partnerId: string): Partner | undefined {
  return partners.get(partnerId);
}

/**
 * List all partners (admin only)
 */
export function listPartners(): Partner[] {
  return Array.from(partners.values());
}

// =============================================================================
// Domain Validation
// =============================================================================

/**
 * Check if a request origin is allowed for a partner
 */
export function isOriginAllowed(partner: Partner, origin: string | null): boolean {
  if (!origin) return true; // Server-to-server requests have no origin

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    return partner.allowedDomains.some(domain => {
      // Exact match
      if (hostname === domain) return true;
      // Wildcard subdomain match (*.example.com)
      if (domain.startsWith("*.")) {
        const baseDomain = domain.slice(2);
        return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
      }
      return false;
    });
  } catch {
    return false;
  }
}

// =============================================================================
// Rate Limiting
// =============================================================================

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window

/**
 * Check and update rate limit for a partner
 * Returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(partner: Partner): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const window = rateLimitWindows.get(partner.id);

  if (!window || now - window.windowStart >= RATE_LIMIT_WINDOW_MS) {
    // New window
    rateLimitWindows.set(partner.id, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: partner.rateLimit - 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
  }

  if (window.count >= partner.rateLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: window.windowStart + RATE_LIMIT_WINDOW_MS,
    };
  }

  window.count++;
  return {
    allowed: true,
    remaining: partner.rateLimit - window.count,
    resetAt: window.windowStart + RATE_LIMIT_WINDOW_MS,
  };
}

// =============================================================================
// Request Context
// =============================================================================

/**
 * Create a request context for an authenticated request
 */
export function createRequestContext(
  partner: Partner,
  origin?: string,
  userAgent?: string
): PartnerRequestContext {
  // Update last active timestamp
  partner.lastActiveAt = new Date();

  return {
    partnerId: partner.id,
    partnerName: partner.name,
    requestId: randomBytes(16).toString("hex"),
    timestamp: new Date(),
    origin,
    userAgent,
  };
}

// =============================================================================
// Request Logging
// =============================================================================

/**
 * Log a partner API request
 */
export function logRequest(
  context: PartnerRequestContext,
  endpoint: string,
  statusCode: number,
  durationMs: number
): void {
  requestLogBuffer.push({
    partnerId: context.partnerId,
    requestId: context.requestId,
    endpoint,
    timestamp: context.timestamp,
    statusCode,
    duration: durationMs,
  });

  // In production: flush buffer periodically to persistent storage
  if (requestLogBuffer.length >= 100) {
    flushRequestLogs();
  }
}

/**
 * Flush request logs to persistent storage
 */
export function flushRequestLogs(): void {
  // In production: write to database or log aggregation service
  // For now, just clear the buffer
  const logs = requestLogBuffer.splice(0, requestLogBuffer.length);
  if (logs.length > 0) {
    console.log(`[Partner Logs] Flushed ${logs.length} request logs`);
  }
}

/**
 * Get recent request logs for a partner (admin only)
 */
export function getRequestLogs(partnerId: string, limit: number = 100) {
  return requestLogBuffer
    .filter(log => log.partnerId === partnerId)
    .slice(-limit);
}

// =============================================================================
// Exploration Signals
// =============================================================================

/**
 * Generate a non-trackable session hash
 * Based on request properties but not reversible to identify users
 */
export function generateSessionHash(
  userAgent: string | undefined,
  acceptLanguage: string | undefined,
  timestamp: Date
): string {
  // Create a hash that groups similar sessions but can't track individuals
  // Round timestamp to 15-minute windows to prevent tracking
  const timeWindow = Math.floor(timestamp.getTime() / (15 * 60 * 1000));
  const input = `${userAgent || "unknown"}|${acceptLanguage || "unknown"}|${timeWindow}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Record an exploration signal
 */
export function recordSignal(
  partnerId: string,
  eventType: ExplorationEventType,
  sessionHash: string,
  strainSlugs?: string[],
  parameters?: Record<string, string>
): void {
  const signal: ExplorationSignal = {
    id: randomBytes(8).toString("hex"),
    partnerId,
    eventType,
    strainSlugs,
    parameters: parameters ? sanitizeParameters(parameters) : undefined,
    sessionHash,
    timestamp: new Date(),
  };

  signalBuffer.push(signal);

  // In production: flush to analytics storage
  if (signalBuffer.length >= 50) {
    flushSignals();
  }
}

/**
 * Sanitize parameters to remove any potential PII
 */
function sanitizeParameters(params: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const allowedKeys = ["filter", "sort", "page", "potency", "beginner", "search_terms"];

  for (const [key, value] of Object.entries(params)) {
    if (allowedKeys.includes(key)) {
      // Truncate long values
      sanitized[key] = value.slice(0, 100);
    }
  }

  return sanitized;
}

/**
 * Flush signals to persistent storage
 */
export function flushSignals(): void {
  const signals = signalBuffer.splice(0, signalBuffer.length);
  if (signals.length > 0) {
    console.log(`[Signals] Flushed ${signals.length} exploration signals`);
    // In production: write to analytics database
  }
}

/**
 * Get signal aggregates (for internal analysis)
 */
export function getSignalAggregates(): Map<string, number> {
  const aggregates = new Map<string, number>();

  for (const signal of signalBuffer) {
    const key = `${signal.eventType}:${signal.strainSlugs?.[0] || "none"}`;
    aggregates.set(key, (aggregates.get(key) || 0) + 1);
  }

  return aggregates;
}

// =============================================================================
// Initialize Default Partner
// =============================================================================

// Register TheMushroomTop.com as the first partner
// Uses TRIPDAR_PARTNER_KEY env var for persistence across deploys
if (partners.size === 0) {
  const envApiKey = process.env.TRIPDAR_PARTNER_KEY;

  if (envApiKey) {
    // Use the persistent key from environment
    const hash = hashApiKey(envApiKey);
    const partner: Partner = {
      id: "themushroomtop",
      name: "The Mushroom Top",
      apiKeyHash: hash,
      allowedDomains: ["themushroomtop.com", "*.themushroomtop.com", "localhost"],
      rateLimit: 120,
      active: true,
      createdAt: new Date(),
      notes: "Primary partner - WordPress integration",
    };
    partners.set(partner.id, partner);
    console.log(`[Partner] Registered "The Mushroom Top" with persistent API key`);
  } else {
    // Development fallback - generate random key
    const { apiKey } = registerPartner(
      "The Mushroom Top",
      ["themushroomtop.com", "*.themushroomtop.com", "localhost"],
      120,
      "Primary partner - WordPress integration"
    );
    if (process.env.NODE_ENV === "development") {
      console.log(`[Partner] Registered "The Mushroom Top" with API key: ${apiKey}`);
    }
  }
}
