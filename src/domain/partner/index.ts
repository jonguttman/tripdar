/**
 * Partner Integration Module
 *
 * Provides controlled, read-only access to Tripdar strain data
 * for authorized partner sites.
 */

// Types
export type {
  StrainPublicView,
  StrainListResponse,
  StrainDetailResponse,
  Partner,
  PartnerRequestContext,
  ExplorationSignal,
  ExplorationEventType,
  SignalAggregate,
  ApiResponse,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "./types";

// Public View Mapping
export {
  toPublicView,
  toPublicViewList,
  findBySlug,
  createMeta,
  API_VERSION,
} from "./publicView";

// Access Control
export {
  generateApiKey,
  validateApiKey,
  registerPartner,
  revokePartner,
  rotateApiKey,
  getPartner,
  listPartners,
  isOriginAllowed,
  checkRateLimit,
  createRequestContext,
  logRequest,
  flushRequestLogs,
  getRequestLogs,
  generateSessionHash,
  recordSignal,
  flushSignals,
  getSignalAggregates,
} from "./access";

// Middleware
export {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
  recordStrainView,
  recordStrainList,
  recordSearch,
} from "./middleware";
export type { AuthenticatedRequest } from "./middleware";
