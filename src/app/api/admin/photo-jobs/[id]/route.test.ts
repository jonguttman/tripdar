import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.hoisted(() => vi.fn());
const getUserRoleMock = vi.hoisted(() => vi.fn());
const decidePhotoJobMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/domain/auth/config", () => ({ authOptions: {} }));
vi.mock("@/domain/auth/role", () => ({ getUserRole: getUserRoleMock }));
vi.mock("@/domain/photo-pipeline/review", () => ({
  decidePhotoJob: decidePhotoJobMock,
  PhotoReviewError: class PhotoReviewError extends Error {
    constructor(message: string, readonly code: string) {
      super(message);
    }
  },
}));

import { PATCH } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/admin/photo-jobs/photo-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const context = { params: Promise.resolve({ id: "photo-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue({ user: { email: "admin@test.dev" } });
  getUserRoleMock.mockResolvedValue("super_admin");
  decidePhotoJobMock.mockResolvedValue({ id: "photo-1", status: "approved" });
});

describe("photo job review route", () => {
  it("requires authentication", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const response = await PATCH(request({ action: "approve" }), context);

    expect(response.status).toBe(401);
    expect(decidePhotoJobMock).not.toHaveBeenCalled();
  });

  it("requires the super-admin role", async () => {
    getUserRoleMock.mockResolvedValue("partner_admin");

    const response = await PATCH(request({ action: "approve" }), context);

    expect(response.status).toBe(403);
    expect(decidePhotoJobMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown action before touching persistence", async () => {
    const response = await PATCH(request({ action: "promote" }), context);

    expect(response.status).toBe(400);
    expect(decidePhotoJobMock).not.toHaveBeenCalled();
  });

  it("passes the authenticated reviewer identity to the domain service", async () => {
    const response = await PATCH(request({ action: "approve" }), context);

    expect(response.status).toBe(200);
    expect(decidePhotoJobMock).toHaveBeenCalledWith({
      id: "photo-1",
      action: "approve",
      reviewerEmail: "admin@test.dev",
    });
  });
});
