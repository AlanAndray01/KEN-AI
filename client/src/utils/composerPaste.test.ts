import { describe, expect, it } from "vitest";
import { fileIdentityKey, filesFromClipboard } from "./composerPaste";

function clipboard(files: File[], extraFiles: File[] = files): DataTransfer {
  return {
    items: files.map((file) => ({ kind: "file" as const, getAsFile: () => file })),
    files: extraFiles,
    getData: () => "",
  } as unknown as DataTransfer;
}

describe("filesFromClipboard", () => {
  it("keeps one file when items and files disagree only on lastModified", () => {
    const fromItems = new File(["png"], "image.png", { type: "image/png", lastModified: 1 });
    const fromList = new File(["png"], "image.png", { type: "image/png", lastModified: Date.now() });
    const result = filesFromClipboard(clipboard([fromItems], [fromList]));
    expect(result).toHaveLength(1);
    expect(fileIdentityKey(fromItems)).toBe(fileIdentityKey(fromList));
  });
});
