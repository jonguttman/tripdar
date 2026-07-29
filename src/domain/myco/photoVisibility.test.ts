/**
 * KEWL-2460 — a pending brand-portal photo must never read as a live asset.
 *
 * The brand portal writes product photos as `pending` ProductPhoto rows and only
 * the staff review queue promotes them. These tests pin the two ways that
 * contract used to leak: photos surfacing to customers, and pending photos
 * satisfying the readiness/activation photo gate.
 */

import { describe, expect, it } from "vitest";

import {
  APPROVED_PHOTO_WHERE,
  approvedPhotoCount,
  approvedPhotoUrl,
  isApprovedPhoto,
  photoStatusLabel,
} from "./photoVisibility";
import { computeReadiness } from "./readiness";

const pendingBrandPhoto = {
  status: "pending",
  submissionSource: "brand",
  url: "https://cdn.test/pending-brand.jpg",
};
const approvedPhoto = { status: "approved", submissionSource: "admin", url: "https://cdn.test/approved.jpg" };
const rejectedPhoto = { status: "rejected", submissionSource: "brand", url: "https://cdn.test/rejected.jpg" };

describe("photo visibility helpers", () => {
  it("treats only approved photos as live", () => {
    expect(isApprovedPhoto(approvedPhoto)).toBe(true);
    expect(isApprovedPhoto(pendingBrandPhoto)).toBe(false);
    expect(isApprovedPhoto(rejectedPhoto)).toBe(false);
  });

  it("excludes pending and rejected rows from the readiness photo count", () => {
    expect(approvedPhotoCount([pendingBrandPhoto, rejectedPhoto])).toBe(0);
    expect(approvedPhotoCount([pendingBrandPhoto, approvedPhoto, rejectedPhoto])).toBe(1);
    expect(approvedPhotoCount([])).toBe(0);
  });

  it("never returns a pending photo URL for display", () => {
    expect(approvedPhotoUrl([pendingBrandPhoto])).toBeNull();
    expect(approvedPhotoUrl([rejectedPhoto])).toBeNull();
    // Query order wins among approved rows; pending rows are skipped entirely.
    expect(approvedPhotoUrl([pendingBrandPhoto, approvedPhoto])).toBe(approvedPhoto.url);
  });

  it("exposes the Prisma filter customer reads must use", () => {
    expect(APPROVED_PHOTO_WHERE).toEqual({ status: "approved" });
  });

  it("labels non-approved rows for the review surfaces that show them", () => {
    expect(photoStatusLabel("pending")).toBe("Pending review");
    expect(photoStatusLabel("rejected")).toBe("Rejected");
    expect(photoStatusLabel("approved")).toBeNull();
  });
});

describe("activation readiness with pending brand photos", () => {
  const baseReadiness = {
    format: "capsule",
    brand: "Test Brand",
    brandId: null,
    productUnitMg: 100,
    unitsPerPack: 10,
    totalDoseMg: 1000,
    onsetMinutes: 30,
    durationMinutes: 240,
    brandMicroUnits: 1,
    brandMiniUnits: 2,
    brandMacroUnits: 5,
    brandDoseTiers: null,
    vibeScores: { clarity_cognition: 0.8 },
    strengthOffset: { offset: "standard", confirmed: true },
  };

  it("still reports the photo as missing when the only photo is a pending brand submission", () => {
    const readiness = computeReadiness({
      ...baseReadiness,
      photoUrl: null,
      photoCount: approvedPhotoCount([pendingBrandPhoto]),
    });

    expect(readiness.missing).toContain("photo");
    expect(readiness.ready).toBe(false);
  });

  it("clears the photo requirement once the review queue approves that photo", () => {
    const readiness = computeReadiness({
      ...baseReadiness,
      photoUrl: null,
      photoCount: approvedPhotoCount([{ ...pendingBrandPhoto, status: "approved" }]),
    });

    expect(readiness.missing).not.toContain("photo");
    expect(readiness.ready).toBe(true);
  });

  it("does not let a rejected photo satisfy the gate", () => {
    const readiness = computeReadiness({
      ...baseReadiness,
      photoUrl: null,
      photoCount: approvedPhotoCount([rejectedPhoto]),
    });

    expect(readiness.missing).toContain("photo");
  });
});
