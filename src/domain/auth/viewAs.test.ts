import { describe, expect, it } from "vitest";
import {
  createViewAsCookie,
  isViewAsWriteBlocked,
  readViewAsCookie,
} from "./viewAs";

const SECRET = "test-secret-with-enough-entropy";

describe("View-as cookie", () => {
  it("round-trips a signed target id", async () => {
    const cookie = await createViewAsCookie("user_target", SECRET);
    await expect(readViewAsCookie(cookie, SECRET)).resolves.toBe("user_target");
  });

  it("rejects a client-tampered target id", async () => {
    const cookie = await createViewAsCookie("user_target", SECRET);
    await expect(
      readViewAsCookie(cookie.replace("user_target", "user_attacker"), SECRET)
    ).resolves.toBeNull();
  });

  it("blocks writes, but not reads, only for valid View-as state", async () => {
    const cookie = await createViewAsCookie("user_target", SECRET);

    await expect(
      isViewAsWriteBlocked({ method: "POST", cookieValue: cookie, secret: SECRET })
    ).resolves.toBe(true);
    await expect(
      isViewAsWriteBlocked({ method: "GET", cookieValue: cookie, secret: SECRET })
    ).resolves.toBe(false);
    await expect(
      isViewAsWriteBlocked({
        method: "DELETE",
        cookieValue: `${cookie}tampered`,
        secret: SECRET,
      })
    ).resolves.toBe(false);
  });
});
