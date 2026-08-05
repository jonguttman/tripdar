import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prepareMock = vi.hoisted(() => vi.fn());

vi.mock("@/domain/auth/adminSession", () => ({
  getAdminSession: vi.fn(async () => ({ user: { email: "admin@example.com" } })),
}));

vi.mock("@/domain/myco/staffReviewInvitations", () => ({
  prepareCanonicalStaffReviewInvitationBatch: prepareMock,
}));

async function post(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  const request = new NextRequest("https://tripdar.test/api/admin/myco/staff-invitations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request);
}

describe("admin staff invitation preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareMock.mockResolvedValue({ status: "UNSENT DRAFT", send: false, recipients: [] });
  });

  it("refuses send=true before preparing anything", async () => {
    const response = await post({ partnerId: "partner-tmt", send: true });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error.code).toBe("send_not_authorized");
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("prepares only an unsent draft batch", async () => {
    const response = await post({ partnerId: "partner-tmt", send: false });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data).toMatchObject({ status: "UNSENT DRAFT", send: false });
    expect(prepareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: "partner-tmt",
        issuedBy: "admin@example.com",
        qaOnly: false,
      })
    );
  });

  it("passes qaOnly through for sink-address QA invitation generation", async () => {
    const response = await post({ partnerId: "partner-qa", send: false, qaOnly: true });

    expect(response.status).toBe(201);
    expect(prepareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: "partner-qa",
        issuedBy: "admin@example.com",
        qaOnly: true,
      })
    );
  });
});
