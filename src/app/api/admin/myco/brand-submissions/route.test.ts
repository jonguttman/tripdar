import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  brandSubmission: { findMany: vi.fn() },
}));

const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue({ user: { email: "admin@test.dev" } });
});

describe("brand submission review queue", () => {
  it("refuses unauthenticated access", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("diffs submitted product fields against the current catalog value", async () => {
    prismaMock.brandSubmission.findMany.mockResolvedValue([
      {
        id: "submission-1",
        status: "pending",
        createdAt: new Date("2026-07-31T12:00:00Z"),
        reviewedAt: null,
        reviewedBy: null,
        partner: { id: "partner-1", name: "The Mushroom Top" },
        brand: {
          id: "brand-1",
          name: "Focus Labs",
          slug: "focus-labs",
          logoUrl: null,
          artworkUrl: null,
          shortDescription: null,
          websiteUrl: null,
          supportEmail: null,
          primaryColor: null,
          secondaryColor: null,
          accentColor: null,
          socialHandles: {},
        },
        catalogItem: {
          id: "item-1",
          productName: "Old Caps",
          sku: "OLD-1",
          format: "capsule",
          productUnitMg: 100,
          unitsPerPack: 20,
          ingredients: [],
          flavors: [],
          onsetMinutes: 45,
          durationMinutes: 180,
          brandDoseInstructions: null,
          active: true,
        },
        submitterName: "Dana Reyes",
        submitterRole: "Ops",
        contactPermission: true,
        preferredContactMethod: "email",
        contactHandle: "dana@example.test",
        consentToContactAt: new Date("2026-07-31T12:00:00Z"),
        imageUsageGrant: true,
        imageUsageGrantedAt: new Date("2026-07-31T12:00:00Z"),
        imageUsageGrantedBy: "Dana Reyes",
        payload: { brandFields: {}, brandAssets: {}, missingProducts: [] },
        fieldChanges: [
          {
            id: "change-1",
            fieldName: "productUnitMg",
            previousValue: 100,
            submittedValue: 125,
            disposition: "pending",
            dispositionBy: null,
            dispositionAt: null,
            dispositionReason: null,
            createdAt: new Date("2026-07-31T12:00:00Z"),
          },
        ],
        photos: [],
      },
    ]);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.submissions[0].productFields[0]).toEqual(
      expect.objectContaining({
        fieldName: "productUnitMg",
        currentValue: 100,
        submittedValue: 125,
        disposition: "pending",
      }),
    );
  });

  it("keeps missing-product submissions visible without an existing catalog item", async () => {
    prismaMock.brandSubmission.findMany.mockResolvedValue([
      {
        id: "submission-2",
        status: "pending",
        createdAt: new Date("2026-07-31T12:00:00Z"),
        reviewedAt: null,
        reviewedBy: null,
        partner: { id: "partner-1", name: "The Mushroom Top" },
        brand: {
          id: "brand-1",
          name: "Focus Labs",
          slug: "focus-labs",
          logoUrl: null,
          artworkUrl: null,
          shortDescription: null,
          websiteUrl: null,
          supportEmail: null,
          primaryColor: null,
          secondaryColor: null,
          accentColor: null,
          socialHandles: {},
        },
        catalogItem: null,
        submitterName: "Dana Reyes",
        submitterRole: "Ops",
        contactPermission: false,
        preferredContactMethod: null,
        contactHandle: null,
        consentToContactAt: null,
        imageUsageGrant: false,
        imageUsageGrantedAt: null,
        imageUsageGrantedBy: null,
        payload: {
          brandFields: {},
          brandAssets: {},
          missingProducts: [{ productName: "New Gummies", format: "edible" }],
        },
        fieldChanges: [],
        photos: [],
      },
    ]);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.submissions[0].catalogItem).toBeNull();
    expect(json.data.submissions[0].missingProducts).toEqual([
      { productName: "New Gummies", format: "edible" },
    ]);
  });
});
