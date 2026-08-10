import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const afterMock = vi.hoisted(() => vi.fn());
const requestStaffReviewReentryMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: afterMock };
});

vi.mock("@/domain/myco/staffReviewInvitations", () => {
  return {
    STAFF_REVIEW_REENTRY_SUCCESS_MESSAGE:
      "If that address is on the reviewer list, a sign-in link is on its way. It expires in 30 minutes.",
    requestStaffReviewReentry: requestStaffReviewReentryMock,
  };
});

let POST: typeof import("./route").POST;

beforeAll(async () => {
  ({ POST } = await import("./route"));
});

function request(body: unknown) {
  return new NextRequest("https://tripdar.test/api/myco/staff-review/reentry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Vitest",
      "x-forwarded-for": "203.0.113.9",
    },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown) {
  return POST(request(body));
}

function serializedHeaders(response: Response) {
  return [...response.headers.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );
}

describe("staff review re-entry route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns byte-identical 202 responses for matched, unmatched, inactive, and opted-out requests", async () => {
    const sendJob = vi.fn(async () => undefined);
    const success = {
      ok: true,
      status: 202,
      message:
        "If that address is on the reviewer list, a sign-in link is on its way. It expires in 30 minutes.",
    };
    requestStaffReviewReentryMock
      .mockResolvedValueOnce({ ...success, afterResponse: sendJob })
      .mockResolvedValueOnce(success)
      .mockResolvedValueOnce(success)
      .mockResolvedValueOnce(success);

    const responses = await Promise.all([
      post({ email: "sage@thegreenroomonventura.com" }),
      post({ email: "nobody@example.com" }),
      post({ email: "inactive@example.com" }),
      post({ email: "opted-out@example.com" }),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.text()));
    const headers = responses.map(serializedHeaders);

    expect(responses.map((response) => response.status)).toEqual([202, 202, 202, 202]);
    expect(new Set(bodies).size).toBe(1);
    expect(new Set(headers.map((entry) => JSON.stringify(entry))).size).toBe(1);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(sendJob).not.toHaveBeenCalled();

    await afterMock.mock.calls[0][0]();
    expect(sendJob).toHaveBeenCalledTimes(1);
  });

  it("returns 429 with Retry-After when a DB-backed limit is exceeded", async () => {
    requestStaffReviewReentryMock.mockResolvedValue({
      ok: false,
      status: 429,
      code: "too_many_requests",
      message: "You've asked for a few links already. Try again in an hour, or ask Jon.",
      retryAfter: 600,
    });

    const response = await post({ email: "clayton@thehigherpath.com" });
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("600");
    expect(json).toEqual({
      success: false,
      error: {
        code: "too_many_requests",
        message: "You've asked for a few links already. Try again in an hour, or ask Jon.",
      },
    });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("refuses malformed bodies before lookup", async () => {
    const response = await post({ email: "" });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toEqual({
      code: "invalid_request",
      message: "Enter the email address your invitation was sent to.",
    });
    expect(requestStaffReviewReentryMock).not.toHaveBeenCalled();
  });
});
