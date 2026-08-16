import { describe, expect, it } from "vitest";
import { hasLeakedSecret, redactSensitive } from "./redact.js";

describe("redactSensitive", () => {
  it("removes MongoDB connection strings", () => {
    const input = "Failed to connect to mongodb+srv://user:secret-pass@cluster.example.net/aether";
    const redacted = redactSensitive(input);

    expect(redacted).toContain("mongodb://[redacted]");
    expect(redacted).not.toContain("secret-pass");
    expect(redacted).not.toContain("cluster.example.net");
    expect(hasLeakedSecret(redacted)).toBe(false);
  });

  it("redacts credential assignments", () => {
    const redacted = redactSensitive("MONGODB_URI=mongodb://localhost:27017/aether");
    expect(redacted).toContain("[redacted]");
    expect(redacted).not.toContain("localhost:27017");
  });

  it("redacts Atlas SRV hostnames from driver errors", () => {
    const input = "querySrv ECONNREFUSED _mongodb._tcp.cluster0.example.mongodb.net";
    const redacted = redactSensitive(input);

    expect(redacted).not.toContain("cluster0.example");
    expect(redacted).toContain("[redacted]");
    expect(hasLeakedSecret(redacted)).toBe(false);
  });

  it("redacts bearer tokens, vendor keys, and JWTs", () => {
    const redacted = redactSensitive(
      "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaa.bbbb apiKey=AIzaSyDummyKeyValue12 sk-proj-abcdefghijk",
    );
    expect(redacted).toContain("[redacted]");
    expect(redacted).not.toContain("AIzaSyDummyKeyValue12");
    expect(redacted).not.toContain("sk-proj-abcdefghijk");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });
});
