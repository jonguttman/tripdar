import { describe, expect, it } from "vitest";
import {
  buildRegeneratedTokenInput,
  buildRevokedTokenPatch,
  createCatalogAccessToken,
  evaluateCatalogAccessToken,
  hashCatalogAccessToken,
} from "./catalogTokens";

describe("catalog access tokens", () => {
  it("creates and hashes no-login tokens without storing plaintext", () => {
    const token = createCatalogAccessToken();
    const hash = hashCatalogAccessToken(token);

    expect(token.length).toBeGreaterThan(32);
    expect(hash).not.toBe(token);
    expect(hash).toBe(hashCatalogAccessToken(token));
  });

  it("rejects revoked and expired token records", () => {
    const now = new Date("2026-07-28T16:00:00Z");

    expect(
      evaluateCatalogAccessToken(
        {
          status: "revoked",
          purpose: "brand_portal",
          partnerId: "partner-a",
          brandId: "brand-a",
          expiresAt: null,
          revokedAt: now,
        },
        "brand_portal",
        now
      )
    ).toEqual({ ok: false, reason: "revoked" });

    expect(
      evaluateCatalogAccessToken(
        {
          status: "active",
          purpose: "brand_portal",
          partnerId: "partner-a",
          brandId: "brand-a",
          expiresAt: new Date("2026-07-28T15:59:59Z"),
        },
        "brand_portal",
        now
      )
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("builds revocation and regeneration writes explicitly", () => {
    const now = new Date("2026-07-28T16:00:00Z");
    const revoked = buildRevokedTokenPatch("admin@example.com", "regenerated", now);
    const regenerated = buildRegeneratedTokenInput({
      oldTokenId: "old-token",
      token: "new-token",
      purpose: "brand_portal",
      partnerId: "partner-a",
      brandId: "brand-a",
      issuedToType: "brand",
      issuedToEmail: "brand@example.com",
      expiresAt: null,
    });

    expect(revoked).toMatchObject({ status: "revoked", revokedBy: "admin@example.com" });
    expect(regenerated.regeneratedFromId).toBe("old-token");
    expect(regenerated.tokenHash).toBe(hashCatalogAccessToken("new-token"));
    expect(regenerated.tokenHash).not.toBe("new-token");
  });
});
