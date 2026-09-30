import { describe, expect, it } from "vitest";
import { titleForPath } from "./useDocumentTitle";

describe("titleForPath", () => {
  it("names each page instead of the bare app name", () => {
    expect(titleForPath("/")).toBe("Ken AI");
    expect(titleForPath("/privacy")).toBe("Privacy policy · Ken AI");
    expect(titleForPath("/terms")).toBe("Terms of service · Ken AI");
    expect(titleForPath("/chat/abc")).toBe("Chat · Ken AI");
    expect(titleForPath("/gpts/create")).toBe("Create GPT · Ken AI");
  });

  it("names settings and admin sub-pages", () => {
    expect(titleForPath("/settings")).toBe("Settings · Ken AI");
    expect(titleForPath("/settings/models")).toBe("API keys & models · Settings · Ken AI");
    expect(titleForPath("/admin/usage")).toBe("Usage · Admin · Ken AI");
  });

  it("says when a page does not exist", () => {
    expect(titleForPath("/nope")).toBe("Page not found · Ken AI");
    expect(titleForPath("/settings/nope")).toBe("Page not found · Settings · Ken AI");
  });
});
