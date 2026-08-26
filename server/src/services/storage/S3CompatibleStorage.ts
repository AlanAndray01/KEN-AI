import { createHash, createHmac } from "node:crypto";
import { AppError } from "../../utils/AppError.js";
import type { PutObjectInput, StorageProviderId, StorageService, StoredObject } from "./StorageService.js";

interface S3CompatibleOptions {
  provider: Extract<StorageProviderId, "s3" | "r2">;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
  endpoint?: string;
  publicUrl?: string;
}

export class S3CompatibleStorage implements StorageService {
  readonly provider: Extract<StorageProviderId, "s3" | "r2">;

  constructor(private readonly options: S3CompatibleOptions) {
    this.provider = options.provider;
  }

  publicUrlFor(key: string): string | undefined {
    if (!this.options.publicUrl) return undefined;
    return `${this.options.publicUrl.replace(/\/$/, "")}/${encodeURI(key)}`;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const response = await this.request("PUT", input.key, input.buffer, input.mimeType);
    if (!response.ok) {
      throw new AppError("Object storage upload failed.", { statusCode: 502, code: "STORAGE_ERROR" });
    }
    return { key: input.key, size: input.buffer.length, mimeType: input.mimeType };
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.request("GET", key);
    if (response.status === 404) {
      throw new AppError("File not found", { statusCode: 404, code: "FILE_NOT_FOUND" });
    }
    if (!response.ok) {
      throw new AppError("Object storage read failed.", { statusCode: 502, code: "STORAGE_ERROR" });
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await this.request("DELETE", key);
  }

  async exists(key: string): Promise<boolean> {
    const response = await this.request("HEAD", key);
    return response.ok;
  }

  private async request(method: string, key: string, body?: Buffer, mimeType?: string): Promise<Response> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const host = this.host();
    const canonicalUri = `/${this.options.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const payloadHash = createHash("sha256").update(body ?? "").digest("hex");
    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (mimeType && method === "PUT") {
      headers["content-type"] = mimeType;
    }
    const signedHeaderNames = Object.keys(headers)
      .map((name) => name.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("");
    const signedHeaders = signedHeaderNames.join(";");
    const canonicalRequest = [
      method,
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/${this.options.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");
    const signingKey = this.signingKey(dateStamp);
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.options.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const url = `${this.baseUrl()}${canonicalUri}`;
    return fetch(url, {
      method,
      headers,
      ...(body ? { body } : {}),
    });
  }

  private host(): string {
    if (this.options.endpoint) {
      return new URL(this.options.endpoint).host;
    }
    return `${this.options.bucket}.s3.${this.options.region}.amazonaws.com`;
  }

  private baseUrl(): string {
    if (this.options.endpoint) {
      return this.options.endpoint.replace(/\/$/, "");
    }
    return `https://s3.${this.options.region}.amazonaws.com`;
  }

  private signingKey(dateStamp: string): Buffer {
    const kDate = createHmac("sha256", `AWS4${this.options.secretKey}`).update(dateStamp).digest();
    const kRegion = createHmac("sha256", kDate).update(this.options.region).digest();
    const kService = createHmac("sha256", kRegion).update("s3").digest();
    return createHmac("sha256", kService).update("aws4_request").digest();
  }
}
