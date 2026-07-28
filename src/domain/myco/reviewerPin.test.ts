import { describe, expect, it } from "vitest";
import {
  failedAttemptPatch,
  hashPin,
  isLockedOut,
  isTooObviousPin,
  isValidPinFormat,
  MAX_PIN_ATTEMPTS,
  REVIEWER_SESSION_TTL_MS,
  signReviewerSession,
  successfulAttemptPatch,
  verifyPin,
  verifyReviewerSession,
} from "./reviewerPin";

const SECRET = "test-secret-not-a-real-key";

describe("PIN format", () => {
  it("accepts exactly four digits", () => {
    expect(isValidPinFormat("0417")).toBe(true);
    expect(isValidPinFormat("041")).toBe(false);
    expect(isValidPinFormat("04170")).toBe(false);
    expect(isValidPinFormat("04a7")).toBe(false);
    expect(isValidPinFormat(4170)).toBe(false);
    expect(isValidPinFormat(null)).toBe(false);
  });

  it("rejects the PINs that shrink an already small keyspace", () => {
    for (const pin of ["0000", "1111", "9999", "1234", "4321"]) {
      expect(isTooObviousPin(pin)).toBe(true);
    }
    expect(isTooObviousPin("8317")).toBe(false);
  });
});

describe("PIN hashing", () => {
  it("round-trips and rejects the wrong PIN", async () => {
    const stored = await hashPin("8317");
    expect(await verifyPin("8317", stored)).toBe(true);
    expect(await verifyPin("8318", stored)).toBe(false);
  });

  it("never stores the PIN itself, and salts each hash", async () => {
    const a = await hashPin("8317");
    const b = await hashPin("8317");
    expect(a).not.toContain("8317");
    expect(a).not.toBe(b); // distinct salts
    expect(a.startsWith("scrypt$")).toBe(true);
  });

  it("fails closed on a missing or malformed hash", async () => {
    expect(await verifyPin("8317", null)).toBe(false);
    expect(await verifyPin("8317", "")).toBe(false);
    expect(await verifyPin("8317", "notascrypthash")).toBe(false);
    expect(await verifyPin("8317", "bcrypt$1$2$3$4$5")).toBe(false);
  });
});

describe("lockout", () => {
  it("locks the reviewer out at the attempt ceiling", () => {
    let state = { pinFailedAttempts: 0, pinLockedUntil: null as Date | null };
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i += 1) {
      state = { ...state, ...failedAttemptPatch(state) };
      expect(isLockedOut(state)).toBe(false);
    }
    state = { ...state, ...failedAttemptPatch(state) };
    expect(isLockedOut(state)).toBe(true);
  });

  it("clears the counter on success", () => {
    const patch = successfulAttemptPatch();
    expect(patch.pinFailedAttempts).toBe(0);
    expect(patch.pinLockedUntil).toBeNull();
  });

  it("stops being locked out once the window passes", () => {
    const past = { pinFailedAttempts: 0, pinLockedUntil: new Date(Date.now() - 1000) };
    expect(isLockedOut(past)).toBe(false);
  });
});

describe("reviewer session", () => {
  const base = { employeeId: "emp-1", tokenId: "tok-1", issuedAt: Date.now(), secret: SECRET };

  it("verifies a session it signed", () => {
    const value = signReviewerSession(base);
    expect(verifyReviewerSession(value, { tokenId: "tok-1", secret: SECRET })).toEqual({
      ok: true,
      employeeId: "emp-1",
      // Returned so an admin PIN reset can retire sessions signed before it (KEWL-2379).
      issuedAt: base.issuedAt,
    });
  });

  it("will not accept a back-dated issuedAt — it is inside the HMAC'd payload", () => {
    // The reset-revocation check trusts `issuedAt`, so a client must not be able to move it.
    const value = signReviewerSession(base);
    const tampered = value.replace(String(base.issuedAt), String(base.issuedAt - 60_000));

    expect(verifyReviewerSession(tampered, { tokenId: "tok-1", secret: SECRET }).ok).toBe(false);
  });

  it("cannot be replayed on a different staff link", () => {
    const value = signReviewerSession(base);
    expect(verifyReviewerSession(value, { tokenId: "tok-2", secret: SECRET }).ok).toBe(false);
  });

  it("rejects a forged or tampered MAC", () => {
    const value = signReviewerSession(base);
    const tampered = value.replace("emp-1", "emp-2");
    expect(verifyReviewerSession(tampered, { tokenId: "tok-1", secret: SECRET }).ok).toBe(false);
    expect(verifyReviewerSession(`${value}x`, { tokenId: "tok-1", secret: SECRET }).ok).toBe(false);
    expect(verifyReviewerSession(value, { tokenId: "tok-1", secret: "other-secret" }).ok).toBe(false);
  });

  it("expires", () => {
    const old = signReviewerSession({ ...base, issuedAt: Date.now() - REVIEWER_SESSION_TTL_MS - 1 });
    expect(verifyReviewerSession(old, { tokenId: "tok-1", secret: SECRET }).ok).toBe(false);
  });

  it("rejects empty and malformed values", () => {
    for (const value of [null, undefined, "", "a.b.c"]) {
      expect(verifyReviewerSession(value, { tokenId: "tok-1", secret: SECRET }).ok).toBe(false);
    }
  });
});
