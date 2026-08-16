import { describe, expect, it } from "vitest";
import { APP_NAME, API_ROUTES, USER_ROLES } from "./index.js";

describe("shared constants", () => {
  it("uses the Aether product name", () => {
    expect(APP_NAME).toBe("Aether");
  });

  it("defines user and admin roles", () => {
    expect(USER_ROLES).toEqual(["user", "admin"]);
  });

  it("exposes provider and model API routes", () => {
    expect(API_ROUTES.models).toBe("/models");
    expect(API_ROUTES.providers).toBe("/providers");
    expect(API_ROUTES.admin.providers).toBe("/admin/providers");
    expect(API_ROUTES.me.providerCredentials).toBe("/me/provider-credentials");
    expect(API_ROUTES.conversations).toBe("/conversations");
    expect(API_ROUTES.chat).toBe("/chat");
    expect(API_ROUTES.files).toBe("/files");
    expect(API_ROUTES.tools).toBe("/tools");
    expect(API_ROUTES.voice).toBe("/voice");
    expect(API_ROUTES.analysis).toBe("/analysis");
    expect(API_ROUTES.memories).toBe("/memories");
    expect(API_ROUTES.gpts).toBe("/gpts");
    expect(API_ROUTES.me.instructions).toBe("/me/instructions");
    expect(API_ROUTES.share).toBe("/share");
    expect(API_ROUTES.notifications).toBe("/notifications");
    expect(API_ROUTES.admin.usage).toBe("/admin/usage");
    expect(API_ROUTES.me.usage).toBe("/me/usage");
  });
});
