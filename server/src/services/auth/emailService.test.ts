import { afterEach, describe, expect, it, vi } from "vitest";

describe("emailService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("skips sending when Resend is not configured", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: { NODE_ENV: "development", RESEND_API_KEY: undefined, RESEND_FROM_EMAIL: undefined, EMAIL_FROM: undefined },
    }));
    const info = vi.fn();
    vi.doMock("../../config/logger.js", () => ({ logger: { info, warn: vi.fn() } }));

    const { sendPasswordResetEmail } = await import("./emailService.js");
    await expect(sendPasswordResetEmail("ada@example.com", "123456")).resolves.toBe(false);
    expect(info).toHaveBeenCalledWith({ passwordReset: "email_not_configured" }, "Password reset email skipped");
  });

  it("skips verification email when Resend is not configured", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: { NODE_ENV: "development", RESEND_API_KEY: undefined, RESEND_FROM_EMAIL: undefined, EMAIL_FROM: undefined },
    }));
    const info = vi.fn();
    vi.doMock("../../config/logger.js", () => ({ logger: { info, warn: vi.fn() } }));

    const { sendVerificationEmail } = await import("./emailService.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(sendVerificationEmail("ada@example.com", "123456")).resolves.toBe(false);
    expect(info).toHaveBeenCalledWith({ emailVerification: "email_not_configured" }, "Verification email skipped");
    log.mockRestore();
  });

  it("uses the development From address when only the API key is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "development",
        RESEND_API_KEY: "re_test_key",
        RESEND_FROM_EMAIL: undefined,
        EMAIL_FROM: undefined,
      },
    }));
    vi.doMock("../../config/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

    const { sendVerificationEmail, DEFAULT_DEV_FROM } = await import("./emailService.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(sendVerificationEmail("ada@example.com", "654321")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { from: string; to: string[] };
    expect(body.from).toBe(DEFAULT_DEV_FROM);
    expect(body.to).toEqual(["ada@example.com"]);
    log.mockRestore();
  });

  it("logs the Resend error body when delivery fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ message: "You can only send testing emails to your own email address." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "development",
        RESEND_API_KEY: "re_test_key",
        EMAIL_FROM: "Ken <onboarding@resend.dev>",
      },
    }));
    vi.doMock("../../config/logger.js", () => ({ logger: { info: vi.fn(), warn } }));

    const { sendVerificationEmail } = await import("./emailService.js");
    await expect(sendVerificationEmail("other@example.com", "111111")).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerification: "email_failed", status: 403 }),
      "Verification email failed",
    );
    expect(log).toHaveBeenCalledWith("🔑 VERIFICATION CODE FOR", "other@example.com", ":", "111111");
    log.mockRestore();
  });
});
