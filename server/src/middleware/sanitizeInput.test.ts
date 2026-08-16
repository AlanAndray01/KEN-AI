import { describe, expect, it } from "vitest";
import { sanitizeInput, sanitizeValue } from "./sanitizeInput.js";

describe("sanitizeValue", () => {
  it("strips Mongo operator keys and null bytes", () => {
    const cleaned = sanitizeValue({
      name: "Ada\u0000",
      $gt: "",
      "profile.name": "nope",
      nested: { $where: "this.password", ok: "yes" },
    }) as Record<string, unknown>;

    expect(cleaned.name).toBe("Ada");
    expect(cleaned.$gt).toBeUndefined();
    expect(cleaned["profile.name"]).toBeUndefined();
    expect((cleaned.nested as Record<string, unknown>).ok).toBe("yes");
    expect((cleaned.nested as Record<string, unknown>).$where).toBeUndefined();
  });
});

describe("sanitizeInput", () => {
  it("sanitizes body, query, and params", () => {
    const req = {
      body: { $ne: "1", title: "Hello" },
      query: { "a.b": "x", q: "search" },
      params: { id: "c1" },
    };
    let called = false;
    sanitizeInput(req as never, {} as never, () => {
      called = true;
    });
    expect(called).toBe(true);
    expect(req.body).toEqual({ title: "Hello" });
    expect(req.query).toEqual({ q: "search" });
    expect(req.params).toEqual({ id: "c1" });
  });
});
