/**
 * Brand portal submission endpoint — the acceptance gaps from the PR #30 review
 * (KEWL-2390), exercised through the real handler rather than the parser alone.
 *
 * The parser tests in `src/domain/myco/brandPortal.test.ts` prove the rules; these
 * prove the route actually enforces them, persists a clear the review queue can
 * read, and builds a receipt that names what we recorded.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { signBrandAssetHandle } from "@/domain/myco/brandPortalAssets";

const prismaMock = vi.hoisted(() => ({
  brandSubmission: { create: vi.fn() },
  catalogFieldChange: { createMany: vi.fn() },
  productPhoto: { createMany: vi.fn() },
  $transaction: vi.fn(),
}));

const loadBrandPortalContextMock = vi.hoisted(() => vi.fn());
const markTokenOpenedMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/domain/myco/brandPortalData", () => ({
  loadBrandPortalContext: loadBrandPortalContextMock,
  markTokenOpened: markTokenOpenedMock,
}));

let POST: typeof import("./route").POST;

beforeAll(async () => {
  // The handle signer reads this at call time; a stable secret keeps the signed
  // upload handles in these tests verifiable by the route that receives them.
  process.env.NEXTAUTH_SECRET ??= "test-brand-portal-secret";
  ({ POST } = await import("./route"));
});

const BRAND_ID = "brand-1";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    productName: "Focus Caps",
    format: "capsule",
    sku: "SKU-123",
    productUnitMg: 250,
    unitsPerPack: 30,
    ingredients: ["Lion's Mane"],
    flavors: [],
    onsetMinutes: 45,
    durationMinutes: 240,
    brandDoseInstructions: "Take one with food",
    active: true,
    photos: [],
    missingFields: [],
    ...overrides,
  };
}

function context() {
  return {
    ok: true,
    context: {
      tokenId: "token-1",
      partnerId: "partner-1",
      brand: {
        id: BRAND_ID,
        name: "Micro Mind",
        slug: "micro-mind",
        logoUrl: null,
        artworkUrl: null,
        primaryColor: null,
        secondaryColor: null,
        accentColor: null,
        shortDescription: null,
        websiteUrl: "https://old.example",
        supportEmail: null,
        socialHandles: {},
      },
      products: [product()],
      lastSubmissionAt: null,
    },
  };
}

function contact(overrides: Record<string, unknown> = {}) {
  return {
    submitterName: "Dana Reyes",
    submitterRole: "Head of Ops",
    contactPermission: true,
    preferredContactMethod: "email",
    contactHandle: "dana@brand.test",
    ...overrides,
  };
}

function handleFor(overrides: Record<string, unknown> = {}) {
  return signBrandAssetHandle({
    brandId: BRAND_ID,
    kind: "product_photo",
    tag: "package_front",
    catalogItemId: "item-1",
    url: "https://blob.test/original.jpg",
    displayUrl: "https://blob.test/display.jpg",
    originalFilename: "front-of-box.jpg",
    contentType: "image/jpeg",
    size: 1024,
    width: 1200,
    height: 1200,
    issuedAt: Date.now(),
    ...overrides,
  } as Parameters<typeof signBrandAssetHandle>[0]);
}

async function post(body: Record<string, unknown>) {
  const request = new Request("https://tripdar.test/api/myco/brand-portal/token-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request as never, { params: Promise.resolve({ token: "token-1" }) });
}

/** The rows the handler asked the change log to write. */
function writtenChanges() {
  return prismaMock.catalogFieldChange.createMany.mock.calls[0]?.[0]?.data ?? [];
}

