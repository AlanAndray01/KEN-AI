import { describe, expect, it, vi } from "vitest";

/**
 * gatewayBaseUrl reads env through the parsed config object, so each case
 * re-imports the module with the environment it needs.
 */
async function loadWith(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const module = await import("./aiGateway.js");
  return {
    module,
    restore: () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

describe("AI Gateway routing", () => {
  it("stays off until a gateway token is configured", async () => {
    const { module, restore } = await loadWith({
      CF_ACCOUNT_ID: "acct123",
      CF_AI_GATEWAY_TOKEN: undefined,
    });
    // The whole point of the switch: without a token every provider keeps the
    // direct endpoint it is already known to work against.
    expect(module.gatewayEnabled()).toBe(false);
    expect(module.gatewayBaseUrl("groq")).toBeUndefined();
    restore();
  });

  it("builds the per-provider gateway URL once a token is set", async () => {
    const { module, restore } = await loadWith({
      CF_ACCOUNT_ID: "acct123",
      CF_AI_GATEWAY: "ken-ai-gateway",
      CF_AI_GATEWAY_TOKEN: "aig-token",
    });
    expect(module.gatewayEnabled()).toBe(true);
    expect(module.gatewayBaseUrl("groq")).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct123/ken-ai-gateway/groq",
    );
    // Cloudflare's slug for Gemini is not the name we use for it internally.
    expect(module.gatewayBaseUrl("gemini")).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct123/ken-ai-gateway/google-ai-studio",
    );
    expect(module.gatewayBaseUrl("openrouter")).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct123/ken-ai-gateway/openrouter",
    );
    restore();
  });

  it("leaves providers the gateway has no slug for on their direct endpoint", async () => {
    const { module, restore } = await loadWith({
      CF_ACCOUNT_ID: "acct123",
      CF_AI_GATEWAY_TOKEN: "aig-token",
    });
    // Cloudflare's own models already run on Cloudflare and are addressed on a
    // different path shape; DeepSeek simply has no slug.
    expect(module.gatewayBaseUrl("cloudflare")).toBeUndefined();
    expect(module.gatewayBaseUrl("deepseek")).toBeUndefined();
    restore();
  });

  it("cannot build a gateway URL without an account id", async () => {
    // Set empty rather than deleted: dotenv refills a deleted key from the real
    // .env file, while an empty one is what the schema maps to undefined.
    const { module, restore } = await loadWith({
      CF_ACCOUNT_ID: "",
      CF_AI_GATEWAY_TOKEN: "aig-token",
    });
    expect(module.gatewayEnabled()).toBe(false);
    expect(module.gatewayBaseUrl("groq")).toBeUndefined();
    restore();
  });
});
