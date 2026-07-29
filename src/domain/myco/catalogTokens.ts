import crypto from "crypto";

export type CatalogTokenPurpose = "staff_review" | "brand_portal";
export type CatalogTokenStatus = "active" | "revoked" | "expired";

export interface CatalogAccessTokenRecord {
  status: string;
  purpose: string;
  expiresAt: Date | null;
  revokedAt?: Date | null;
  brandId?: string | null;
  partnerId: string;
}

export type CatalogTokenValidation =
  | { ok: true; purpose: CatalogTokenPurpose; partnerId: string; brandId?: string | null }
  | { ok: false; reason: "not_found" | "wrong_purpose" | "revoked" | "expired" };

export function createCatalogAccessToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashCatalogAccessToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function evaluateCatalogAccessToken(
  record: CatalogAccessTokenRecord | null,
  expectedPurpose: CatalogTokenPurpose,
  now = new Date()
): CatalogTokenValidation {
  if (!record) return { ok: false, reason: "not_found" };
  if (record.purpose !== expectedPurpose) return { ok: false, reason: "wrong_purpose" };
  if (record.status === "revoked" || record.revokedAt) return { ok: false, reason: "revoked" };
  if (record.status === "expired" || (record.expiresAt && record.expiresAt.getTime() <= now.getTime())) {
    return { ok: false, reason: "expired" };
  }
  if (record.status !== "active") return { ok: false, reason: "revoked" };
  return {
    ok: true,
    purpose: expectedPurpose,
    partnerId: record.partnerId,
    brandId: record.brandId ?? null,
  };
}

export function buildRevokedTokenPatch(revokedBy: string, reason: string, now = new Date()) {
  return {
    status: "revoked" as const,
    revokedAt: now,
    revokedBy,
    revocationReason: reason,
  };
}

export function buildRegeneratedTokenInput(input: {
  /** Null on a brand's first link; set on every rotation after that (KEWL-2460). */
  oldTokenId: string | null;
  token: string;
  purpose: CatalogTokenPurpose;
  partnerId: string;
  brandId?: string | null;
  catalogItemId?: string | null;
  issuedToType: "staff" | "brand";
  issuedToId?: string | null;
  issuedToEmail?: string | null;
  issuedBy?: string | null;
  expiresAt?: Date | null;
}) {
  return {
    tokenHash: hashCatalogAccessToken(input.token),
    purpose: input.purpose,
    status: "active",
    partnerId: input.partnerId,
    brandId: input.brandId ?? null,
    catalogItemId: input.catalogItemId ?? null,
    issuedToType: input.issuedToType,
    issuedToId: input.issuedToId ?? null,
    issuedToEmail: input.issuedToEmail ?? null,
    issuedBy: input.issuedBy ?? null,
    expiresAt: input.expiresAt ?? null,
    regeneratedFromId: input.oldTokenId ?? null,
  };
}
