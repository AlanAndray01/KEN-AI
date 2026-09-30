import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../config/logger.js";
import { missingStorageSettings, normalizeStorageEndpoint } from "./index.js";
import { S3CompatibleStorage } from "./S3CompatibleStorage.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("normalizeStorageEndpoint", () => {
  it("drops the bucket Cloudflare shows on the end of the S3 API address", () => {
    expect(normalizeStorageEndpoint("https://abc123.r2.cloudflarestorage.com/ken-uploads", "ken-uploads")).toBe(
      "https://abc123.r2.cloudflarestorage.com",
    );
  });

  it("leaves a plain account endpoint alone, trailing slash or not", () => {
    expect(normalizeStorageEndpoint("https://abc123.r2.cloudflarestorage.com/", "ken-uploads")).toBe(
      "https://abc123.r2.cloudflarestorage.com",
    );
  });
});

describe("missingStorageSettings", () => {
  it("needs nothing for local disk", () => {
    expect(missingStorageSettings({ STORAGE_PROVIDER: "local" })).toEqual([]);
  });

  it("names every missing R2 setting, including the account endpoint", () => {
    expect(missingStorageSettings({ STORAGE_PROVIDER: "r2", STORAGE_BUCKET: "ken-uploads" })).toEqual([
      "STORAGE_ACCESS_KEY",
      "STORAGE_SECRET_KEY",
      "STORAGE_ENDPOINT",
    ]);
  });

  it("is satisfied by a complete R2 configuration", () => {
    expect(
      missingStorageSettings({
        STORAGE_PROVIDER: "r2",
        STORAGE_BUCKET: "b",
        STORAGE_ACCESS_KEY: "k",
        STORAGE_SECRET_KEY: "s",
        STORAGE_ENDPOINT: "https://abc123.r2.cloudflarestorage.com",
      }),
    ).toEqual([]);
  });
});

describe("S3CompatibleStorage against R2", () => {
  const storage = new S3CompatibleStorage({
    provider: "r2",
    bucket: "ken-uploads",
    accessKey: "access-key-id",
    secretKey: "very-secret-value",
    region: "auto",
    endpoint: "https://abc123.r2.cloudflarestorage.com",
  });

  it("uploads to the bucket path on the account endpoint, signed for region auto", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await storage.put({ key: "user1/file-1", buffer: Buffer.from("hi"), mimeType: "text/plain" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://abc123.r2.cloudflarestorage.com/ken-uploads/user1/file-1");
    expect(init.headers.authorization).toMatch(/Credential=access-key-id\/\d{8}\/auto\/s3\/aws4_request/);
    expect(init.headers.authorization).not.toContain("very-secret-value");
  });

  it("logs the store's own reason for a refusal, without any credential", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            "<Error><Code>SignatureDoesNotMatch</Code><Message>The request signature we calculated does not match</Message></Error>",
            { status: 403 },
          ),
      ),
    );
    const logged = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);

    await expect(
      storage.put({ key: "user1/file-1", buffer: Buffer.from("hi"), mimeType: "text/plain" }),
    ).rejects.toMatchObject({ code: "STORAGE_ERROR" });
    const [details] = logged.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(details).toMatchObject({ status: 403, storageErrorCode: "SignatureDoesNotMatch", method: "PUT" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("very-secret-value");
  });
});