describe("brand portal submission route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadBrandPortalContextMock.mockResolvedValue(context());
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        brandSubmission: prismaMock.brandSubmission,
        catalogFieldChange: prismaMock.catalogFieldChange,
        productPhoto: prismaMock.productPhoto,
      }),
    );
    prismaMock.brandSubmission.create.mockResolvedValue({ id: "submission-1" });
    prismaMock.catalogFieldChange.createMany.mockResolvedValue({ count: 1 });
    prismaMock.productPhoto.createMany.mockResolvedValue({ count: 1 });
    sendEmailMock.mockResolvedValue(undefined);
  });

  // Gap 3 — the negative case the review called the one with legal exposure.
  describe("image usage grant", () => {
    it("rejects an upload submitted without the grant, and writes nothing", async () => {
      const response = await post({
        contact: contact(),
        imageUsageGrant: false,
        uploadIds: [handleFor()],
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error.field).toBe("imageUsageGrant");
      expect(prismaMock.brandSubmission.create).not.toHaveBeenCalled();
      expect(prismaMock.productPhoto.createMany).not.toHaveBeenCalled();
    });

    it("rejects an upload when the grant is simply absent", async () => {
      const response = await post({ contact: contact(), uploadIds: [handleFor()] });
      expect(response.status).toBe(400);
      expect(prismaMock.productPhoto.createMany).not.toHaveBeenCalled();
    });

    it("stores the photo once the grant is given, stamped with who granted it", async () => {
      const response = await post({
        contact: contact(),
        imageUsageGrant: true,
        uploadIds: [handleFor()],
      });

      expect(response.status).toBe(201);
      const photos = prismaMock.productPhoto.createMany.mock.calls[0][0].data;
      expect(photos).toHaveLength(1);
      expect(photos[0].provenance.imageUsageGrant).toBe(true);
      expect(prismaMock.brandSubmission.create.mock.calls[0][0].data.imageUsageGrantedBy).toContain(
        "Dana Reyes",
      );
    });
  });

  // Gap 1 — an emptied box has to become a pending change the review queue can act on.
  describe("clearing a value", () => {
    it("writes a pending change whose submitted value is an explicit JSON null", async () => {
      const response = await post({
        contact: contact(),
        products: [{ catalogItemId: "item-1", sku: "" }],
      });

      expect(response.status).toBe(201);
      const changes = writtenChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].fieldName).toBe("sku");
      expect(changes[0].previousValue).toBe("SKU-123");
      // JSON null — "empty this field" — not SQL NULL, which means "we held nothing".
      expect(changes[0].submittedValue).toBe(Prisma.JsonNull);
      expect(changes[0].disposition).toBe("pending");
    });

    it("reports the count back to the client so the clear is not silent", async () => {
      const response = await post({
        contact: contact(),
        products: [{ catalogItemId: "item-1", brandDoseInstructions: "" }],
      });
      const json = await response.json();
      expect(json.data.fieldChanges).toBe(1);
    });

    it("clears a brand-level field too", async () => {
      await post({ contact: contact(), brandFields: { websiteUrl: "" } });
      const payload = prismaMock.brandSubmission.create.mock.calls[0][0].data.payload;
      expect(payload.brandFields.websiteUrl).toBeNull();
    });

    it("does not invent a change when the field was already empty", async () => {
      const response = await post({
        contact: contact(),
        products: [{ catalogItemId: "item-1", sku: "" }, { catalogItemId: "item-1", flavors: "" }],
      });
      expect(response.status).toBe(201);
      // `flavors` was already [], so only the sku clear is a real change.
      expect(writtenChanges().map((change: { fieldName: string }) => change.fieldName)).toEqual([
        "sku",
      ]);
    });
  });

  describe("internal notification", () => {
    it("notifies Jon and Scotty after saving a submission even when no receipt address exists", async () => {
      const response = await post({
        contact: {
          submitterName: "Dana Reyes",
          submitterRole: "Head of Ops",
          contactPermission: false,
        },
        products: [{ catalogItemId: "item-1", productUnitMg: 300 }],
      });

      expect(response.status).toBe(201);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["jonguttman@gmail.com", "scottyclaw@gmail.com"],
          subject: "Brand submission ready for review: Micro Mind",
          text: expect.stringContaining("Review queue: https://tripdar.test/admin/myco/brand-submissions"),
        }),
      );
    });
  });

  // Gap 2 — the input used to accept files the backend then discarded.
  describe("single brand logo and artwork", () => {
    it("refuses a second logo rather than silently orphaning it", async () => {
      const response = await post({
        contact: contact(),
        imageUsageGrant: true,
        uploadIds: [
          handleFor({ kind: "brand_logo", tag: null, catalogItemId: null, originalFilename: "a.png" }),
          handleFor({ kind: "brand_logo", tag: null, catalogItemId: null, originalFilename: "b.png" }),
        ],
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error.message).toMatch(/only one brand logo/i);
      expect(prismaMock.brandSubmission.create).not.toHaveBeenCalled();
    });

    it("accepts one logo alongside one artwork", async () => {
      const response = await post({
        contact: contact(),
        imageUsageGrant: true,
        uploadIds: [
          handleFor({ kind: "brand_logo", tag: null, catalogItemId: null, originalFilename: "logo.svg" }),
          handleFor({
            kind: "brand_artwork",
            tag: null,
            catalogItemId: null,
            originalFilename: "key-visual.png",
          }),
        ],
      });

      expect(response.status).toBe(201);
      const payload = prismaMock.brandSubmission.create.mock.calls[0][0].data.payload;
      expect(payload.brandAssets.logo.filename).toBe("logo.svg");
      expect(payload.brandAssets.artwork.filename).toBe("key-visual.png");
    });

    it("still allows many photos on one product", async () => {
      const response = await post({
        contact: contact(),
        imageUsageGrant: true,
        uploadIds: [
          handleFor({ originalFilename: "front.jpg" }),
          handleFor({ tag: "package_back", originalFilename: "back.jpg" }),
        ],
      });

      expect(response.status).toBe(201);
      expect(prismaMock.productPhoto.createMany.mock.calls[0][0].data).toHaveLength(2);
    });
  });

  // Gap 4 — universal receipt, and one that states exactly what we recorded.
  describe("acknowledgement", () => {
    it("sends when follow-up goes to Signal, using the receipt address", async () => {
      const response = await post({
        contact: contact({
          preferredContactMethod: "signal",
          contactHandle: "+15550001234",
          receiptEmail: "dana@brand.test",
        }),
        products: [{ catalogItemId: "item-1", sku: "SKU-999" }],
      });

      expect((await response.json()).data.acknowledgmentSent).toBe(true);
      expect(sendEmailMock.mock.calls[0][0].to).toBe("dana@brand.test");
    });

    it("sends even when follow-up contact is declined", async () => {
      await post({
        contact: {
          submitterName: "Dana Reyes",
          submitterRole: "Head of Ops",
          contactPermission: false,
          receiptEmail: "dana@brand.test",
        },
        products: [{ catalogItemId: "item-1", sku: "SKU-999" }],
      });

      expect(sendEmailMock).toHaveBeenCalledTimes(2);
      expect(sendEmailMock.mock.calls[0][0].to).toBe("dana@brand.test");
    });

    it("names every uploaded file rather than counting them", async () => {
      await post({
        contact: contact(),
        imageUsageGrant: true,
        uploadIds: [
          handleFor({ originalFilename: "front-of-box.jpg" }),
          handleFor({ tag: "package_back", originalFilename: "back-panel.jpg" }),
          handleFor({ kind: "brand_logo", tag: null, catalogItemId: null, originalFilename: "logo.svg" }),
        ],
      });

      const { text, html } = sendEmailMock.mock.calls[0][0];
      for (const filename of ["front-of-box.jpg", "back-panel.jpg", "logo.svg"]) {
        expect(text).toContain(filename);
        expect(html).toContain(filename);
      }
    });

    it("includes the full missing-product report, not just its name", async () => {
      await post({
        contact: contact(),
        missingProducts: [
          {
            productName: "Night Caps",
            format: "capsule",
            productUnitMg: 100,
            unitsPerPack: 20,
            note: "Launched in June",
          },
        ],
      });

      const { text } = sendEmailMock.mock.calls[0][0];
      expect(text).toContain("Night Caps");
      expect(text).toContain("Format: capsule");
      expect(text).toContain("mg per unit: 100");
      expect(text).toContain("Units per pack: 20");
      expect(text).toContain("Note: Launched in June");
    });

    it("says nothing about image permission when no images were sent", async () => {
      await post({ contact: contact(), products: [{ catalogItemId: "item-1", sku: "SKU-999" }] });
      expect(sendEmailMock.mock.calls[0][0].text).not.toMatch(/image display permission/i);
    });

    it("confirms the display grant when images were sent", async () => {
      await post({ contact: contact(), imageUsageGrant: true, uploadIds: [handleFor()] });
      expect(sendEmailMock.mock.calls[0][0].text).toMatch(
        /granted us permission to display the images/i,
      );
    });

    it("shows a cleared field as cleared rather than as an em dash", async () => {
      await post({ contact: contact(), products: [{ catalogItemId: "item-1", sku: "" }] });
      expect(sendEmailMock.mock.calls[0][0].text).toContain("SKU: SKU-123 -> (cleared)");
    });

    it("skips the submitter receipt when we hold no email at all, without failing the submission", async () => {
      const response = await post({
        contact: contact({ preferredContactMethod: "signal", contactHandle: "+15550001234" }),
        products: [{ catalogItemId: "item-1", sku: "SKU-999" }],
      });

      expect(response.status).toBe(201);
      expect((await response.json()).data.acknowledgmentSent).toBe(false);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock.mock.calls[0][0].to).toEqual([
        "jonguttman@gmail.com",
        "scottyclaw@gmail.com",
      ]);
    });

    it("keeps the submission when the receipt fails to send", async () => {
      sendEmailMock.mockRejectedValue(new Error("smtp down"));

      const response = await post({
        contact: contact(),
        products: [{ catalogItemId: "item-1", sku: "SKU-999" }],
      });

      expect(response.status).toBe(201);
      expect((await response.json()).data.acknowledgmentSent).toBe(false);
      expect(prismaMock.brandSubmission.create).toHaveBeenCalled();
    });
  });
});
