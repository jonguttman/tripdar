import { afterEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class Resend {
    constructor(apiKey: string | undefined) {
      if (!apiKey) throw new Error("Missing API key");
    }

    emails = {
      send: sendMock,
    };
  },
}));

describe("sendEmail", () => {
  afterEach(() => {
    sendMock.mockReset();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", undefined);
    vi.resetModules();

    const { sendEmail } = await import("./email");

    await expect(
      sendEmail({
        to: "recipient@example.com",
        subject: "Test email",
        html: "<p>Hello</p>",
      }),
    ).rejects.toThrow(/Missing API key/);
  });

  it("passes a deterministic idempotency key to Resend and returns a typed message id", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    sendMock.mockResolvedValue({ data: { id: "resend-message-1" }, error: null });
    const { sendEmail, providerCredentialFingerprint } = await import("./email");

    const result = await sendEmail({
      to: "recipient@example.com",
      subject: "Test email",
      html: "<p>Hello</p>",
      text: "Hello",
      idempotencyKey: "staff-review-invite:key-1",
    });

    expect(result).toEqual({ messageId: "resend-message-1", provider: "resend" });
    expect(providerCredentialFingerprint("resend")).toMatch(/^[a-f0-9]{64}$/);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["recipient@example.com"],
        replyTo: "scottyclaw@gmail.com",
      }),
      { idempotencyKey: "staff-review-invite:key-1" }
    );
  });
});
