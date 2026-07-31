import { afterEach, describe, expect, it, vi } from "vitest";

describe("sendEmail", () => {
  afterEach(() => {
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
});
